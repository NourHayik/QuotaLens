import { type ChildProcess, spawn } from "node:child_process";
import { redactSecrets } from "../../infra/logging/redact.js";
import {
  ProcessAbortedError,
  ProcessSpawnError,
  ProcessTimeoutError,
} from "../../infra/process/errors.js";
import { processRegistry } from "../../infra/process/process-registry.js";
import type {
  CodexAppServerClientLike,
  CodexClientOptions,
  CodexRateLimitsResult,
  JsonRpcError,
  JsonRpcId,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const SIGKILL_GRACE_MS = 250;
const CLOSE_GRACE_MS = 1_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
  cleanupSignal?: () => void;
}

/**
 * Manages the stdio JSON-RPC 2.0 connection to `codex app-server --stdio`.
 *
 * Guarantees:
 * - Line-delimited NDJSON protocol over stdio.
 * - Matches request/response by ID.
 * - Handles interleaved server notifications without blocking.
 * - Safe subprocess lifecycle with detached process tree cleanup on timeout or abort.
 * - Redacts all captured stderr/stdout error traces.
 * - Never invokes an AI model prompt.
 */
export class CodexAppServerClient implements CodexAppServerClientLike {
  private readonly executable: string;
  private readonly args: readonly string[];
  private readonly cwd?: string | undefined;
  private readonly env?: Readonly<Record<string, string>> | undefined;
  private readonly defaultTimeoutMs: number;

  private child: ChildProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private stdoutBuffer = "";
  private stderrChunks: Buffer[] = [];
  private closed = false;
  private exitPromise: Promise<number | null> | null = null;

  constructor(options: CodexClientOptions = {}) {
    this.executable = options.executable ?? "codex";
    this.args = options.args ?? ["app-server", "--stdio"];
    this.cwd = options.cwd;
    this.env = options.env;
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Spawns the app-server process and sends the `initialize` handshake.
   */
  async start(signal?: AbortSignal): Promise<void> {
    if (this.child) {
      throw new Error("CodexAppServerClient is already running");
    }
    if (signal?.aborted) {
      throw new ProcessAbortedError(this.executable);
    }

    try {
      this.child = spawn(this.executable, [...this.args], {
        shell: false,
        cwd: this.cwd,
        env: this.env ? { ...this.env } : undefined,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });
    } catch (cause) {
      throw new ProcessSpawnError(this.executable, cause);
    }

    if (!this.child.stdout || !this.child.stdin || !this.child.stderr) {
      this.killTree();
      throw new ProcessSpawnError(
        this.executable,
        new Error("Failed to open child process stdio pipes"),
      );
    }

    this.exitPromise = new Promise<number | null>((resolve) => {
      this.child?.on("close", (code) => resolve(code));
    });

    if (this.child.pid !== undefined) {
      processRegistry.register(this.child.pid, () => this.killTree());
    }

    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => this.stderrChunks.push(chunk));

    this.child.on("error", (err) => {
      if (this.child?.pid !== undefined) processRegistry.unregister(this.child.pid);
      const spawnErr = new ProcessSpawnError(this.executable, err);
      for (const [id, req] of this.pending.entries()) {
        clearTimeout(req.timer);
        req.cleanupSignal?.();
        req.reject(spawnErr);
        this.pending.delete(id);
      }
    });

    this.child.on("close", (code) => {
      if (this.child?.pid !== undefined) processRegistry.unregister(this.child.pid);
      const wasClosed = this.closed;
      this.closed = true;
      if (!wasClosed && this.pending.size > 0) {
        const err = new Error(
          `Codex app-server exited unexpectedly with code ${code}: ${this.getSanitizedStderr()}`,
        );
        for (const [id, req] of this.pending.entries()) {
          clearTimeout(req.timer);
          req.cleanupSignal?.();
          req.reject(err);
          this.pending.delete(id);
        }
      }
    });

    // Send initialize request
    await this.sendRequest(
      "initialize",
      {
        clientInfo: {
          name: "ai-limits",
          version: "0.0.1",
          title: null,
        },
        capabilities: null,
      },
      signal,
    );
  }

