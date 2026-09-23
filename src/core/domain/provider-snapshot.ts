import { z } from "zod";
import {
  acquisitionSourceSchema,
  authStateSchema,
  providerStatusSchema,
  usageCapabilitySchema,
} from "./enums.js";
import { providerErrorSchema } from "./provider-error.js";
import { usageLimitSchema } from "./usage-limit.js";

/**
 * Normalized per-provider result. See requirements section 6.1.
 * Timestamps are UTC ISO 8601 strings.
 */
export const providerSnapshotSchema = z.object({
  /** Stable provider ID, e.g. "codex", "kimi", "antigravity". */
  id: z.string().min(1),
  display_name: z.string().min(1),
  installed: z.boolean(),
  auth_state: authStateSchema,
  usage_capability: usageCapabilitySchema,
  status: providerStatusSchema,
  source: acquisitionSourceSchema,
  /** Installed CLI version when detectable. */
  cli_version: z.string().min(1).optional(),
  fetched_at: z.string().datetime({ offset: true }),
  fetch_started_at: z.string().datetime({ offset: true }),
  /** True when values come from a last-good snapshot and the latest refresh failed. */
  stale: z.boolean(),
  /** Privacy-safe plan/account label when available. */
  plan_label: z.string().min(1).optional(),
  limits: z.array(usageLimitSchema),
  errors: z.array(providerErrorSchema),
});
export type ProviderSnapshot = z.infer<typeof providerSnapshotSchema>;

export function parseProviderSnapshot(value: unknown): ProviderSnapshot {
  return providerSnapshotSchema.parse(value);
}
