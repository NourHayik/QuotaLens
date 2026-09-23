import { z } from "zod";
import { amountUnitSchema, limitCategorySchema } from "./enums.js";

/**
 * A normalized usage limit. No field is fabricated solely to make providers
 * look uniform; absent provider data stays absent (optional fields).
 */
export const usageLimitSchema = z.object({
  /** Stable local limit ID, e.g. "primary", "weekly", "model:gemini-3-pro". */
  id: z.string().min(1),
  /** Provider-native name when available. */
  name: z.string().min(1).optional(),
  category: limitCategorySchema,
  /** Window duration in minutes when known. */
  window_minutes: z.number().int().positive().optional(),
  used_percent: z.number().min(0).max(100).optional(),
  remaining_percent: z.number().min(0).max(100).optional(),
  used_amount: z.number().min(0).optional(),
  limit_amount: z.number().min(0).optional(),
  remaining_amount: z.number().min(0).optional(),
  amount_unit: amountUnitSchema.optional(),
  /** Reset timestamp (UTC ISO 8601) when known. */
  resets_at: z.string().datetime({ offset: true }).optional(),
  /** Derived locally from resets_at at snapshot time; seconds until reset. */
  reset_countdown_seconds: z.number().int().min(0).optional(),
  /** Model identifier when the quota is model-specific. */
  model_id: z.string().min(1).optional(),
});
export type UsageLimit = z.infer<typeof usageLimitSchema>;
