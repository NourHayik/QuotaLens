import type {
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../../infra/storage/index.js";

export interface RetentionServiceOptions {
  readonly settingsRepo: SettingsRepository;
  readonly snapshotRepo: SnapshotRepository;
  readonly healthRepo: HealthEventRepository;
}

export interface PruneResult {
  readonly retentionDays: number;
  readonly cutoffUtc: string;
  readonly prunedSnapshots: number;
  readonly prunedHealthEvents: number;
}

/**
 * Service managing historical data retention and pruning.
 * Safely removes historical snapshots and health events older than retention_days,
 * while strictly preserving each provider's latest is_last_good snapshot.
 */
export class RetentionService {
  private readonly settingsRepo: SettingsRepository;
  private readonly snapshotRepo: SnapshotRepository;
  private readonly healthRepo: HealthEventRepository;

  constructor(options: RetentionServiceOptions) {
    this.settingsRepo = options.settingsRepo;
    this.snapshotRepo = options.snapshotRepo;
    this.healthRepo = options.healthRepo;
  }

  pruneHistory(retentionDays?: number, now: Date = new Date()): PruneResult {
    const days = retentionDays ?? this.settingsRepo.getSettings().retention_days;
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffUtc = cutoffDate.toISOString();

    const snapshotResult = this.snapshotRepo.pruneOlderThan(cutoffUtc);
    const healthResult = this.healthRepo.pruneOlderThan(cutoffUtc);

    return {
      retentionDays: days,
      cutoffUtc,
      prunedSnapshots: snapshotResult.prunedSnapshots,
      prunedHealthEvents: healthResult,
    };
  }
}
