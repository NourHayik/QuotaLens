import type {
  ProviderAdapter,
  ProviderCapabilities,
} from "../../core/application/provider-adapter.js";
import type { AuthState, UsageLimit } from "../../core/domain/index.js";
import { redactSecrets } from "../../infra/logging/redact.js";
import { assertAllowedArgs } from "../../infra/process/allowlist.js";
import { runProcess } from "../../infra/process/run-process.js";
import { CodexAppServerClient } from "./app-server-client.js";
import { CODEX_ALLOWED_ARGS } from "./command-allowlist.js";
import { mapCodexRateLimits } from "./rate-limit-mapper.js";
import { parseCodexStatusText } from "./status-fallback.js";
import type { CodexAdapterOptions, CodexAppServerClientLike, CodexClientOptions } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Real provider adapter for OpenAI Codex using its app-server JSON-RPC interface.
 *
 * Guarantees:
 * - Deterministic, structured rate limit collection via `codex app-server --stdio`.
 * - Non-secret auth detection via `codex login status`.
 * - Never invokes an AI model prompt.
 * - Preserves single-window accounts without fabricating absent limits.
 * - Falls back to `/status` text parsing only when app-server fails or is unavailable.
 */
export class CodexAdapter implements ProviderAdapter {
  readonly id = "codex";
  readonly displayName = "Codex";

  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly clientFactory: (options: CodexClientOptions) => CodexAppServerClientLike;
  private readonly usesCustomClient: boolean;
  private readonly statusFallbackRunner?: ((signal?: AbortSignal) => Promise<string>) | undefined;
  private readonly now?: (() => Date) | undefined;

  private lastPlanLabel?: string | undefined;

  constructor(options: CodexAdapterOptions = {}) {
    this.executable = options.executable ?? "codex";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.usesCustomClient = Boolean(options.clientFactory);
    this.clientFactory = options.clientFactory ?? ((opts) => new CodexAppServerClient(opts));
    this.statusFallbackRunner = options.statusFallbackRunner;
    this.now = options.now;
  }

  async detect(signal?: AbortSignal): Promise<boolean> {
    try {
      assertAllowedArgs(this.id, ["--version"], CODEX_ALLOWED_ARGS);
      const result = await runProcess({
        executable: this.executable,
        args: ["--version"],
        timeoutMs: 3000,
        ...(signal ? { signal } : {}),
        redact: redactSecrets,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getVersion(signal?: AbortSignal): Promise<string | null> {
    try {
      assertAllowedArgs(this.id, ["--version"], CODEX_ALLOWED_ARGS);
      const result = await runProcess({
        executable: this.executable,
        args: ["--version"],
        timeoutMs: 3000,
        ...(signal ? { signal } : {}),
        redact: redactSecrets,
      });
      if (result.exitCode !== 0) return null;

      const match =
        result.stdout.match(/(?:codex-cli|codex)\s+([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/i) ??
        result.stdout.match(/\b([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/);

      return match?.[1] ?? (result.stdout.trim() || null);
    } catch {
      return null;
    }
  }

  async getAuthState(signal?: AbortSignal): Promise<AuthState> {
    try {
      assertAllowedArgs(this.id, ["login", "status"], CODEX_ALLOWED_ARGS);
      const result = await runProcess({
        executable: this.executable,
        args: ["login", "status"],
        timeoutMs: 3000,
        ...(signal ? { signal } : {}),
        redact: redactSecrets,
      });

      const out = `${result.stdout} ${result.stderr}`.toLowerCase();
      if (result.exitCode === 0 && out.includes("logged in")) {
        return "authenticated";
      }
      if (out.includes("not logged in") || result.exitCode !== 0) {
        return "not_authenticated";
      }

      return "unknown";
    } catch {
      return "unknown";
    }
  }

  async getCapabilities(_signal?: AbortSignal): Promise<ProviderCapabilities> {
    return {
      usage: "supported",
      source: "app-server",
    };
  }

  async fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]> {
    let client: CodexAppServerClientLike | null = null;
    try {
      if (!this.usesCustomClient) {
        assertAllowedArgs(this.id, ["app-server", "--stdio"], CODEX_ALLOWED_ARGS);
      }
      client = this.clientFactory({
        executable: this.executable,
        timeoutMs: this.timeoutMs,
        signal,
      });

      await client.start(signal);
      const data = await client.readRateLimits(signal);
      await client.close();

      const now = this.now ? this.now() : new Date();
      const mapped = mapCodexRateLimits(data, now);
      this.lastPlanLabel = mapped.planLabel;
      return mapped.limits;
    } catch (appServerErr) {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore close errors on failure path
        }
      }

      // If app-server failed and a status fallback runner is configured, attempt deterministic fallback
      if (this.statusFallbackRunner) {
        try {
          const rawStatus = await this.statusFallbackRunner(signal);
          const now = this.now ? this.now() : new Date();
          const fallbackResult = parseCodexStatusText(rawStatus, now);
          this.lastPlanLabel = fallbackResult.planLabel;
          return fallbackResult.limits;
        } catch {
          // If fallback fails too, rethrow original app-server error
        }
      }

      throw appServerErr;
    }
  }

  async getPlanLabel(_signal?: AbortSignal): Promise<string | null> {
    return this.lastPlanLabel ?? null;
  }
}
