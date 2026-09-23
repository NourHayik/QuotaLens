import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, type ProviderSnapshot } from "../src/core/domain/index.js";
import {
  CapabilityRepository,
  DatabaseManager,
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../src/infra/storage/index.js";

describe("Storage Repositories", () => {
  let dbManager: DatabaseManager;
  let settingsRepo: SettingsRepository;
  let capabilityRepo: CapabilityRepository;
  let snapshotRepo: SnapshotRepository;
  let healthRepo: HealthEventRepository;

  beforeEach(() => {
    dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    settingsRepo = new SettingsRepository(dbManager.db);
    capabilityRepo = new CapabilityRepository(dbManager.db);
    snapshotRepo = new SnapshotRepository(dbManager.db);
    healthRepo = new HealthEventRepository(dbManager.db);
  });

  describe("SettingsRepository", () => {
    it("returns default settings when database is empty", () => {
      const settings = settingsRepo.getSettings();
      expect(settings).toEqual(DEFAULT_APP_SETTINGS);
    });

    it("persists updated settings and leaves unspecified values intact", () => {
      const updated = settingsRepo.updateSettings({
        max_concurrency: 5,
        refresh_interval_seconds: 30,
      });

      expect(updated.max_concurrency).toBe(5);
      expect(updated.refresh_interval_seconds).toBe(30);
      expect(updated.retention_days).toBe(90);

      const retrieved = settingsRepo.getSettings();
      expect(retrieved.max_concurrency).toBe(5);
      expect(retrieved.refresh_interval_seconds).toBe(30);
      expect(retrieved.retention_days).toBe(90);
    });

    it("saves and retrieves provider configs", () => {
      expect(settingsRepo.getProviderConfig("codex")).toBeNull();

      settingsRepo.saveProviderConfig({
        provider_id: "codex",
        enabled: true,
        display_name_override: "Codex CLI Pro",
        timeout_ms_override: 15000,
        cooldown_seconds: 30,
      });

      const config = settingsRepo.getProviderConfig("codex");
      expect(config).toEqual({
        provider_id: "codex",
        enabled: true,
        display_name_override: "Codex CLI Pro",
        timeout_ms_override: 15000,
        cooldown_seconds: 30,
      });

      settingsRepo.saveProviderConfig({
        provider_id: "kimi",
        enabled: false,
        cooldown_seconds: 0,
      });

      const all = settingsRepo.getAllProviderConfigs();
      expect(all).toHaveLength(2);
      expect(all.map((c) => c.provider_id)).toEqual(["codex", "kimi"]);
    });
  });

  describe("CapabilityRepository", () => {
    it("saves and retrieves provider capability record", () => {
      expect(capabilityRepo.getCapability("antigravity")).toBeNull();

      capabilityRepo.saveCapability({
        provider_id: "antigravity",
        installed: true,
        cli_version: "2.4.0",
        auth_state: "authenticated",
        usage_capability: "supported",
        source: "tui-pty",
        probed_at: new Date().toISOString(),
      });

      const retrieved = capabilityRepo.getCapability("antigravity");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.provider_id).toBe("antigravity");
      expect(retrieved?.installed).toBe(true);
      expect(retrieved?.cli_version).toBe("2.4.0");
      expect(retrieved?.usage_capability).toBe("supported");
      expect(retrieved?.source).toBe("tui-pty");
    });
  });

  describe("SnapshotRepository", () => {
    const baseSnapshot: ProviderSnapshot = {
      id: "test-p",
      display_name: "Test Provider",
      installed: true,
      auth_state: "authenticated",
      usage_capability: "supported",
      status: "ok",
      source: "fixture",
      cli_version: "1.0.0",
      fetched_at: "2026-09-15T08:00:00.000Z",
      fetch_started_at: "2026-09-15T07:59:58.000Z",
      stale: false,
      plan_label: "Team Plan",
      limits: [
        {
          id: "primary",
          name: "5-hour window",
          category: "rolling_window",
          window_minutes: 300,
          used_percent: 40,
          remaining_percent: 60,
          resets_at: "2026-09-15T10:00:00.000Z",
          reset_countdown_seconds: 7200,
        },
      ],
      errors: [],
    };

    it("saves snapshot with limits and retrieves as last-good", () => {
      snapshotRepo.saveSnapshot(baseSnapshot);

      const lastGood = snapshotRepo.getLastGoodSnapshot("test-p");
      expect(lastGood).not.toBeNull();
      expect(lastGood?.id).toBe("test-p");
      expect(lastGood?.status).toBe("ok");
      expect(lastGood?.plan_label).toBe("Team Plan");
      expect(lastGood?.limits).toHaveLength(1);
      expect(lastGood?.limits[0]?.id).toBe("primary");
      expect(lastGood?.limits[0]?.used_percent).toBe(40);
      expect(lastGood?.limits[0]?.remaining_percent).toBe(60);
    });

    it("resets is_last_good on previous snapshot when saving a new snapshot", () => {
      snapshotRepo.saveSnapshot(baseSnapshot);

      const secondSnapshot: ProviderSnapshot = {
        ...baseSnapshot,
        fetched_at: "2026-09-15T08:30:00.000Z",
        fetch_started_at: "2026-09-15T08:29:58.000Z",
        limits: [
          {
            id: "primary",
            category: "rolling_window",
            used_percent: 50,
            remaining_percent: 50,
          },
        ],
      };
      snapshotRepo.saveSnapshot(secondSnapshot);

      const lastGood = snapshotRepo.getLastGoodSnapshot("test-p");
      expect(lastGood?.fetched_at).toBe("2026-09-15T08:30:00.000Z");
      expect(lastGood?.limits[0]?.used_percent).toBe(50);

      // Verify that history contains both snapshots
      const history = snapshotRepo.getHistory("test-p");
      expect(history).toHaveLength(2);
      expect(history[0]?.fetched_at).toBe("2026-09-15T08:30:00.000Z");
      expect(history[1]?.fetched_at).toBe("2026-09-15T08:00:00.000Z");
    });

    it("filters history by time range and limit", () => {
      snapshotRepo.saveSnapshot({
        ...baseSnapshot,
        fetched_at: "2026-09-10T10:00:00.000Z",
      });
      snapshotRepo.saveSnapshot({
        ...baseSnapshot,
        fetched_at: "2026-09-12T10:00:00.000Z",
      });
      snapshotRepo.saveSnapshot({
        ...baseSnapshot,
        fetched_at: "2026-09-15T10:00:00.000Z",
      });

      const filtered = snapshotRepo.getHistory("test-p", {
        sinceUtc: "2026-09-11T00:00:00.000Z",
        untilUtc: "2026-09-13T00:00:00.000Z",
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.fetched_at).toBe("2026-09-12T10:00:00.000Z");

      const limited = snapshotRepo.getHistory("test-p", { limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it("prunes old snapshots but preserves is_last_good snapshot", () => {
      // Old snapshot 1 (superseded)
      snapshotRepo.saveSnapshot({
        ...baseSnapshot,
        fetched_at: "2026-01-01T00:00:00.000Z",
      });
      // Old snapshot 2 (supersedes 1, but is still old; current last-good)
      snapshotRepo.saveSnapshot({
        ...baseSnapshot,
        fetched_at: "2026-01-02T00:00:00.000Z",
      });

      // Cutoff date is 2026-06-01
      const result = snapshotRepo.pruneOlderThan("2026-06-01T00:00:00.000Z");
      // Only the first snapshot (is_last_good = 0) was pruned; the second (is_last_good = 1) is preserved!
      expect(result.prunedSnapshots).toBe(1);

      const lastGood = snapshotRepo.getLastGoodSnapshot("test-p");
      expect(lastGood).not.toBeNull();
      expect(lastGood?.fetched_at).toBe("2026-01-02T00:00:00.000Z");
    });
  });

  describe("HealthEventRepository", () => {
    it("records health events and queries recent/latest in descending order", () => {
      healthRepo.record({
        provider_id: "fake-1",
        status: "ok",
        duration_ms: 120,
        occurred_at: "2026-09-15T08:00:00.000Z",
      });

      healthRepo.record({
        provider_id: "fake-1",
        status: "timeout",
        error_code: "timeout",
        error_message: "Process timed out after 10000ms",
        duration_ms: 10005,
        occurred_at: "2026-09-15T08:05:00.000Z",
      });

      const latest = healthRepo.getLatest("fake-1");
      expect(latest).not.toBeNull();
      expect(latest?.status).toBe("timeout");
      expect(latest?.error_code).toBe("timeout");

      const recent = healthRepo.getRecent("fake-1", 10);
      expect(recent).toHaveLength(2);
      expect(recent[0]?.status).toBe("timeout");
      expect(recent[1]?.status).toBe("ok");
    });

    it("prunes health events older than cutoff", () => {
      healthRepo.record({
        provider_id: "fake-1",
        status: "ok",
        duration_ms: 100,
        occurred_at: "2026-01-01T00:00:00.000Z",
      });
      healthRepo.record({
        provider_id: "fake-1",
        status: "ok",
        duration_ms: 100,
        occurred_at: "2026-09-15T08:00:00.000Z",
      });

      const pruned = healthRepo.pruneOlderThan("2026-06-01T00:00:00.000Z");
      expect(pruned).toBe(1);

      const remaining = healthRepo.getRecent("fake-1");
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.occurred_at).toBe("2026-09-15T08:00:00.000Z");
    });
  });
});
