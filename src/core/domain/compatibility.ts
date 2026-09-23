import { z } from "zod";
import { acquisitionSourceSchema, usageCapabilitySchema } from "./enums.js";
import type { ProviderCapabilityRecord } from "./settings.js";

/**
 * Metadata capturing the tested compatibility and support matrix for a provider.
 * See requirements section 8 and Phase 6 specification.
 */
export const providerCompatibilitySchema = z.object({
  provider_id: z.string().min(1),
  display_name: z.string().min(1),
  tested_version: z.string().min(1),
  acquisition_method: acquisitionSourceSchema,
  fallback_method: z.string().min(1),
  usage_capability: usageCapabilitySchema,
  status_notes: z.string(),
  last_probe: z.string().datetime({ offset: true }).optional(),
});
export type ProviderCompatibility = z.infer<typeof providerCompatibilitySchema>;

/**
 * Static baseline compatibility matrix covering all 5 priority providers.
 */
export const STATIC_PROVIDER_COMPATIBILITY_MATRIX: ReadonlyArray<ProviderCompatibility> = [
  {
    provider_id: "codex",
    display_name: "OpenAI Codex",
    tested_version: "0.154.0",
    acquisition_method: "app-server",
    fallback_method: "cli-text",
    usage_capability: "supported",
    status_notes:
      "Validated on native Linux 2026-09-15 via app-server stdio JSON-RPC account/rateLimits/read; deterministic /status fallback remains available",
  },
  {
    provider_id: "kimi",
    display_name: "Kimi",
    tested_version: "0.43.0",
    acquisition_method: "tui-pty",
    fallback_method: "none",
    usage_capability: "supported",
    status_notes:
      "Validated on native Linux 2026-09-15 with controlled PTY /usage (no model prompt)",
  },
  {
    provider_id: "antigravity",
    display_name: "Gemini / Antigravity",
    tested_version: "1.2.3",
    acquisition_method: "tui-pty",
    fallback_method: "none",
    usage_capability: "supported",
    status_notes:
      "Validated on native Linux 2026-09-15 with controlled PTY /usage; per-model quotas remain distinct",
  },
  {
    provider_id: "cursor",
    display_name: "Cursor",
    tested_version: "2026.09.10-fd3934a",
    acquisition_method: "cli-json",
    fallback_method: "none",
    usage_capability: "unsupported",
    status_notes:
      "Validated on native Linux 2026-09-15: CLI exposes auth/status/about but no quota command; reported unsupported without cursor-agent -p",
  },
  {
    provider_id: "opencode",
    display_name: "OpenCode Go",
    tested_version: "1.18.27",
    acquisition_method: "cli-text",
    fallback_method: "none",
    usage_capability: "unsupported",
    status_notes:
      "Validated on native Linux 2026-09-15: auth list confirms Go credentials; live Go quota remains unsupported without opencode run",
  },
];

/**
 * Returns the compatibility matrix, optionally enriched with the latest dynamic probe timestamps.
 */
export function getProviderCompatibilityMatrix(
  probes?: ProviderCapabilityRecord[],
): ProviderCompatibility[] {
  const probeMap = new Map<string, ProviderCapabilityRecord>();
  if (probes) {
    for (const probe of probes) {
      probeMap.set(probe.provider_id, probe);
    }
  }

  return STATIC_PROVIDER_COMPATIBILITY_MATRIX.map((entry) => {
    const dynamic = probeMap.get(entry.provider_id);
    if (!dynamic) {
      return { ...entry };
    }
    return {
      ...entry,
      last_probe: dynamic.probed_at,
      ...(dynamic.cli_version ? { tested_version: dynamic.cli_version } : {}),
      ...(dynamic.usage_capability ? { usage_capability: dynamic.usage_capability } : {}),
    };
  });
}
