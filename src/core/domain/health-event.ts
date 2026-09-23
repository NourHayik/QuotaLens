import { z } from "zod";
import { providerStatusSchema } from "./enums.js";

/**
 * Health event recorded for every provider refresh or probe attempt.
 * Preserves diagnostic timeline without overwriting last-good usage data.
 */
export const providerHealthEventSchema = z.object({
  id: z.number().int().positive().optional(),
  provider_id: z.string().min(1),
  status: providerStatusSchema,
  error_code: z.string().min(1).optional(),
  error_message: z.string().min(1).optional(),
  duration_ms: z.number().int().min(0),
  occurred_at: z.string().datetime({ offset: true }),
});
export type ProviderHealthEvent = z.infer<typeof providerHealthEventSchema>;
