import type { FastifyInstance } from "fastify";
import type { ProviderRegistry, RefreshService } from "../../core/application/index.js";
import type {
  CapabilityRepository,
  HealthEventRepository,
  SettingsRepository,
  SnapshotRepository,
} from "../../infra/storage/index.js";
import { providerIdParamSchema } from "../schemas.js";

export interface ProvidersRouteOptions {
  registry: ProviderRegistry;
  settingsRepo: SettingsRepository;
  snapshotRepo: SnapshotRepository;
  healthRepo: HealthEventRepository;
  capabilityRepo?: CapabilityRepository;
  refreshService: RefreshService;
}

export async function registerProvidersRoutes(
  server: FastifyInstance,
  options: ProvidersRouteOptions,
): Promise<void> {
  // GET /api/providers — list all registered providers with metadata
  server.get("/api/providers", async (_request, reply) => {
    const adapters = options.registry.getAll();
    const configs = options.settingsRepo.getAllProviderConfigs();
    const configMap = new Map(configs.map((c) => [c.provider_id, c]));

    const result = await Promise.all(
      adapters.map(async (adapter) => {
        const config = configMap.get(adapter.id) ?? {
          provider_id: adapter.id,
          enabled: true,
          cooldown_seconds: 0,
        };
        const capRecord = options.capabilityRepo?.getCapability(adapter.id);
        const lastGood = options.snapshotRepo.getLastGoodSnapshot(adapter.id);
        const latestHealth = options.healthRepo.getLatest(adapter.id);

        return {
          id: adapter.id,
          displayName: config.display_name_override ?? adapter.displayName,
          enabled: config.enabled,
          cooldownSeconds: config.cooldown_seconds,
          timeoutMsOverride: config.timeout_ms_override,
          capability: capRecord ?? null,
          latestHealth: latestHealth ?? null,
          lastFetchedAt: lastGood?.fetched_at ?? null,
        };
      }),
    );

    return reply.code(200).send({ providers: result });
  });

  // GET /api/providers/:id — single provider detailed view
  server.get("/api/providers/:id", async (request, reply) => {
    const params = providerIdParamSchema.parse(request.params);
    const adapter = options.registry.get(params.id);

    if (!adapter) {
      return reply.code(404).send({
        error: "NOT_FOUND",
        message: `Provider "${params.id}" is not registered`,
      });
    }

    const config = options.settingsRepo.getProviderConfig(params.id) ?? {
      provider_id: params.id,
      enabled: true,
      cooldown_seconds: 0,
    };
    const capRecord = options.capabilityRepo?.getCapability(params.id);
    const lastGood = options.snapshotRepo.getLastGoodSnapshot(params.id);
    const latestHealth = options.healthRepo.getLatest(params.id);

    // Get cached snapshot for this provider
    const aggregate = options.refreshService.getCachedAggregateSnapshot({
      providerIds: [params.id],
    });
    const snapshot = aggregate.providers[0];

    return reply.code(200).send({
      id: adapter.id,
      displayName: config.display_name_override ?? adapter.displayName,
      config,
      capability: capRecord ?? null,
      latestHealth: latestHealth ?? null,
      snapshot: snapshot ?? null,
      lastGoodSnapshot: lastGood,
    });
  });
}