  /**
   * Calls `account/rateLimits/read` via JSON-RPC.
   */
  async readRateLimits(signal?: AbortSignal): Promise<CodexRateLimitsResult> {
    return this.sendRequest<CodexRateLimitsResult>("account/rateLimits/read", {}, signal);
  }

  /**
   * Sends a JSON-RPC 2.0 request and awaits the matched response ID.
   */
  async sendRequest<T>(
    method: string,
    params: unknown,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> {
    if (!this.child?.stdin || this.closed) {
      throw new Error(`Cannot send request '${method}': app-server process is not running`);
    }

    if (signal?.aborted) {
      throw new ProcessAbortedError(this.executable);
    }

    const id = this.nextId++;
    const effectiveTimeoutMs = timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        cleanup();
        this.killTree();
        reject(new ProcessTimeoutError(this.executable, effectiveTimeoutMs));
      }, effectiveTimeoutMs);
      timer.unref();

      const onAbort = () => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        cleanup();
        this.killTree();
        reject(new ProcessAbortedError(this.executable));
      };

      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
        clearTimeout(timer);
      };

      signal?.addEventListener("abort", onAbort, { once: true });

      this.pending.set(id, {
        resolve: (val) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(val as T);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        },
        timer,
        cleanupSignal: () => signal?.removeEventListener("abort", onAbort),
      });

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const stdin = this.child?.stdin;
      if (!stdin) {
        settled = true;
        this.pending.delete(id);
        cleanup();
        reject(new Error("App-server stdin is unavailable"));
        return;
      }

      try {
        const line = `${JSON.stringify(request)}\n`;
        stdin.write(line, (writeErr) => {
          if (writeErr && !settled) {
            settled = true;
            this.pending.delete(id);
            cleanup();
            reject(writeErr);
          }
        });
      } catch (err) {
        if (!settled) {
          settled = true;
          this.pending.delete(id);
          cleanup();
          reject(err);
        }
      }
    });
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString("utf8");

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.processLine(line);
      }
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private processLine(line: string): void {
    let parsed: JsonRpcResponse & JsonRpcNotification;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Ignore unparseable non-JSON stdout lines or banners
      return;
    }

    // Check if this line corresponds to a pending request ID
    if (parsed && parsed.id !== undefined && this.pending.has(parsed.id)) {
      const req = this.pending.get(parsed.id);
      if (!req) return;
      this.pending.delete(parsed.id);

      if (parsed.error) {
        const err = parsed.error as JsonRpcError;
        req.reject(
          new Error(`JSON-RPC Error ${err.code}: ${redactSecrets(err.message ?? "Unknown error")}`),
        );
      } else {
        req.resolve(parsed.result);
      }
    }
    // Notifications (parsed.method without an awaited id) are intentionally
    // discarded here. Future live-push listeners can hook here.
  }

  private killTree(): void {
    if (!this.child || this.child.pid === undefined) return;
    processRegistry.unregister(this.child.pid);
    try {
      process.kill(-this.child.pid, "SIGTERM");
    } catch {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // Process already gone
      }
    }

    setTimeout(() => {
      if (!this.child || this.child.pid === undefined || this.closed) return;
      try {
        process.kill(-this.child.pid, "SIGKILL");
      } catch {
        try {
          this.child.kill("SIGKILL");
        } catch {
          // Already gone
        }
      }
    }, SIGKILL_GRACE_MS).unref();
  }

  private getSanitizedStderr(): string {
    const raw = Buffer.concat(this.stderrChunks).toString("utf8");
    return redactSecrets(raw);
  }

  /**
   * Gracefully shuts down the app-server session.
   */
  async close(): Promise<void> {
    if (this.closed || !this.child) return;
    this.closed = true;

    try {
      if (this.child.stdin && !this.child.stdin.destroyed) {
        this.child.stdin.end();
      }
    } catch {
      // Ignore write errors on close
    }

    if (!this.exitPromise) return;

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.killTree();
    }, CLOSE_GRACE_MS);
    timer.unref();

    try {
      await this.exitPromise;
    } finally {
      if (!timedOut) {
        clearTimeout(timer);
      }
      this.child = null;
    }
  }
}
