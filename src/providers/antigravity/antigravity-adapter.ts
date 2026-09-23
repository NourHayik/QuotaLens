import type {
  ProviderAdapter,
  ProviderCapabilities,
} from "../../core/application/provider-adapter.js";
import type { AuthState, UsageLimit } from "../../core/domain/index.js";
import { redactSecrets } from "../../infra/logging/redact.js";
import { assertAllowedArgs } from "../../infra/process/allowlist.js";
import { type PtyFactory, runPtyInteractive } from "../../infra/process/pty.js";
import { runProcess } from "../../infra/process/run-process.js";
import { ANTIGRAVITY_ALLOWED_ARGS } from "./command-allowlist.js";
import type { AntigravityAdapterOptions } from "./types.js";
import { parseAntigravityUsageText } from "./usage-parser.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export class AntigravityAdapter implements ProviderAdapter {
  readonly id = "antigravity";
  readonly displayName = "Gemini / Antigravity";

  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly ptyFactory: PtyFactory | undefined;
  private readonly ptyRunner: ((signal?: AbortSignal) => Promise<string>) | undefined;
  private readonly now: (() => Date) | undefined;

  private lastPlanLabel?: string | undefined;

  constructor(options: AntigravityAdapterOptions = {}) {
    this.executable = options.executable ?? "agy";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.ptyFactory = options.ptyFactory;
    this.ptyRunner = options.ptyRunner;
    this.now = options.now;
  }

  private async exec(args: readonly string[], timeoutMs: number, signal?: AbortSignal) {
    assertAllowedArgs(this.id, args, ANTIGRAVITY_ALLOWED_ARGS);
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
        result.stdout.match(/(?:antigravity|agy|version)\s+([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/i) ??
        result.stdout.match(/\b([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/);

      return match?.[1] ?? (result.stdout.trim() || null);
    } catch {
      return null;
    }
  }

  async getAuthState(signal?: AbortSignal): Promise<AuthState> {
    try {
      const result = await this.exec(["models"], 4000, signal);

      const out = `${result.stdout} ${result.stderr}`.toLowerCase();
      if (
        result.exitCode === 0 &&
        (out.includes("gemini") || out.includes("claude") || out.includes("gpt"))
      ) {
        return "authenticated";
      }
      if (out.includes("not signed in") || out.includes("login") || result.exitCode !== 0) {
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
      source: "tui-pty",
    };
  }

  async fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]> {
    let rawOutput: string;

    if (this.ptyRunner) {
      rawOutput = await this.ptyRunner(signal);
    } else {
      assertAllowedArgs(this.id, [], ANTIGRAVITY_ALLOWED_ARGS);
      rawOutput = await runPtyInteractive({
        executable: this.executable,
        args: [],
        timeoutMs: this.timeoutMs,
        ...(signal ? { signal } : {}),
        ...(this.ptyFactory ? { ptyFactory: this.ptyFactory } : {}),
        cols: 120,
        rows: 35,
        interact: async (session, getOutput) => {
          let sentUsage = false;
          let completed = false;
          const startTime = Date.now();

          while (!completed && Date.now() - startTime < this.timeoutMs) {
            const current = getOutput();

            // 1. Wait for interactive prompt to settle, then send /usage
            if (
              !sentUsage &&
              (current.includes("? for shortcuts") || current.includes("Accept-edits")) &&
              Date.now() - startTime > 3200
            ) {
              session.write("/usage\r");
              sentUsage = true;
            }

            // 2. Detect when /usage quota dialog is displayed
            if (
              sentUsage &&
              (current.includes("Weekly Limit Remaining") ||
                current.includes("Five Hour Limit Remaining") ||
                current.includes("Models within this group"))
            ) {
              // Wait briefly for full table to be emitted to stdout
              await new Promise((r) => setTimeout(r, 800));
              completed = true;
              session.write("\x1b\x03/exit\r");
              break;
            }

            await new Promise((r) => setTimeout(r, 100));
          }
        },
      });
    }

    const now = this.now ? this.now() : new Date();
    const parsed = parseAntigravityUsageText(rawOutput, now);
    this.lastPlanLabel = parsed.planLabel ?? this.lastPlanLabel ?? "Google AI";
    return parsed.limits;
  }

  async getPlanLabel(_signal?: AbortSignal): Promise<string | null> {
    return this.lastPlanLabel ?? "Google AI";
  }
}
