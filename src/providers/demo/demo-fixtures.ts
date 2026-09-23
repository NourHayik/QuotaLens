import {
  type ProviderAdapter,
  type ProviderCapabilities,
  ProviderRegistry,
  ProviderStatusError,
} from "../../core/application/index.js";
import type { AuthState, UsageLimit } from "../../core/domain/index.js";

export type DemoProviderMode =
  | "healthy"
  | "missing_window"
  | "unsupported"
  | "not_authenticated"
  | "not_installed"
  | "timeout"
  | "parse_error";

export interface DemoProviderOptions {
  id: string;
  displayName: string;
  cliVersion?: string;
  mode?: DemoProviderMode;
  now?: Date;
  customLimits?: UsageLimit[];
  unsupportedReason?: string;
}

export interface DemoRegistryOptions {
  now?: Date;
  modes?: Partial<Record<string, DemoProviderMode>>;
}

export const PRIORITY_PROVIDER_IDS = [
  "codex",
  "kimi",
  "antigravity",
  "cursor",
  "opencode",
] as const;

function buildCodexLimits(now: Date): UsageLimit[] {
  return [
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
      used_percent: 15,
      remaining_percent: 85,
      resets_at: new Date(now.getTime() + 3 * 24 * 60 * 60_000).toISOString(),
      reset_countdown_seconds: 3 * 24 * 60 * 60,
    },
  ];
}

function buildKimiLimits(now: Date): UsageLimit[] {
  return [
    {
      id: "primary",
      name: "5-hour rolling window",
      category: "rolling_window",
      window_minutes: 300,
      used_percent: 30,
      remaining_percent: 70,
      resets_at: new Date(now.getTime() + 180 * 60_000).toISOString(),
      reset_countdown_seconds: 180 * 60,
    },
    {
      id: "weekly",
      name: "Weekly quota",
      category: "weekly",
      window_minutes: 10_080,
      used_percent: 10,
      remaining_percent: 90,
      resets_at: new Date(now.getTime() + 4 * 24 * 60 * 60_000).toISOString(),
      reset_countdown_seconds: 4 * 24 * 60 * 60,
    },
  ];
}

function buildAntigravityLimits(now: Date): UsageLimit[] {
  return [
    {
      id: "gemini-flash",
      name: "Gemini 2.5 Flash",
      category: "model_specific",
      model_id: "gemini-2.5-flash",
      window_minutes: 1440,
      used_percent: 60,
      remaining_percent: 40,
      resets_at: new Date(now.getTime() + 8 * 60 * 60_000).toISOString(),
      reset_countdown_seconds: 8 * 60 * 60,
    },
    {
      id: "gemini-pro",
      name: "Gemini 2.5 Pro",
      category: "model_specific",
      model_id: "gemini-2.5-pro",
      window_minutes: 1440,
      used_percent: 25,
      remaining_percent: 75,
      resets_at: new Date(now.getTime() + 14 * 60 * 60_000).toISOString(),
      reset_countdown_seconds: 14 * 60 * 60,
    },
  ];
}

function sleepUntilAborted(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => resolve(), 60_000);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    });
  });
}

/**
 * Creates a deterministic demo provider adapter for testing and offline CLI preview.
 */
export function createDemoProvider(options: DemoProviderOptions): ProviderAdapter {
  const mode = options.mode ?? "healthy";
  const now = options.now ?? new Date("2026-09-15T09:00:00.000Z");

  return {
    id: options.id,
    displayName: options.displayName,

    detect: async () => {
      return mode !== "not_installed";
    },

    getVersion: async () => {
      return options.cliVersion ?? "1.0.0-demo";
    },

    getAuthState: async (): Promise<AuthState> => {
      if (mode === "not_authenticated") {
        return "not_authenticated";
      }
      return "authenticated";
    },

    getCapabilities: async (): Promise<ProviderCapabilities> => {
      if (mode === "unsupported") {
        return {
          usage: "unsupported",
          source: "none",
          reason: options.unsupportedReason ?? "No deterministic local usage source available",
        };
      }
      return {
        usage: "supported",
        source: options.id === "codex" ? "app-server" : "tui-pty",
      };
    },

    fetchUsage: async (signal?: AbortSignal): Promise<UsageLimit[]> => {
      if (mode === "timeout") {
        await sleepUntilAborted(signal);
        return [];
      }

      if (mode === "parse_error") {
        throw new ProviderStatusError(
          "parse_error",
          `Failed to parse ${options.displayName} output: unexpected token or schema drift`,
        );
      }

      if (mode === "missing_window") {
        const limits = options.customLimits ?? buildCodexLimits(now);
        return limits.slice(0, 1);
      }

      if (options.customLimits) {
        return options.customLimits;
      }

      switch (options.id) {
        case "codex":
          return buildCodexLimits(now);
        case "kimi":
          return buildKimiLimits(now);
        case "antigravity":
          return buildAntigravityLimits(now);
        default:
          return [];
      }
    },
  };
}

/**
 * Registers demo adapters for all 5 priority providers into a registry.
 */
export function registerDemoProviders(
  registry: ProviderRegistry,
  options?: DemoRegistryOptions,
): void {
  const now = options?.now ?? new Date("2026-09-15T09:00:00.000Z");
  const modes = options?.modes ?? {};

  // 1. Codex
  registry.register(
    createDemoProvider({
      id: "codex",
      displayName: "Codex",
      cliVersion: "0.14.0",
      mode: modes.codex ?? "healthy",
      now,
    }),
  );

  // 2. Kimi Code
  registry.register(
    createDemoProvider({
      id: "kimi",
      displayName: "Kimi Code",
      cliVersion: "1.2.0",
      mode: modes.kimi ?? "healthy",
      now,
    }),
  );

  // 3. Google Antigravity
  registry.register(
    createDemoProvider({
      id: "antigravity",
      displayName: "Google Antigravity",
      cliVersion: "2.0.4",
      mode: modes.antigravity ?? "healthy",
      now,
    }),
  );

  // 4. Cursor (documented usage unsupported in CLI)
  registry.register(
    createDemoProvider({
      id: "cursor",
      displayName: "Cursor",
      cliVersion: "0.45.1",
      mode: modes.cursor ?? "unsupported",
      unsupportedReason: "Cursor CLI does not expose a local usage command",
      now,
    }),
  );

  // 5. OpenCode Go (console-only usage tracking)
  registry.register(
    createDemoProvider({
      id: "opencode",
      displayName: "OpenCode Go",
      cliVersion: "1.0.8",
      mode: modes.opencode ?? "unsupported",
      unsupportedReason: "OpenCode CLI usage tracking is console-only",
      now,
    }),
  );
}

/**
 * Creates a new ProviderRegistry pre-populated with all 5 priority demo providers.
 */
export function createDemoRegistry(options?: DemoRegistryOptions): ProviderRegistry {
  const registry = new ProviderRegistry();
  registerDemoProviders(registry, options);
  return registry;
}
