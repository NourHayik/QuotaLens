import { z } from "zod";
import { appSettingsSchema, providerConfigSchema } from "../core/domain/index.js";

/** Query parameters for GET /api/snapshot */
export const snapshotQuerySchema = z.object({
  fresh: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((val) => val === true || val === "true" || val === "1"),
  providerId: z.string().min(1).optional(),
});
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;

/** Request body for POST /api/refresh */
export const refreshBodySchema = z.object({
  providerId: z.string().min(1).optional(),
  force: z.boolean().default(true),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

/** Query parameters for GET /api/history/:providerId */
export const historyQuerySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("24h"),
  limit: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === "string") {
        const parsed = Number.parseInt(val, 10);
        return Number.isNaN(parsed) ? 100 : parsed;
      }
      return val ?? 100;
    }),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** Route params for /api/providers/:id and /api/history/:providerId */
export const providerIdParamSchema = z.object({
  id: z.string().min(1),
});
export type ProviderIdParam = z.infer<typeof providerIdParamSchema>;

/** Request body for PUT /api/settings */
export const updateSettingsSchema = appSettingsSchema.partial();
export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>;

/** Request body for PUT /api/settings/providers/:id */
export const updateProviderConfigSchema = providerConfigSchema
  .omit({ provider_id: true })
  .partial();
export type UpdateProviderConfigBody = z.infer<typeof updateProviderConfigSchema>;
