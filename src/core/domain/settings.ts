import { z } from "zod";
import { acquisitionSourceSchema, authStateSchema, usageCapabilitySchema } from "./enums.js";

/** Application-wide settings. Stored in SQLite app_settings table. */
export const appSettingsSchema = z.object({
  auto_refresh_enabled: z.boolean().default(false),
  refresh_interval_seconds: z.number().int().min(15).max(86_400).default(60),
  retention_days: z.number().int().min(1).max(365).default(90),
  max_concurrency: z.number().int().min(1).max(10).default(3),
  default_timeout_ms: z.number().int().min(50).max(120_000).default(10_000),
  stagger_interval_ms: z.number().int().min(0).max(5000).default(200),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  auto_refresh_enabled: false,
  refresh_interval_seconds: 60,
  retention_days: 90,
  max_concurrency: 3,
  default_timeout_ms: 10_000,
  stagger_interval_ms: 200,
};

/** Per-provider configuration. Stored in SQLite provider_configs table. */
export const providerConfigSchema = z.object({
  provider_id: z.string().min(1),
  enabled: z.boolean().default(true),
  display_name_override: z.string().min(1).optional(),
  timeout_ms_override: z.number().int().min(50).optional(),
  cooldown_seconds: z.number().int().min(0).default(0),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** Cached provider capability state. Stored in SQLite provider_capabilities table. */
export const providerCapabilityRecordSchema = z.object({
  provider_id: z.string().min(1),
  installed: z.boolean(),
  cli_version: z.string().min(1).optional(),
  auth_state: authStateSchema,
  usage_capability: usageCapabilitySchema,
  source: acquisitionSourceSchema,
  reason: z.string().min(1).optional(),
  probed_at: z.string().datetime({ offset: true }),
});
export type ProviderCapabilityRecord = z.infer<typeof providerCapabilityRecordSchema>;
