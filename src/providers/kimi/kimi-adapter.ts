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
import { type PtyFactory, runPtyInteractive } from "../../infra/process/pty.js";
import { runProcess } from "../../infra/process/run-process.js";
import { KIMI_ALLOWED_ARGS } from "./command-allowlist.js";
import type { KimiAdapterOptions } from "./types.js";
import { parseKimiRestUsage, parseKimiUsageText } from "./usage-parser.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export class KimiAdapter implements ProviderAdapter {
  readonly id = "kimi";
  readonly displayName = "Kimi";

  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly ptyFactory: PtyFactory | undefined;
  private readonly ptyRunner: ((signal?: AbortSignal) => Promise<string>) | undefined;
  private readonly now: (() => Date) | undefined;
  private readonly credentialsPath: string | undefined;
  private readonly apiBaseUrl: string | undefined;
  private readonly fetchImpl: typeof fetch;

  private lastPlanLabel?: string | undefined;

  constructor(options: KimiAdapterOptions = {}) {
    this.executable = options.executable ?? "kimi";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.ptyFactory = options.ptyFactory;
    this.ptyRunner = options.ptyRunner;
    this.now = options.now;
    this.credentialsPath = options.credentialsPath;
    this.apiBaseUrl = options.apiBaseUrl;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private getAccessToken(): string | null {
    if (process.env.KIMI_ACCESS_TOKEN) {
      return process.env.KIMI_ACCESS_TOKEN;
    }
    const credPath =
      this.credentialsPath ?? join(homedir(), ".kimi-code", "credentials", "kimi-code.json");
    if (!existsSync(credPath)) {
      return null;
    }
    try {
      const raw = readFileSync(credPath, "utf8");
      const parsed = JSON.parse(raw) as { access_token?: string };
      return parsed.access_token ?? null;
    } catch {
      return null;
    }
  }

  private async exec(args: readonly string[], timeoutMs: number, signal?: AbortSignal) {
    assertAllowedArgs(this.id, args, KIMI_ALLOWED_ARGS);
    return runProcess({
      executable: this.executable,
      args,
      timeoutMs,
      ...(signal ? { signal } : {}),
      redact: redactSecrets,
    });
  }

  async detect(signal?: AbortSignal): Promise<boolean> {
    try {
      const result = await this.exec(["--version"], 3000, signal);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getVersion(signal?: AbortSignal): Promise<string | null> {
    try {
      const result = await this.exec(["--version"], 3000, signal);
      if (result.exitCode !== 0) return null;

      const match =
        result.stdout.match(/(?:kimi|version)\s+([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/i) ??
        result.stdout.match(/\b([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/);

      return match?.[1] ?? (result.stdout.trim() || null);
    } catch {
      return null;
    }
  }

  async getAuthState(signal?: AbortSignal): Promise<AuthState> {
    try {
      const result = await this.exec(["provider", "list"], 3000, signal);

      const out = `${result.stdout} ${result.stderr}`.toLowerCase();
      if (
        result.exitCode === 0 &&
        (out.includes("managed:kimi-code") || out.includes("source=oauth"))
      ) {
        return "authenticated";
      }
      if (
        out.includes("not logged in") ||
        out.includes("no configured provider") ||
        result.exitCode !== 0
      ) {
        return "not_authenticated";
      }

      return "unknown";
    } catch {
      return "unknown";
    }
  }

  async getCapabilities(_signal?: AbortSignal): Promise<ProviderCapabilities> {
    if (this.ptyRunner) {
      return {
        usage: "supported",
        source: "tui-pty",
      };
    }
    const token = this.getAccessToken();
    if (token) {
      return {
        usage: "supported",
        source: "local-api",
      };
    }
    return {
      usage: "supported",
      source: "tui-pty",
    };
  }

  async fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]> {
    const now = this.now ? this.now() : new Date();

    // 1. If a custom ptyRunner is explicitly configured (e.g. in tests), use it
    if (this.ptyRunner) {
      const rawOutput = await this.ptyRunner(signal);
      const parsed = parseKimiUsageText(rawOutput, now);
      this.lastPlanLabel = parsed.planLabel ?? this.lastPlanLabel ?? "Kimi Code";
      return parsed.limits;
    }

    // 2. Try fast real-time REST API if access token is available
    const token = this.getAccessToken();
    if (token) {
      try {
        const baseUrl = (this.apiBaseUrl ?? "https://api.kimi.com/coding/v1").replace(/\/+$/, "");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
          const res = await this.fetchImpl(`${baseUrl}/usages`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          });

          if (res.ok) {
            const data = await res.json();
            const parsed = parseKimiRestUsage(data, now);

            // Also try fetching profile /me for user level name
            try {
              const meRes = await this.fetchImpl(`${baseUrl}/me`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                signal: controller.signal,
              });
              if (meRes.ok) {
                const meData = (await meRes.json()) as { user_level_name?: string };
                if (meData.user_level_name) {
                  this.lastPlanLabel = `Kimi Code (${meData.user_level_name})`;
                }
              }
            } catch {
              // Ignore profile lookup errors
            }

            this.lastPlanLabel = this.lastPlanLabel ?? "Kimi Code";
            return parsed.limits;
          }
        } finally {
          clearTimeout(timeoutId);
          signal?.removeEventListener("abort", onAbort);
        }
      } catch {
        // Fall back to PTY on network/API failure
      }
    }

    // 3. Fallback to interactive PTY simulation
    assertAllowedArgs(this.id, [], KIMI_ALLOWED_ARGS);
    const rawOutput = await runPtyInteractive({
      executable: this.executable,
      args: [],
      timeoutMs: this.timeoutMs,
      ...(signal ? { signal } : {}),
      ...(this.ptyFactory ? { ptyFactory: this.ptyFactory } : {}),
      cols: 120,
      rows: 35,
      interact: async (session, getOutput) => {
        let trusted = false;
        let sentUsage = false;
        let completed = false;
        const startTime = Date.now();

        while (!completed && Date.now() - startTime < this.timeoutMs) {
          const current = getOutput();

          // 1. Auto-accept "Trust this folder?" prompt if it appears
          if (!trusted && current.includes("Trust this folder")) {
            session.write("\r");
            trusted = true;
          }

          // 2. Wait for main interactive prompt to be ready, then send /usage
          if (
            !sentUsage &&
            (trusted || current.includes("Welcome to Kimi Code") || current.includes("context:")) &&
            Date.now() - startTime > 1500
          ) {
            session.write("/usage\r");
            sentUsage = true;
          }

          // 3. Detect when /usage output is rendered
          if (
            sentUsage &&
            (current.includes("Plan usage") ||
              current.includes("Weekly limit") ||
              current.includes("5h limit") ||
              current.includes("Session usage") ||
              current.includes("Send /login to login"))
          ) {
            completed = true;
            // Cleanly exit session
            session.write("\x03/exit\r");
            break;
          }

          await new Promise((r) => setTimeout(r, 100));
        }
      },
    });

    const parsed = parseKimiUsageText(rawOutput, now);
    this.lastPlanLabel = parsed.planLabel ?? this.lastPlanLabel ?? "Kimi Code";
    return parsed.limits;
  }

  async getPlanLabel(_signal?: AbortSignal): Promise<string | null> {
    return this.lastPlanLabel ?? "Kimi Code";
  }
}
