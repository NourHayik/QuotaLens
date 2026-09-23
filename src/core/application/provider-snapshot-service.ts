import { redactSecrets } from "../../infra/logging/redact.js";
import {
  ProviderParseError,
  type ProviderSnapshot,
  type ProviderStatus,
  parseProviderSnapshot,
  type UsageLimit,
} from "../domain/index.js";
import type { ProviderAdapter, SnapshotOptions } from "./provider-adapter.js";

/**
 * Recalculates reset_countdown_seconds for each limit based on its resets_at
 * timestamp and the current time. Preserves all other limit fields intact.
 */
export function recalculateLimitCountdowns(
  limits: UsageLimit[],
  now: Date = new Date(),
): UsageLimit[] {
  return limits.map((limit) => {
    if (!limit.resets_at) {
      return limit;
    }
    const resetTime = new Date(limit.resets_at).getTime();
    const diffSeconds = Math.max(0, Math.floor((resetTime - now.getTime()) / 1000));
    return {
      ...limit,
      reset_countdown_seconds: diffSeconds,
    };
  });
}

/** Error shape adapters may throw to signal a specific provider status. */
export class ProviderStatusError extends Error {
  readonly status: ProviderStatus;

  constructor(status: ProviderStatus, message: string) {
    super(message);
    this.name = "ProviderStatusError";
    this.status = status;
  }
}

function isTimeoutLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ProcessTimeoutError" || error.name === "ProcessAbortedError")
  );
}

function redactError(code: string, message: string): { code: string; message: string } {
  return { code, message: redactSecrets(message) };
}

function redactPlanLabel(label: string | null | undefined): string | undefined {
  if (!label) return undefined;
  const redacted = redactSecrets(label);
  return redacted.length > 0 ? redacted : undefined;
}

/**
 * Builds a validated ProviderSnapshot from one adapter. Phase 1 scope:
 * single-provider, no registry, no persistence, no concurrency.
 *
 * Guarantees:
 * - never invents limits; adapter output is validated against the domain schema
 * - timeout/cancellation maps to status "timeout" with empty limits
 * - adapter failures map to honest statuses, never thrown raw to callers
 */
export async function getProviderSnapshot(
  adapter: ProviderAdapter,
  options: SnapshotOptions,
): Promise<ProviderSnapshot> {
  const startedAt = options.now ?? new Date();
  const finish = (
    partial: Omit<ProviderSnapshot, "id" | "display_name" | "fetch_started_at" | "fetched_at">,
  ): ProviderSnapshot =>
    parseProviderSnapshot({
      id: adapter.id,
      display_name: adapter.displayName,
      fetch_started_at: startedAt.toISOString(),
      fetched_at: (options.now ?? new Date()).toISOString(),
      ...partial,
    });

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  try {
    const installed = await adapter.detect(signal);
    if (!installed) {
      return finish({
        installed: false,
        auth_state: "unknown",
        usage_capability: "unknown",
        status: "not_installed",
        source: "none",
        stale: false,
        limits: [],
        errors: [redactError("not_installed", `${adapter.displayName} executable not found`)],
      });
    }

    const [cliVersion, authState, capabilities] = await Promise.all([
      adapter.getVersion(signal),
      adapter.getAuthState(signal),
      adapter.getCapabilities(signal),
    ]);

    if (authState === "not_authenticated") {
      return finish({
        installed: true,
        auth_state: authState,
        usage_capability: capabilities.usage,
        status: "not_authenticated",
        source: "none",
        ...(cliVersion ? { cli_version: cliVersion } : {}),
        stale: false,
        limits: [],
        errors: [redactError("auth_required", `${adapter.displayName} is not authenticated`)],
      });
    }

    if (capabilities.usage !== "supported") {
      return finish({
        installed: true,
        auth_state: authState,
        usage_capability: capabilities.usage,
        status: "unsupported",
        source: "none",
        ...(cliVersion ? { cli_version: cliVersion } : {}),
        stale: false,
        limits: [],
        errors: [
          redactError(
            "usage_unsupported",
            capabilities.reason ?? "No deterministic local usage source available",
          ),
        ],
      });
    }

    const limits = await adapter.fetchUsage(signal);
    const planLabel = redactPlanLabel(
      adapter.getPlanLabel ? await adapter.getPlanLabel(signal) : undefined,
    );
    return finish({
      installed: true,
      auth_state: authState,
      usage_capability: capabilities.usage,
      status: "ok",
      source: capabilities.source,
      ...(cliVersion ? { cli_version: cliVersion } : {}),
      ...(planLabel ? { plan_label: planLabel } : {}),
      stale: false,
      limits,
      errors: [],
    });
  } catch (error) {
    if (isTimeoutLike(error) || timeoutSignal.aborted) {
      return finish({
        installed: true,
        auth_state: "unknown",
        usage_capability: "unknown",
        status: "timeout",
        source: "none",
        stale: false,
        limits: [],
        errors: [
          redactError(
            "timeout",
            `${adapter.displayName} acquisition exceeded ${options.timeoutMs}ms`,
          ),
        ],
      });
    }
    if (error instanceof ProviderParseError) {
      return finish({
        installed: true,
        auth_state: "unknown",
        usage_capability: "supported",
        status: "parse_error",
        source: "none",
        stale: false,
        limits: [],
        errors: [redactError("parse_error", error.message)],
      });
    }
    if (error instanceof ProviderStatusError) {
      return finish({
        installed: true,
        auth_state: "unknown",
        usage_capability: "unknown",
        status: error.status,
        source: "none",
        stale: false,
        limits: [],
        errors: [redactError(error.status, error.message)],
      });
    }
    return finish({
      installed: true,
      auth_state: "unknown",
      usage_capability: "unknown",
      status: "unavailable",
      source: "none",
      stale: false,
      limits: [],
      errors: [
        redactError(
          "unavailable",
          error instanceof Error ? error.message : "Unknown provider failure",
        ),
      ],
    });
  }
}
