import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ProviderAdapter,
  ProviderCapabilities,
} from "../../core/application/provider-adapter.js";
import type { AuthState, UsageLimit } from "../../core/domain/index.js";
import { redactSecrets } from "../../infra/logging/redact.js";
import { assertAllowedArgs } from "../../infra/process/allowlist.js";
import { cleanTerminalOutput } from "../../infra/process/ansi.js";
import { runProcess } from "../../infra/process/run-process.js";
import { OPENCODE_ALLOWED_ARGS } from "./command-allowlist.js";
import type { OpenCodeAdapterOptions } from "./types.js";
import { parseOpenCodeRestUsage, parseOpenCodeUsageJson } from "./usage-parser.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class OpenCodeAdapter implements ProviderAdapter {
  readonly id = "opencode";
  readonly displayName = "OpenCode Go";

  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly commandRunner: OpenCodeAdapterOptions["commandRunner"] | undefined;
  private readonly now: (() => Date) | undefined;
  private readonly forceSupportedUsage: boolean | undefined;
  private readonly futureUsageRunner:
    | ((signal?: AbortSignal | undefined) => Promise<string>)
    | undefined;
  private readonly authPath: string | undefined;
  private readonly apiBaseUrl: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenCodeAdapterOptions = {}) {
    this.executable = options.executable ?? "opencode";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.commandRunner = options.commandRunner;
    this.now = options.now;
    this.forceSupportedUsage = options.forceSupportedUsage;
    this.futureUsageRunner = options.futureUsageRunner;
    this.authPath = options.authPath;
    this.apiBaseUrl = options.apiBaseUrl;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private getApiKey(): string | null {
    if (process.env.OPENCODE_API_KEY) {
      return process.env.OPENCODE_API_KEY;
    }
    const authPath = this.authPath ?? join(homedir(), ".local", "share", "opencode", "auth.json");
    if (!existsSync(authPath)) {
      return null;
    }
    try {
      const raw = readFileSync(authPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, { key?: string }>;
      return parsed["opencode-go"]?.key ?? parsed.opencode?.key ?? null;
    } catch {
      return null;
    }
  }

  private async exec(
    args: string[],
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    if (this.commandRunner) {
      assertAllowedArgs(this.id, args, OPENCODE_ALLOWED_ARGS);
      return this.commandRunner(args, signal);
    }
    assertAllowedArgs(this.id, args, OPENCODE_ALLOWED_ARGS);
    return runProcess({
      executable: this.executable,
      args,
      timeoutMs: timeoutMs ?? this.timeoutMs,
      ...(signal ? { signal } : {}),
      redact: redactSecrets,
    });
  }

  async detect(signal?: AbortSignal): Promise<boolean> {
    try {
      const result = await this.exec(["--version"], this.timeoutMs, signal);
      return result.exitCode === 0;
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof Error &&
          (error.name === "ProcessTimeoutError" || error.name === "ProcessAbortedError"))
      ) {
        throw error;
      }
      return false;
    }
  }

  async getVersion(signal?: AbortSignal): Promise<string | null> {
    try {
      const result = await this.exec(["--version"], this.timeoutMs, signal);
      if (result.exitCode !== 0) return null;

      const cleaned = cleanTerminalOutput(result.stdout);
      const match = cleaned.match(/\b([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/);
      return match?.[1] ?? (cleaned.trim() || null);
    } catch {
      return null;
    }
  }

  async getAuthState(signal?: AbortSignal): Promise<AuthState> {
    if (this.getApiKey()) {
      return "authenticated";
    }
    try {
      const result = await this.exec(["auth", "list"], this.timeoutMs, signal);
      const cleaned = cleanTerminalOutput(`${result.stdout} ${result.stderr}`).toLowerCase();

      // Check for presence of OpenCode Go provider or credentials
      if (cleaned.includes("opencode go") || cleaned.includes("go api")) {
        return "authenticated";
      }

      if (
        cleaned.includes("0 credentials") ||
        cleaned.includes("no credentials") ||
        cleaned.includes("not logged in") ||
        cleaned.includes("no configured provider")
      ) {
        return "not_authenticated";
      }

      return result.exitCode === 0 ? "unknown" : "not_authenticated";
    } catch {
      return "unknown";
    }
  }

  async getCapabilities(signal?: AbortSignal): Promise<ProviderCapabilities> {
    if (this.forceSupportedUsage) {
      return {
        usage: "supported",
        source: "cli-json",
      };
    }
    if (this.futureUsageRunner) {
      return {
        usage: "supported",
        source: "cli-json",
      };
    }
    if (this.getApiKey()) {
      return {
        usage: "supported",
        source: "local-api",
      };
    }

    // Probe help to see if a dedicated Go usage subcommand was introduced
    try {
      const help = await this.exec(["--help"], 3000, signal);
      const text = cleanTerminalOutput(`${help.stdout} ${help.stderr}`).toLowerCase();
      // Look for hypothetical dedicated quota / limit commands
      if (
        text.includes("usage [command]") ||
        text.includes("limits [command]") ||
        text.includes("quota [command]")
      ) {
        return {
          usage: "supported",
          source: "cli-json",
        };
      }
    } catch {
      // Fall through to unsupported
    }

    return {
      usage: "unsupported",
      source: "none",
      reason:
        "OpenCode CLI does not expose a deterministic local usage endpoint for Go subscription limits; usage is tracked in the console",
    };
  }

  async fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]> {
    const now = this.now ? this.now() : new Date();

    if (this.futureUsageRunner) {
      const raw = await this.futureUsageRunner(signal);
      const parsed = parseOpenCodeUsageJson(raw, now);
      return parsed.limits;
    }

    // 1. If we have an API key, call the OpenCode Go usage endpoint directly
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const baseUrl = (this.apiBaseUrl ?? "https://opencode.ai/zen/go/v1").replace(/\/+$/, "");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
          const res = await this.fetchImpl(`${baseUrl}/usage`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "User-Agent": "opencode/1.18.27",
            },
            signal: controller.signal,
          });

          if (res.ok) {
            const data = await res.json();
            const parsed = parseOpenCodeRestUsage(data, now);
            return parsed.limits;
          }
        } finally {
          clearTimeout(timeoutId);
          signal?.removeEventListener("abort", onAbort);
        }
      } catch {
        // Fall through
      }
    }

    const caps = await this.getCapabilities(signal);
    if (caps.usage !== "supported") {
      return [];
    }

    // If future supported usage is enabled without custom runner, try running "usage --format json"
    const result = await this.exec(["usage", "--format", "json"], this.timeoutMs, signal);
    const parsed = parseOpenCodeUsageJson(result.stdout, now);
    return parsed.limits;
  }

  async getPlanLabel(_signal?: AbortSignal): Promise<string | null> {
    return "OpenCode Go";
  }
}
