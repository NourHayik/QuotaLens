import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ProviderAdapter,
  ProviderCapabilities,
} from "../../core/application/provider-adapter.js";
import type { AuthState, UsageLimit } from "../../core/domain/index.js";
import { redactSecrets } from "../../infra/logging/redact.js";
import { assertAllowedArgs } from "../../infra/process/allowlist.js";
import { runProcess } from "../../infra/process/run-process.js";
import { CURSOR_ALLOWED_ARGS } from "./command-allowlist.js";
import type { CursorAboutResponse, CursorAdapterOptions, CursorStatusResponse } from "./types.js";
import {
  type CursorPeriodUsagePayload,
  type CursorRestPlanPayload,
  type CursorRestStripePayload,
  type CursorRestWebUsagePayload,
  type CursorSandUsagePayload,
  parseCursorRestUsage,
  parseCursorUsageJson,
} from "./usage-parser.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class CursorAdapter implements ProviderAdapter {
  readonly id = "cursor";
  readonly displayName = "Cursor";

  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly commandRunner: CursorAdapterOptions["commandRunner"] | undefined;
  private readonly now: (() => Date) | undefined;
  private readonly forceSupportedUsage: boolean | undefined;
  private readonly futureUsageRunner:
    | ((signal?: AbortSignal | undefined) => Promise<string>)
    | undefined;
  private readonly stateDbPath: string | undefined;
  private readonly apiBaseUrl: string | undefined;
  private readonly webBaseUrl: string | undefined;
  private readonly fetchImpl: typeof fetch;

  private cachedPlanLabel?: string | null;

  constructor(options: CursorAdapterOptions = {}) {
    this.executable = options.executable ?? "cursor-agent";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.commandRunner = options.commandRunner;
    this.now = options.now;
    this.forceSupportedUsage = options.forceSupportedUsage;
    this.futureUsageRunner = options.futureUsageRunner;
    this.stateDbPath = options.stateDbPath;
    this.apiBaseUrl = options.apiBaseUrl;
    this.webBaseUrl = options.webBaseUrl;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private getSessionAuth(): { token: string; sub?: string } | null {
    if (process.env.CURSOR_ACCESS_TOKEN) {
      const token = process.env.CURSOR_ACCESS_TOKEN;
      const sub = this.extractSubFromJwt(token);
      return sub ? { token, sub } : { token };
    }

    const dbPath =
      this.stateDbPath ??
      join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb");
    if (!existsSync(dbPath)) {
      return null;
    }

    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db
          .prepare("SELECT value FROM ItemTable WHERE key = ?")
          .get("cursorAuth/accessToken") as { value?: string } | undefined;
        if (!row?.value) {
          return null;
        }
        const token = row.value;
        const sub = this.extractSubFromJwt(token);
        return sub ? { token, sub } : { token };
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  }

  private extractSubFromJwt(jwt: string): string | null {
    try {
      const parts = jwt.split(".");
      const payloadPart = parts[1];
      if (payloadPart) {
        const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
          sub?: string;
        };
        return payload.sub ?? null;
      }
    } catch {
      // Ignore parse error
    }
    return null;
  }

  private async exec(
    args: string[],
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    if (this.commandRunner) {
      assertAllowedArgs(this.id, args, CURSOR_ALLOWED_ARGS);
      return this.commandRunner(args, signal);
    }
    assertAllowedArgs(this.id, args, CURSOR_ALLOWED_ARGS);
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

      const output = `${result.stdout}\n${result.stderr}`;
      const match =
        output.match(/(?:version\s+)?([0-9]{4}\.[0-9]{2}\.[0-9]{2}[^\s]*)/i) ??
        output.match(/(?:version\s+)?([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/i);

      return match?.[1] ?? (result.stdout.trim() || null);
    } catch {
      return null;
    }
  }

  async getAuthState(signal?: AbortSignal): Promise<AuthState> {
    if (this.getSessionAuth()) {
      return "authenticated";
    }

    try {
      // 1. Try JSON status first
      const result = await this.exec(["status", "--format", "json"], this.timeoutMs, signal);

      if (result.exitCode === 0 && result.stdout.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(result.stdout) as CursorStatusResponse;
          if (parsed.isAuthenticated === true || parsed.status === "authenticated") {
            return "authenticated";
          }
          if (parsed.isAuthenticated === false || parsed.status === "unauthenticated") {
            return "not_authenticated";
          }
        } catch {
          // Fall through to plain text check
        }
      }

      // 2. Fallback to plain text check
      const textResult = result.exitCode === 0 ? result : await this.exec(["status"], 3000, signal);
      const combined = `${textResult.stdout} ${textResult.stderr}`.toLowerCase();

      if (combined.includes("logged in as") || combined.includes('isauthenticated": true')) {
        return "authenticated";
      }
      if (
        combined.includes("not logged in") ||
        combined.includes("sign in") ||
        combined.includes("please login") ||
        combined.includes("unauthenticated")
      ) {
        return "not_authenticated";
      }

      return textResult.exitCode === 0 ? "authenticated" : "unknown";
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
    if (this.getSessionAuth()) {
      return {
        usage: "supported",
        source: "local-api",
      };
    }

    // Probe help to see if a deterministic usage command was added to this version
    try {
      const help = await this.exec(["--help"], 3000, signal);
      const text = `${help.stdout} ${help.stderr}`.toLowerCase();
      // Check for hypothetical future usage subcommands (e.g. "usage [options]", "quota")
      if (text.includes("usage [options]") || text.includes("limits [options]")) {
        return {
          usage: "supported",
          source: "cli-json",
        };
      }
    } catch {
      // Ignore probe errors, fall through to unsupported
    }

    return {
      usage: "unsupported",
      source: "none",
      reason:
        "Cursor CLI does not expose a deterministic local usage endpoint; usage is tracked in the web dashboard",
    };
  }

  async fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]> {
    const now = this.now ? this.now() : new Date();

    if (this.futureUsageRunner) {
      const raw = await this.futureUsageRunner(signal);
      const parsed = parseCursorUsageJson(raw, now);
      if (parsed.planLabel) {
        this.cachedPlanLabel = parsed.planLabel;
      }
      return parsed.limits;
    }

    // 1. If we have local session auth, query Cursor APIs
    const auth = this.getSessionAuth();
    if (auth) {
      try {
        const apiBaseUrl = (this.apiBaseUrl ?? "https://api2.cursor.sh").replace(/\/+$/, "");
        const webBaseUrl = (this.webBaseUrl ?? "https://www.cursor.com").replace(/\/+$/, "");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 6000));
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
          // A. Fetch ConnectRPC endpoints from api2.cursor.sh
          let planData: unknown;
          let periodUsageData: unknown;
          let sandUsageData: unknown;

          const rpcHeaders: Record<string, string> = {
            Authorization: `Bearer ${auth.token}`,
            "Connect-Protocol-Version": "1",
            "Content-Type": "application/json",
            "User-Agent": "cursor-agent/2026.09.10-fd3934a",
          };

          const [planRes, periodRes, sandRes] = await Promise.allSettled([
            this.fetchImpl(`${apiBaseUrl}/aiserver.v1.DashboardService/GetPlanInfo`, {
              method: "POST",
              headers: rpcHeaders,
              body: "{}",
              signal: controller.signal,
            }),
            this.fetchImpl(`${apiBaseUrl}/aiserver.v1.DashboardService/GetCurrentPeriodUsage`, {
              method: "POST",
              headers: rpcHeaders,
              body: "{}",
              signal: controller.signal,
            }),
            this.fetchImpl(`${apiBaseUrl}/aiserver.v1.DashboardService/GetSandUsageStatus`, {
              method: "POST",
              headers: rpcHeaders,
              body: "{}",
              signal: controller.signal,
            }),
          ]);

          if (planRes.status === "fulfilled" && planRes.value.ok) {
            try {
              planData = await planRes.value.json();
            } catch {
              // Ignore json parse error
            }
          }
          if (periodRes.status === "fulfilled" && periodRes.value.ok) {
            try {
              periodUsageData = await periodRes.value.json();
            } catch {
              // Ignore json parse error
            }
          }
          if (sandRes.status === "fulfilled" && sandRes.value.ok) {
            try {
              sandUsageData = await sandRes.value.json();
            } catch {
              // Ignore json parse error
            }
          }

          // B. Fetch web dashboard usage (requests, fast requests)
          let webUsageData: unknown;
          let stripeData: unknown;
          if (auth.sub) {
            const cookie = `WorkosCursorSessionToken=${auth.sub}%3A%3A${auth.token}`;
            try {
              const usageRes = await this.fetchImpl(`${webBaseUrl}/api/usage`, {
                headers: {
                  Cookie: cookie,
                  "User-Agent": "cursor-agent/2026.09.10-fd3934a",
                },
                signal: controller.signal,
              });
              if (usageRes.ok) {
                webUsageData = await usageRes.json();
              }
            } catch {
              // Ignore web usage failure
            }

            try {
              const stripeRes = await this.fetchImpl(`${webBaseUrl}/api/auth/stripe`, {
                headers: {
                  Cookie: cookie,
                  "User-Agent": "cursor-agent/2026.09.10-fd3934a",
                },
                signal: controller.signal,
              });
              if (stripeRes.ok) {
                stripeData = await stripeRes.json();
              }
            } catch {
              // Ignore stripe failure
            }
          }

          if (planData || periodUsageData || sandUsageData || webUsageData || stripeData) {
            const parsed = parseCursorRestUsage(
              planData as CursorRestPlanPayload | undefined,
              webUsageData as CursorRestWebUsagePayload | undefined,
              stripeData as CursorRestStripePayload | undefined,
              periodUsageData as CursorPeriodUsagePayload | undefined,
              sandUsageData as CursorSandUsagePayload | undefined,
              now,
            );
            if (parsed.planLabel) {
              this.cachedPlanLabel = parsed.planLabel;
            }
            if (parsed.limits.length > 0) {
              return parsed.limits;
            }
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

    // If future supported usage is enabled without a custom runner, try running "usage --format json"
    const result = await this.exec(["usage", "--format", "json"], this.timeoutMs, signal);
    const parsed = parseCursorUsageJson(result.stdout, now);
    if (parsed.planLabel) {
      this.cachedPlanLabel = parsed.planLabel;
    }
    return parsed.limits;
  }

  async getPlanLabel(signal?: AbortSignal): Promise<string | null> {
    if (this.cachedPlanLabel !== undefined) {
      return this.cachedPlanLabel;
    }

    // 1. Check local Cursor sqlite state
    const auth = this.getSessionAuth();
    if (auth) {
      const dbPath =
        this.stateDbPath ??
        join(homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb");
      if (existsSync(dbPath)) {
        try {
          const db = new DatabaseSync(dbPath, { readOnly: true });
          try {
            const row = db
              .prepare("SELECT value FROM ItemTable WHERE key = ?")
              .get("cursorAuth/stripeMembershipType") as { value?: string } | undefined;
            if (row?.value) {
              const cap = row.value.charAt(0).toUpperCase() + row.value.slice(1);
              this.cachedPlanLabel = cap;
              return cap;
            }
          } finally {
            db.close();
          }
        } catch {
          // Fall through
        }
      }
    }

    try {
      const result = await this.exec(["about", "--format", "json"], 3000, signal);
      if (result.exitCode === 0 && result.stdout.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(result.stdout) as CursorAboutResponse;
          if (parsed.subscriptionTier) {
            this.cachedPlanLabel = parsed.subscriptionTier;
            return this.cachedPlanLabel;
          }
        } catch {
          // Fall through
        }
      }

      // Plain text about fallback
      const textResult = result.exitCode === 0 ? result : await this.exec(["about"], 3000, signal);
      const match = textResult.stdout.match(/Subscription\s+Tier\s+([^\r\n]+)/i);
      if (match?.[1]) {
        this.cachedPlanLabel = match[1].trim();
        return this.cachedPlanLabel;
      }

      this.cachedPlanLabel = null;
      return null;
    } catch {
      this.cachedPlanLabel = null;
      return null;
    }
  }
}
