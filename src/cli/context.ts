import { ProviderRegistry, RefreshService } from "../core/application/index.js";
import { createLogger, type Logger, type LogLevel } from "../infra/logging/index.js";
import { processRegistry } from "../infra/process/process-registry.js";
import {
  CapabilityRepository,
  DatabaseManager,
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../infra/storage/index.js";
import { registerDefaultProviders, registerDemoProviders } from "../providers/index.js";

export interface CliContextOptions {
  /** Override SQLite database path or use ":memory:". */
  dbPath?: string;
  /** Force enable demo mode fixtures. */
  demo?: boolean;
  /** Custom pre-configured provider registry. */
  registry?: ProviderRegistry;
  /** Logger override or custom level. */
  logger?: Logger;
  logLevel?: LogLevel;
}

export interface CliContext {
  readonly dbManager: DatabaseManager;
  readonly settingsRepo: SettingsRepository;
  readonly snapshotRepo: SnapshotRepository;
  readonly healthRepo: HealthEventRepository;
  readonly capabilityRepo: CapabilityRepository;
  readonly registry: ProviderRegistry;
  readonly refreshService: RefreshService;
  readonly logger: Logger;
  readonly isDemo: boolean;
  readonly shutdownController: AbortController;
  readonly shutdownSignal: AbortSignal;
  dispose(): void;
}

/**
 * Creates an initialized CLI application context with storage, services, and logging.
 */
export function createCliContext(options: CliContextOptions = {}): CliContext {
  const isDemo =
    options.demo === true ||
    process.env.AI_LIMITS_DEMO === "1" ||
    process.env.AI_LIMITS_DEMO === "true";

  const dbManager = new DatabaseManager(options.dbPath ? { dbPath: options.dbPath } : undefined);
  dbManager.runMigrations();

  const settingsRepo = new SettingsRepository(dbManager.db);
  const snapshotRepo = new SnapshotRepository(dbManager.db);
  const healthRepo = new HealthEventRepository(dbManager.db);
  const capabilityRepo = new CapabilityRepository(dbManager.db);

  const registry = options.registry ?? new ProviderRegistry();

  if (isDemo && (!options.registry || registry.getAll().length === 0)) {
    registerDemoProviders(registry);
  } else if (!isDemo && (!options.registry || registry.getAll().length === 0)) {
    registerDefaultProviders(registry);
  }

  const refreshService = new RefreshService({
    registry,
    settingsRepo,
    snapshotRepo,
    healthRepo,
    capabilityRepo,
  });

  const logger =
    options.logger ??
    createLogger({
      level: options.logLevel ?? "info",
    });

  const shutdownController = new AbortController();

  return {
    dbManager,
    settingsRepo,
    snapshotRepo,
    healthRepo,
    capabilityRepo,
    registry,
    refreshService,
    logger,
    isDemo,
    shutdownController,
    shutdownSignal: shutdownController.signal,
    dispose: () => {
      if (!shutdownController.signal.aborted) {
        shutdownController.abort();
      }
      void processRegistry.killAll();
      try {
        dbManager.close();
      } catch {
        // Ignore errors on close
      }
    },
  };
}
