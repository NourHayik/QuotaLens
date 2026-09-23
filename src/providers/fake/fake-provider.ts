import type { ProviderAdapter, ProviderCapabilities } from "../../core/application/index.js";
import type { AuthState, UsageLimit } from "../../core/domain/index.js";
import { runProcess } from "../../infra/process/index.js";

export type FakeProviderMode =
  | "healthy"
  | "hang"
  | "error"
  | "not_installed"
  | "not_authenticated"
  | "unsupported"
  | "partial";

export interface FakeProviderOptions {
  id?: string;
  displayName?: string;
  cliVersion?: string;
  mode: FakeProviderMode;
  /** Overrides for the deterministic healthy fixture, used by tests. */
  now?: Date;
  /** Optional simulated delay in milliseconds before returning. */
  delayMs?: number;
  /** Custom error message when mode is "error". */
  errorMessage?: string;
}

const HANG_SENTINEL_MS = 60_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Demo/fake adapter proving the architecture end to end without real CLIs.
 *
 * Supports deterministic modes for testing:
 * - "healthy": multi-window normalized limits
 * - "hang": spawns a sleeper process to test timeout/cancellation
 * - "error": throws a runtime error
 * - "not_installed": detect() returns false
 * - "not_authenticated": getAuthState() returns "not_authenticated"
 * - "unsupported": getCapabilities() returns unsupported usage
 * - "partial": single-window limit
 */
export function createFakeProvider(options: FakeProviderOptions): ProviderAdapter {
  const providerId = options.id ?? "fake";
  const displayName = options.displayName ?? "Fake Provider";
  const cliVersion = options.cliVersion ?? "0.0.0-fake";
  const now = options.now ?? new Date("2026-09-15T05:00:00.000Z");

  const healthyLimits: UsageLimit[] = [
    {
      id: "primary",
      name: "5-hour rolling window",
      category: "rolling_window",
      window_minutes: 300,
      used_percent: 42,
      remaining_percent: 58,
      resets_at: new Date(now.getTime() + 120 * 60_000).toISOString(),
      reset_countdown_seconds: 120 * 60,
    },
    {
      id: "weekly",
      name: "Weekly quota",
      category: "weekly",
      window_minutes: 10_080,
      used_percent: 10,
      remaining_percent: 90,
      resets_at: new Date(now.getTime() + 3 * 24 * 60 * 60_000).toISOString(),
      reset_countdown_seconds: 3 * 24 * 60 * 60,
    },
  ];

  const partialLimits: UsageLimit[] = [
    {
      id: "primary",
      name: "5-hour rolling window",
      category: "rolling_window",
      window_minutes: 300,
      used_percent: 55,
      remaining_percent: 45,
      resets_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
      reset_countdown_seconds: 60 * 60,
    },
  ];

  return {
    id: providerId,
    displayName,

    detect: async (_signal?: AbortSignal) => {
      if (options.delayMs) await sleep(options.delayMs, _signal);
      return options.mode !== "not_installed";
    },

    getVersion: async (_signal?: AbortSignal) => {
      if (options.delayMs) await sleep(options.delayMs, _signal);
      return cliVersion;
    },

    getAuthState: async (_signal?: AbortSignal): Promise<AuthState> => {
      if (options.delayMs) await sleep(options.delayMs, _signal);
      if (options.mode === "not_authenticated") return "not_authenticated";
      return "authenticated";
    },

    getCapabilities: async (_signal?: AbortSignal): Promise<ProviderCapabilities> => {
      if (options.delayMs) await sleep(options.delayMs, _signal);
      if (options.mode === "unsupported") {
        return {
          usage: "unsupported",
          source: "none",
          reason: "CLI does not expose local usage commands",
        };
      }
      return { usage: "supported", source: "fixture" };
    },

    async fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]> {
      if (options.delayMs) await sleep(options.delayMs, signal);

      if (options.mode === "hang") {
        // Local sleeper process; the service-level timeout/abort must kill it.
        await runProcess({
          executable: process.execPath,
          args: ["-e", `setTimeout(() => {}, ${HANG_SENTINEL_MS})`],
          timeoutMs: HANG_SENTINEL_MS,
          ...(signal ? { signal } : {}),
        });
        return [];
      }

      if (options.mode === "error") {
        throw new Error(options.errorMessage ?? "Simulated adapter crash");
      }

      if (options.mode === "partial") {
        return partialLimits;
      }

      return healthyLimits;
    },
  };
}
