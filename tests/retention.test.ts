import { beforeEach, describe, expect, it } from "vitest";
import { RetentionService } from "../src/core/application/index.js";
import type { ProviderSnapshot } from "../src/core/domain/index.js";
import {
  DatabaseManager,
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../src/infra/storage/index.js";

describe("RetentionService", () => {
  let dbManager: DatabaseManager;
  let settingsRepo: SettingsRepository;
  let snapshotRepo: SnapshotRepository;
  let healthRepo: HealthEventRepository;
  let retentionService: RetentionService;

  beforeEach(() => {
    dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    settingsRepo = new SettingsRepository(dbManager.db);
    snapshotRepo = new SnapshotRepository(dbManager.db);
    healthRepo = new HealthEventRepository(dbManager.db);

    retentionService = new RetentionService({
      settingsRepo,
      snapshotRepo,
      healthRepo,
    });
  });

  it("prunes expired snapshots and health events while preserving is_last_good", () => {
    const now = new Date("2026-09-15T08:00:00.000Z");
    const dayMs = 24 * 60 * 60 * 1000;

    const baseSnapshot: ProviderSnapshot = {
      id: "provider-a",
      display_name: "Provider A",
      installed: true,
      auth_state: "authenticated",
      usage_capability: "supported",
      status: "ok",
      source: "fixture",
      fetch_started_at: "2026-01-01T00:00:00.000Z",
      fetched_at: "2026-01-01T00:00:00.000Z",
      stale: false,
      limits: [
        {
          id: "primary",
          category: "rolling_window",
          used_percent: 10,
          remaining_percent: 90,
        },
      ],
      errors: [],
    };

    // 1. Snapshot 120 days ago (superseded)
    snapshotRepo.saveSnapshot({
      ...baseSnapshot,
      fetched_at: new Date(now.getTime() - 120 * dayMs).toISOString(),
    });

    // 2. Snapshot 100 days ago (now is_last_good for provider-a, but still > 90 days old)
    snapshotRepo.saveSnapshot({
      ...baseSnapshot,
      fetched_at: new Date(now.getTime() - 100 * dayMs).toISOString(),
    });

    // 3. Snapshot for provider-b 10 days ago (< 90 days old)
    snapshotRepo.saveSnapshot({
      ...baseSnapshot,
      id: "provider-b",
      display_name: "Provider B",
      fetched_at: new Date(now.getTime() - 10 * dayMs).toISOString(),
    });

    // 4. Health events: 120 days ago and 10 days ago
    healthRepo.record({
      provider_id: "provider-a",
      status: "ok",
      duration_ms: 100,
      occurred_at: new Date(now.getTime() - 120 * dayMs).toISOString(),
    });
    healthRepo.record({
      provider_id: "provider-b",
      status: "ok",
      duration_ms: 100,
      occurred_at: new Date(now.getTime() - 10 * dayMs).toISOString(),
    });

    // Execute retention pruning (default 90 days)
    const result = retentionService.pruneHistory(90, now);

    expect(result.retentionDays).toBe(90);
    expect(result.prunedSnapshots).toBe(1); // Only the 120-day-old superseded snapshot was pruned!
    expect(result.prunedHealthEvents).toBe(1); // Only the 120-day-old health event was pruned!

    // Provider A's 100-day-old snapshot was preserved because it is the latest is_last_good!
    const lastGoodA = snapshotRepo.getLastGoodSnapshot("provider-a");
    expect(lastGoodA).not.toBeNull();
    expect(lastGoodA?.fetched_at).toBe(new Date(now.getTime() - 100 * dayMs).toISOString());

    // Provider B's 10-day-old snapshot is intact
    const lastGoodB = snapshotRepo.getLastGoodSnapshot("provider-b");
    expect(lastGoodB).not.toBeNull();

    // Provider B's health event is intact
    const recentEvents = healthRepo.getRecent("provider-b");
    expect(recentEvents).toHaveLength(1);
  });
});
