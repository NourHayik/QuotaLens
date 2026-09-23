import { beforeEach, describe, expect, it } from "vitest";
import { ProviderRegistry, RefreshService } from "../src/core/application/index.js";
import {
  CapabilityRepository,
  DatabaseManager,
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../src/infra/storage/index.js";
import { createFakeProvider } from "../src/providers/fake/index.js";

describe("RefreshService Integration", () => {
  let dbManager: DatabaseManager;
  let registry: ProviderRegistry;
  let settingsRepo: SettingsRepository;
  let snapshotRepo: SnapshotRepository;
  let healthRepo: HealthEventRepository;
  let capabilityRepo: CapabilityRepository;
  let refreshService: RefreshService;

  beforeEach(() => {
    dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    registry = new ProviderRegistry();
    settingsRepo = new SettingsRepository(dbManager.db);
    snapshotRepo = new SnapshotRepository(dbManager.db);
    healthRepo = new HealthEventRepository(dbManager.db);
    capabilityRepo = new CapabilityRepository(dbManager.db);

    refreshService = new RefreshService({
      registry,
      settingsRepo,
      snapshotRepo,
      healthRepo,
      capabilityRepo,
    });
  });

  it("enforces bounded concurrency across provider refreshes", async () => {
    let currentConcurrent = 0;
    let maxObservedConcurrent = 0;

    settingsRepo.updateSettings({
      max_concurrency: 2,
      stagger_interval_ms: 0,
    });

    const createTrackedAdapter = (id: string) => {
      const base = createFakeProvider({ id, displayName: id, mode: "healthy" });
      return {
        ...base,
        async fetchUsage(signal?: AbortSignal) {
          currentConcurrent++;
          if (currentConcurrent > maxObservedConcurrent) {
            maxObservedConcurrent = currentConcurrent;
          }
          // Simulate work
          await new Promise((r) => setTimeout(r, 60));
          currentConcurrent--;
          return base.fetchUsage(signal);
        },
      };
    };

    for (let i = 1; i <= 5; i++) {
      registry.register(createTrackedAdapter(`provider-${i}`));
    }

    const snapshot = await refreshService.refreshAll();
    expect(snapshot.providers).toHaveLength(5);
    expect(maxObservedConcurrent).toBeLessThanOrEqual(2);
  });

  it("staggers provider launch times", async () => {
    settingsRepo.updateSettings({
      max_concurrency: 3,
      stagger_interval_ms: 60,
    });

    const launchTimes: number[] = [];

    const createTimestampedAdapter = (id: string) => {
      const base = createFakeProvider({ id, displayName: id, mode: "healthy" });
      return {
        ...base,
        detect: async (signal?: AbortSignal) => {
          launchTimes.push(Date.now());
          return base.detect(signal);
        },
      };
    };

    registry.register(createTimestampedAdapter("p1"));
    registry.register(createTimestampedAdapter("p2"));
    registry.register(createTimestampedAdapter("p3"));

    await refreshService.refreshAll();

    expect(launchTimes).toHaveLength(3);
    const t0 = launchTimes[0] ?? 0;
    const t1 = launchTimes[1] ?? 0;
    const t2 = launchTimes[2] ?? 0;
    const diff1 = t1 - t0;
    const diff2 = t2 - t1;

    // Account for small timer jitter (at least 35ms for a 60ms stagger)
    expect(diff1).toBeGreaterThanOrEqual(35);
    expect(diff2).toBeGreaterThanOrEqual(35);
  });

  it("isolates provider failures: healthy, error, and timeout coexist safely", async () => {
    settingsRepo.updateSettings({
      default_timeout_ms: 200,
      stagger_interval_ms: 0,
    });

    const healthy = createFakeProvider({ id: "healthy", displayName: "Healthy", mode: "healthy" });
    const failing = createFakeProvider({
      id: "failing",
      displayName: "Failing",
      mode: "error",
      errorMessage: "Network unreachable",
    });
    const hanging = createFakeProvider({ id: "hanging", displayName: "Hanging", mode: "hang" });

    registry.register(healthy);
    registry.register(failing);
    registry.register(hanging);

    const snapshot = await refreshService.refreshAll();

    expect(snapshot.fresh).toBe(true);
    expect(snapshot.providers).toHaveLength(3);

    const pHealthy = snapshot.providers.find((p) => p.id === "healthy");
    expect(pHealthy?.status).toBe("ok");
    expect(pHealthy?.stale).toBe(false);
    expect(pHealthy?.limits.length).toBeGreaterThan(0);

    const pFailing = snapshot.providers.find((p) => p.id === "failing");
    expect(pFailing?.status).toBe("unavailable");
    expect(pFailing?.errors[0]?.message).toContain("Network unreachable");
    expect(pFailing?.limits).toEqual([]);

    const pHanging = snapshot.providers.find((p) => p.id === "hanging");
    expect(pHanging?.status).toBe("timeout");
    expect(pHanging?.errors[0]?.code).toBe("timeout");
    expect(pHanging?.limits).toEqual([]);

    // Verify health events were recorded for each
    expect(healthRepo.getLatest("healthy")?.status).toBe("ok");
    expect(healthRepo.getLatest("failing")?.status).toBe("unavailable");
    expect(healthRepo.getLatest("hanging")?.status).toBe("timeout");
  });

  it("preserves last-good limits with stale: true when a subsequent refresh fails", async () => {
    const t0 = new Date("2026-09-15T08:00:00.000Z");
    let currentMode: "healthy" | "error" = "healthy";

    const dynamicAdapter = {
      ...createFakeProvider({ id: "dynamic", displayName: "Dynamic", mode: "healthy", now: t0 }),
      async fetchUsage(signal?: AbortSignal) {
        if (currentMode === "error") {
          throw new Error("CLI authentication expired");
        }
        return createFakeProvider({
          id: "dynamic",
          displayName: "Dynamic",
          mode: "healthy",
          now: t0,
        }).fetchUsage(signal);
      },
    };

    registry.register(dynamicAdapter);

    // 1. Initial healthy poll
    const firstPoll = await refreshService.refreshAll({ now: t0 });
    const p1 = firstPoll.providers[0];
    expect(p1?.status).toBe("ok");
    expect(p1?.stale).toBe(false);
    expect(p1?.limits).toHaveLength(2);

    // 2. Subsequent failed poll 10 minutes later
    currentMode = "error";
    const t1 = new Date("2026-09-15T08:10:00.000Z");
    const secondPoll = await refreshService.refreshAll({ now: t1 });

    const p2 = secondPoll.providers[0];
    expect(p2?.status).toBe("unavailable");
    expect(p2?.stale).toBe(true); // Stale semantics!
    expect(p2?.errors[0]?.message).toContain("CLI authentication expired");

    // Last-good limits must still be present!
    expect(p2?.limits).toHaveLength(2);
    expect(p2?.limits[0]?.id).toBe("primary");

    // Reset countdown recalculated relative to t1 (10 minutes elapsed)
    // At t0: resets in 120 mins (7200s). At t1 (10 mins later): resets in 110 mins (6600s)
    expect(p2?.limits[0]?.reset_countdown_seconds).toBe(110 * 60);

    // Last-good in database remains untouched and available
    const dbLastGood = snapshotRepo.getLastGoodSnapshot("dynamic");
    expect(dbLastGood?.status).toBe("ok");
  });

  it("returns cached snapshot immediately without executing provider CLIs", async () => {
    let detectCalled = false;
    let fetchCalled = false;

    const t0 = new Date("2026-09-15T08:00:00.000Z");
    const fake = createFakeProvider({ id: "spy", displayName: "Spy", mode: "healthy", now: t0 });
    const adapter = {
      ...fake,
      detect: async (signal?: AbortSignal) => {
        detectCalled = true;
        return fake.detect(signal);
      },
      fetchUsage: async (signal?: AbortSignal) => {
        fetchCalled = true;
        return fake.fetchUsage(signal);
      },
    };

    registry.register(adapter);

    // Populate last good snapshot
    await refreshService.refreshProvider("spy", { now: t0 });
    expect(detectCalled).toBe(true);
    expect(fetchCalled).toBe(true);

    detectCalled = false;
    fetchCalled = false;

    // Call cached aggregate
    const t1 = new Date("2026-09-15T08:30:00.000Z");
    const cached = refreshService.getCachedAggregateSnapshot({ now: t1 });

    expect(cached.fresh).toBe(false);
    expect(cached.providers).toHaveLength(1);
    expect(cached.providers[0]?.id).toBe("spy");
    expect(cached.providers[0]?.status).toBe("ok");
    expect(cached.providers[0]?.stale).toBe(false);

    // No adapter methods were executed!
    expect(detectCalled).toBe(false);
    expect(fetchCalled).toBe(false);

    // Countdown recalculated to 90 mins (5400s)
    expect(cached.providers[0]?.limits[0]?.reset_countdown_seconds).toBe(90 * 60);
  });

  it("respects enabled/disabled provider configuration", async () => {
    registry.register(
      createFakeProvider({ id: "p-enabled", displayName: "Enabled", mode: "healthy" }),
    );
    registry.register(
      createFakeProvider({ id: "p-disabled", displayName: "Disabled", mode: "healthy" }),
    );

    settingsRepo.saveProviderConfig({
      provider_id: "p-disabled",
      enabled: false,
      cooldown_seconds: 0,
    });

    const aggregate = await refreshService.refreshAll();
    expect(aggregate.providers.map((p) => p.id)).toEqual(["p-enabled"]);

    // Disabled provider can still be queried explicitly by ID
    const explicit = await refreshService.refreshProvider("p-disabled");
    expect(explicit.id).toBe("p-disabled");
    expect(explicit.status).toBe("ok");
  });

  it("enforces cooldown unless force: true is specified", async () => {
    let fetchCount = 0;
    const adapter = {
      ...createFakeProvider({
        id: "cooldown-p",
        displayName: "Cooldown Provider",
        mode: "healthy",
      }),
      fetchUsage: async (signal?: AbortSignal) => {
        fetchCount++;
        return createFakeProvider({
          id: "cooldown-p",
          displayName: "Cooldown Provider",
          mode: "healthy",
        }).fetchUsage(signal);
      },
    };

    registry.register(adapter);
    settingsRepo.saveProviderConfig({
      provider_id: "cooldown-p",
      enabled: true,
      cooldown_seconds: 60,
    });

    const t0 = new Date("2026-09-15T08:00:00.000Z");
    await refreshService.refreshAll({ now: t0 });
    expect(fetchCount).toBe(1);

    // 10 seconds later: within 60s cooldown window -> skipped live execution
    const t1 = new Date("2026-09-15T08:00:10.000Z");
    await refreshService.refreshAll({ now: t1, force: false });
    expect(fetchCount).toBe(1);

    // Forced refresh overrides cooldown
    await refreshService.refreshAll({ now: t1, force: true });
    expect(fetchCount).toBe(2);
  });

  it("applies display_name_override from settings", async () => {
    registry.register(
      createFakeProvider({ id: "antigravity", displayName: "Antigravity", mode: "healthy" }),
    );

    settingsRepo.saveProviderConfig({
      provider_id: "antigravity",
      enabled: true,
      display_name_override: "Gemini / Antigravity",
      cooldown_seconds: 0,
    });

    const snapshot = await refreshService.refreshAll();
    expect(snapshot.providers[0]?.display_name).toBe("Gemini / Antigravity");

    const cached = refreshService.getCachedAggregateSnapshot();
    expect(cached.providers[0]?.display_name).toBe("Gemini / Antigravity");
  });
});
