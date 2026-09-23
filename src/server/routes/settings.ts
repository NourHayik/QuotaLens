import type { FastifyInstance } from "fastify";
import type { SettingsRepository } from "../../infra/storage/index.js";
import {
  providerIdParamSchema,
  updateProviderConfigSchema,
  updateSettingsSchema,
} from "../schemas.js";

export interface SettingsRouteOptions {
  settingsRepo: SettingsRepository;
}

export async function registerSettingsRoutes(
  server: FastifyInstance,
  options: SettingsRouteOptions,
): Promise<void> {
  // GET /api/settings
  server.get("/api/settings", async (_request, reply) => {
    const settings = options.settingsRepo.getSettings();
    const providerConfigs = options.settingsRepo.getAllProviderConfigs();
    return reply.code(200).send({
      settings,
      provider_configs: providerConfigs,
    });
  });

  // PUT /api/settings
  server.put("/api/settings", async (request, reply) => {
    const raw = updateSettingsSchema.parse(request.body ?? {});
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    const updated = options.settingsRepo.updateSettings(cleaned);
    return reply.code(200).send({
      settings: updated,
    });
  });

  // PUT /api/settings/providers/:id
  server.put("/api/settings/providers/:id", async (request, reply) => {
    const params = providerIdParamSchema.parse(request.params);
    const partial = updateProviderConfigSchema.parse(request.body ?? {});

    const existing = options.settingsRepo.getProviderConfig(params.id);
    const updated = {
      provider_id: params.id,
      enabled: partial.enabled ?? existing?.enabled ?? true,
      cooldown_seconds: partial.cooldown_seconds ?? existing?.cooldown_seconds ?? 0,
      ...(partial.display_name_override !== undefined
        ? { display_name_override: partial.display_name_override }
        : existing?.display_name_override
          ? { display_name_override: existing.display_name_override }
          : {}),
      ...(partial.timeout_ms_override !== undefined
        ? { timeout_ms_override: partial.timeout_ms_override }
        : existing?.timeout_ms_override
          ? { timeout_ms_override: existing.timeout_ms_override }
          : {}),
    };

    options.settingsRepo.saveProviderConfig(updated);
    return reply.code(200).send({
      provider_config: updated,
    });
  });
}
