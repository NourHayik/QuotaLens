import { redactSecrets } from "../../infra/logging/redact.js";
import type {
  CapabilityRepository,
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../../infra/storage/index.js";
import {
  type AggregateSnapshot,
  type ProviderSnapshot,
  parseAggregateSnapshot,
  parseProviderSnapshot,
  SCHEMA_VERSION,
} from "../domain/index.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type { ProviderRegistry } from "./provider-registry.js";
import { getProviderSnapshot, recalculateLimitCountdowns } from "./provider-snapshot-service.js";

export interface RefreshOptions {
  /** Force refresh even if provider is within cooldown window. */
  force?: boolean;
  /** Filter refresh to specific provider IDs. Defaults to all enabled. */
  providerIds?: string[];
  /** Cancellation signal for the entire refresh operation. */
  signal?: AbortSignal;
  /** Fixed timestamp override for deterministic testing. */
  now?: Date;
}

export interface RefreshServiceOptions {
  readonly registry: ProviderRegistry;
  readonly settingsRepo: SettingsRepository;
  readonly snapshotRepo: SnapshotRepository;
  readonly healthRepo: HealthEventRepository;
  readonly capabilityRepo?: CapabilityRepository | undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Orchestrates bounded concurrent provider refreshes, handles failure isolation,
 * preserves last-good data on failure, and computes cache freshness.
 */
export class RefreshService {
  private readonly registry: ProviderRegistry;
  private readonly settingsRepo: SettingsRepository;
  private readonly snapshotRepo: SnapshotRepository;
  private readonly healthRepo: HealthEventRepository;
  private readonly capabilityRepo: CapabilityRepository | undefined;

  constructor(options: RefreshServiceOptions) {
    this.registry = options.registry;
    this.settingsRepo = options.settingsRepo;
    this.snapshotRepo = options.snapshotRepo;
    this.healthRepo = options.healthRepo;
    this.capabilityRepo = options.capabilityRepo;
  }

  /**
   * Refreshes all eligible providers concurrently with bounded worker concurrency
   * and staggered launch delays.
   */
  async refreshAll(options?: RefreshOptions): Promise<AggregateSnapshot> {
    const now = options?.now ?? new Date();
    const settings = this.settingsRepo.getSettings();
    const adapters = this.resolveAdaptersToRefresh(options?.providerIds);

    const maxConcurrency = Math.max(1, settings.max_concurrency);
    const staggerMs = settings.stagger_interval_ms;

    const providerSnapshots = await this.executeBoundedRefresh(
      adapters,
      maxConcurrency,
      staggerMs,
      options,
      now,
    );

    return parseAggregateSnapshot({
      schema_version: SCHEMA_VERSION,
      generated_at: now.toISOString(),
      fresh: true,
      providers: providerSnapshots,
    });
  }

  /**
   * Refreshes a single provider by ID, isolated from other providers.
   */
  async refreshProvider(
    providerId: string,
    options?: Omit<RefreshOptions, "providerIds">,
  ): Promise<ProviderSnapshot> {
    const adapter = this.registry.get(providerId);
    if (!adapter) {
      throw new Error(`Provider "${providerId}" not found in registry`);
    }

    const now = options?.now ?? new Date();
    return this.refreshSingleProvider(adapter, options, now);
  }

  /**
   * Returns cached aggregate snapshot without executing any provider CLIs.
   */
  getCachedAggregateSnapshot(options?: { providerIds?: string[]; now?: Date }): AggregateSnapshot {
    const now = options?.now ?? new Date();
    const adapters = this.resolveAdaptersToRefresh(options?.providerIds);

    const snapshots: ProviderSnapshot[] = [];

    for (const adapter of adapters) {
      const config = this.settingsRepo.getProviderConfig(adapter.id);
      const lastGood = this.snapshotRepo.getLastGoodSnapshot(adapter.id);
      const latestHealth = this.healthRepo.getLatest(adapter.id);

      if (lastGood) {
        const isStale = Boolean(latestHealth && latestHealth.status !== "ok");
        const status = isStale && latestHealth ? latestHealth.status : "ok";
        const errors =
          isStale && latestHealth
            ? [
                {
                  code: latestHealth.error_code ?? latestHealth.status,
                  message: latestHealth.error_message ?? `${adapter.displayName} refresh failed`,
                },
              ]
            : [];

        snapshots.push(
          parseProviderSnapshot({
            ...lastGood,
            display_name: config?.display_name_override ?? lastGood.display_name,
            status,
            stale: isStale,
            limits: recalculateLimitCountdowns(lastGood.limits, now),
            errors,
          }),
        );
      } else {
        // No previous snapshot exists for this provider
        const status = latestHealth?.status ?? "unavailable";
        snapshots.push(
          parseProviderSnapshot({
            id: adapter.id,
            display_name: config?.display_name_override ?? adapter.displayName,
            installed: false,
            auth_state: "unknown",
            usage_capability: "unknown",
            status,
            source: "none",
            fetched_at: now.toISOString(),
            fetch_started_at: now.toISOString(),
            stale: false,
            limits: [],
            errors: latestHealth?.error_message
              ? [
                  {
                    code: latestHealth.error_code ?? status,
                    message: latestHealth.error_message,
                  },
                ]
              : [],
          }),
        );
      }
    }

    return parseAggregateSnapshot({
      schema_version: SCHEMA_VERSION,
      generated_at: now.toISOString(),
      fresh: false,
      providers: snapshots,
    });
  }

  /**
   * Resolves registered adapters matching filter and enabled state.
   */
  private resolveAdaptersToRefresh(providerIds?: string[]): ProviderAdapter[] {
    const allAdapters = this.registry.getAll();

    if (providerIds && providerIds.length > 0) {
      const requestedSet = new Set(providerIds);
      return allAdapters.filter((a) => requestedSet.has(a.id));
    }

    // Default: all registered adapters whose config is enabled (or unconfigured, defaulting to enabled)
    return allAdapters.filter((a) => {
      const config = this.settingsRepo.getProviderConfig(a.id);
      return config ? config.enabled : true;
    });
  }

  /**
   * Executes provider refreshes bounded by maxConcurrency and staggered launches.
   */
  private async executeBoundedRefresh(
    adapters: ProviderAdapter[],
    maxConcurrency: number,
    staggerMs: number,
    options?: RefreshOptions,
    now: Date = new Date(),
  ): Promise<ProviderSnapshot[]> {
    if (adapters.length === 0) {
      return [];
    }

    const results: ProviderSnapshot[] = new Array(adapters.length);
    let nextIndex = 0;
    let nextLaunchAllowedAt = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < adapters.length) {
        if (options?.signal?.aborted) break;
        const index = nextIndex++;

        // Stagger launch
        if (staggerMs > 0) {
          const currentTime = Date.now();
          const scheduledLaunch = Math.max(currentTime, nextLaunchAllowedAt);
          nextLaunchAllowedAt = scheduledLaunch + staggerMs;
          const waitMs = scheduledLaunch - currentTime;
          if (waitMs > 0) {
            await sleep(waitMs, options?.signal);
          }
        }

        const adapter = adapters[index];
        if (!adapter) continue;
        try {
          results[index] = await this.refreshSingleProvider(adapter, options, now);
        } catch (error) {
          // Failure isolation: unexpected throw maps to unavailable snapshot
          results[index] = this.buildEmergencyFallbackSnapshot(adapter, error, now);
        }
      }
    };

    const workersCount = Math.min(maxConcurrency, adapters.length);
    const workerPromises: Promise<void>[] = [];
    for (let w = 0; w < workersCount; w++) {
      workerPromises.push(worker());
    }

    await Promise.all(workerPromises);
    return results;
  }

  /**
   * Refreshes one provider with cooldown check, failure isolation, and last-good preservation.
   */
  private async refreshSingleProvider(
    adapter: ProviderAdapter,
    options?: Omit<RefreshOptions, "providerIds">,
    now: Date = new Date(),
  ): Promise<ProviderSnapshot> {
    const config = this.settingsRepo.getProviderConfig(adapter.id);
    const settings = this.settingsRepo.getSettings();

    // Check cooldown unless forced
    if (!options?.force && config && config.cooldown_seconds > 0) {
      const lastGood = this.snapshotRepo.getLastGoodSnapshot(adapter.id);
      if (lastGood) {
        const lastFetched = new Date(lastGood.fetched_at).getTime();
        const ageSeconds = Math.max(0, Math.floor((now.getTime() - lastFetched) / 1000));
        if (ageSeconds < config.cooldown_seconds) {
          // Return cached last-good snapshot with updated countdowns
          return parseProviderSnapshot({
            ...lastGood,
            display_name: config.display_name_override ?? lastGood.display_name,
            stale: false,
            limits: recalculateLimitCountdowns(lastGood.limits, now),
          });
        }
      }
    }

    const timeoutMs = config?.timeout_ms_override ?? settings.default_timeout_ms;
    const startTime = Date.now();

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs,
      ...(options?.signal ? { signal: options.signal } : {}),
      now,
    });

    const durationMs = Math.max(0, Date.now() - startTime);
    const occurredAt = now.toISOString();

    if (snapshot.status === "ok") {
      this.snapshotRepo.saveSnapshot(snapshot);

      this.healthRepo.record({
        provider_id: adapter.id,
        status: "ok",
        duration_ms: durationMs,
        occurred_at: occurredAt,
      });

      if (this.capabilityRepo) {
        this.capabilityRepo.saveCapability({
          provider_id: adapter.id,
          installed: snapshot.installed,
          cli_version: snapshot.cli_version,
          auth_state: snapshot.auth_state,
          usage_capability: snapshot.usage_capability,
          source: snapshot.source,
          probed_at: occurredAt,
        });
      }

      if (config?.display_name_override) {
        return parseProviderSnapshot({
          ...snapshot,
          display_name: config.display_name_override,
        });
      }
      return snapshot;
    }

    // Refresh failed or returned non-ok status
    const primaryError = snapshot.errors[0];
    this.healthRepo.record({
      provider_id: adapter.id,
      status: snapshot.status,
      error_code: primaryError?.code,
      error_message: primaryError?.message,
      duration_ms: durationMs,
      occurred_at: occurredAt,
    });

    if (this.capabilityRepo) {
      this.capabilityRepo.saveCapability({
        provider_id: adapter.id,
        installed: snapshot.installed,
        cli_version: snapshot.cli_version,
        auth_state: snapshot.auth_state,
        usage_capability: snapshot.usage_capability,
        source: snapshot.source,
        reason: primaryError?.message,
        probed_at: occurredAt,
      });
    }

    // Last-good vs latest-health semantics
    const lastGood = this.snapshotRepo.getLastGoodSnapshot(adapter.id);
    if (lastGood) {
      return parseProviderSnapshot({
        id: adapter.id,
        display_name: config?.display_name_override ?? lastGood.display_name,
        installed: snapshot.installed,
        auth_state: snapshot.auth_state,
        usage_capability: snapshot.usage_capability,
        status: snapshot.status,
        source: lastGood.source,
        cli_version: snapshot.cli_version ?? lastGood.cli_version,
        plan_label: lastGood.plan_label,
        fetched_at: snapshot.fetched_at,
        fetch_started_at: snapshot.fetch_started_at,
        stale: true,
        limits: recalculateLimitCountdowns(lastGood.limits, now),
        errors: snapshot.errors,
      });
    }

    if (config?.display_name_override) {
      return parseProviderSnapshot({
        ...snapshot,
        display_name: config.display_name_override,
      });
    }
    return snapshot;
  }

  private buildEmergencyFallbackSnapshot(
    adapter: ProviderAdapter,
    error: unknown,
    now: Date,
  ): ProviderSnapshot {
    const message = error instanceof Error ? error.message : "Unexpected refresh error";
    const iso = now.toISOString();

    const lastGood = this.snapshotRepo.getLastGoodSnapshot(adapter.id);
    if (lastGood) {
      return parseProviderSnapshot({
        ...lastGood,
        status: "unavailable",
        stale: true,
        fetched_at: iso,
        fetch_started_at: iso,
        limits: recalculateLimitCountdowns(lastGood.limits, now),
        errors: [{ code: "unavailable", message: redactSecrets(message) }],
      });
    }

    return parseProviderSnapshot({
      id: adapter.id,
      display_name: adapter.displayName,
      installed: false,
      auth_state: "unknown",
      usage_capability: "unknown",
      status: "unavailable",
      source: "none",
      fetched_at: iso,
      fetch_started_at: iso,
      stale: false,
      limits: [],
      errors: [{ code: "unavailable", message: redactSecrets(message) }],
    });
  }
}
