import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ProcessAbortedError, ProcessSpawnError, ProcessTimeoutError } from "./errors.js";
import { processRegistry } from "./process-registry.js";

/**
 * PTY abstraction for providers that only expose usage through an interactive
 * TUI slash command (e.g. Kimi `/usage`, Antigravity `/usage`).
 */
export interface PtySpawnOptions {
  executable: string;
  args?: readonly string[] | undefined;
  cwd?: string | undefined;
  /** Environment overrides. Never log this value. */
  env?: Readonly<Record<string, string>> | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  /** Hard timeout for the whole session in milliseconds. */
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

export interface PtySession {
  /** Write input to the terminal (e.g. a slash command followed by \r). */
  write(data: string): void;
  /** Subscribe to raw terminal output; returns an unsubscribe function. */
  onData(listener: (data: string) => void): () => void;
  /** Resolves when the process exits. */
  readonly exited: Promise<number | null>;
  /** Terminate the session and its process tree. */
  kill(): void;
}

export type PtyFactory = (options: PtySpawnOptions) => PtySession;

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 35;
const SIGKILL_GRACE_MS = 250;

/**
 * Default implementation of PtySession using the internal Python 3 PTY bridge
 * on POSIX platforms (Linux/macOS), and native pipe fallback on Windows.
 * Requires no native C++ npm dependencies.
 */
export function spawnPtySession(options: PtySpawnOptions): PtySession {
  const isWindows = process.platform === "win32";
  let child: ChildProcess;

  if (isWindows) {
    try {
      child = spawn(options.executable, [...(options.args ?? [])], {
        shell: false,
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : undefined,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      throw new ProcessSpawnError(options.executable, err);
    }
  } else {
    const bridgeCandidates = [
      fileURLToPath(new URL("./pty-bridge.py", import.meta.url)),
      fileURLToPath(new URL("../../src/infra/process/pty-bridge.py", import.meta.url)),
      fileURLToPath(new URL("../../../src/infra/process/pty-bridge.py", import.meta.url)),
    ];
    const bridgeScript = bridgeCandidates.find((p) => existsSync(p)) ?? bridgeCandidates[0] ?? "";
    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;

    const bridgeArgs = [
      bridgeScript,
      "--cols",
      String(cols),
      "--rows",
      String(rows),
      ...(options.cwd ? ["--cwd", options.cwd] : []),
      "--",
      options.executable,
      ...(options.args ?? []),
    ];

    try {
      child = spawn("python3", bridgeArgs, {
        shell: false,
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : undefined,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });
    } catch (err) {
      throw new ProcessSpawnError(options.executable, err);
    }
  }

  const listeners = new Set<(data: string) => void>();
  let settled = false;

  const killTree = () => {
    if (settled || child.pid === undefined) return;
    try {
      if (isWindows) {
        child.kill("SIGTERM");
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        // Already exited
      }
    }
    setTimeout(() => {
      try {
        if (child.pid !== undefined) {
          if (isWindows) {
            child.kill("SIGKILL");
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        }
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already exited
        }
      }
    }, SIGKILL_GRACE_MS).unref();
  };

  if (child.pid !== undefined) {
    processRegistry.register(child.pid, killTree);
  }

  const timeoutTimer = setTimeout(() => {
    killTree();
  }, options.timeoutMs);
  timeoutTimer.unref();

  const onAbort = () => {
    killTree();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  if (child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const listener of listeners) {
        try {
          listener(text);
        } catch {
          // Ignore listener errors
        }
      }
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const listener of listeners) {
        try {
          listener(text);
        } catch {
          // Ignore listener errors
        }
      }
    });
  }

  const exitedPromise = new Promise<number | null>((resolve) => {
    child.on("close", (code) => {
      if (child.pid !== undefined) processRegistry.unregister(child.pid);
      settled = true;
      clearTimeout(timeoutTimer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(code);
    });
    child.on("error", () => {
      if (child.pid !== undefined) processRegistry.unregister(child.pid);
      settled = true;
      clearTimeout(timeoutTimer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(null);
    });
  });

  return {
    write(data: string) {
      if (!child.stdin || child.stdin.destroyed) return;
      try {
        child.stdin.write(data);
      } catch {
        // Stdin might be closed
      }
    },
    onData(listener: (data: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    exited: exitedPromise,
    kill() {
      killTree();
    },
  };
}

export interface RunPtyInteractiveOptions {
  executable: string;
  args?: readonly string[] | undefined;
  cwd?: string | undefined;
  env?: Readonly<Record<string, string>> | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  ptyFactory?: PtyFactory | undefined;
  interact: (session: PtySession, getFullOutput: () => string) => Promise<void>;
}

/**
 * Runs an interactive PTY session driven by a custom interaction controller.
 * Collects full raw output, ensures timeouts and cancellation terminate the process,
 * and guarantees cleanup on completion or error.
 */
export async function runPtyInteractive(options: RunPtyInteractiveOptions): Promise<string> {
  const { timeoutMs, signal, interact } = options;

  if (signal?.aborted) {
    throw new ProcessAbortedError(options.executable);
  }

  const factory = options.ptyFactory ?? spawnPtySession;
  const session = factory({
    executable: options.executable,
    ...(options.args ? { args: options.args } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.cols !== undefined ? { cols: options.cols } : {}),
    ...(options.rows !== undefined ? { rows: options.rows } : {}),
    timeoutMs,
    ...(signal ? { signal } : {}),
  });

  let fullOutput = "";
  const unsub = session.onData((data) => {
    fullOutput += data;
  });

  let timedOut = false;
  let aborted = false;

  const timer = setTimeout(() => {
    timedOut = true;
    session.kill();
  }, timeoutMs);
  timer.unref();

  const onAbort = () => {
    aborted = true;
    session.kill();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const interactPromise = interact(session, () => fullOutput);
    const timeoutPromise = new Promise<never>((_, reject) => {
      const check = setInterval(() => {
        if (timedOut) {
          clearInterval(check);
          reject(new ProcessTimeoutError(options.executable, timeoutMs));
        } else if (aborted) {
          clearInterval(check);
          reject(new ProcessAbortedError(options.executable));
        }
      }, 50);
      check.unref();
    });

    await Promise.race([interactPromise, timeoutPromise]);
    return fullOutput;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    unsub();
    session.kill();
  }
}
