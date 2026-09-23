import { type ChildProcess, spawn } from "node:child_process";
import { ProcessAbortedError, ProcessSpawnError, ProcessTimeoutError } from "./errors.js";
import { processRegistry } from "./process-registry.js";

export interface RunProcessOptions {
  /** Executable name or path. Never a shell command string. */
  executable: string;
  /** Arguments passed as an array; never interpolated into a shell string. */
  args?: readonly string[];
  /** Hard timeout in milliseconds. The process group is killed on expiry. */
  timeoutMs: number;
  /** External cancellation. */
  signal?: AbortSignal;
  cwd?: string;
  /** Environment overrides. Never log this value. */
  env?: Readonly<Record<string, string>>;
  /** Optional redaction applied to captured stdout/stderr before returning. */
  redact?: (text: string) => string;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const SIGKILL_GRACE_MS = 250;

/**
 * Runs a subprocess safely: executable + argument array only, no shell,
 * stdout/stderr captured separately, hard timeout with process-group kill,
 * and AbortSignal cancellation.
 */
export function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const { executable, args = [], timeoutMs, signal, cwd, env, redact } = options;

  return new Promise<RunProcessResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProcessAbortedError(executable));
      return;
    }

    const isWindows = process.platform === "win32";
    let child: ChildProcess;
    try {
      child = spawn(executable, [...args], {
        shell: false,
        cwd,
        env: env ? { ...env } : undefined,
        stdio: ["ignore", "pipe", "pipe"],
        // New process group so timeouts can kill the whole tree on POSIX.
        detached: !isWindows,
        windowsHide: isWindows,
      });
    } catch (cause) {
      reject(new ProcessSpawnError(executable, cause));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    let aborted = false;

    const killTree = () => {
      if (child.pid === undefined) return;
      try {
        if (isWindows) {
          child.kill("SIGTERM");
        } else {
          // Negative pid targets the whole process group.
          process.kill(-child.pid, "SIGTERM");
        }
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // Already gone.
        }
      }
      setTimeout(() => {
        if (settled) return;
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
            // Already gone.
          }
        }
      }, SIGKILL_GRACE_MS).unref();
    };

    if (child.pid !== undefined) {
      processRegistry.register(child.pid, killTree);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);
    timer.unref();

    const onAbort = () => {
      aborted = true;
      killTree();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    // stdio is configured as ["ignore", "pipe", "pipe"] above.
    if (!child.stdout || !child.stderr) {
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ProcessSpawnError(executable, new Error("stdout/stderr pipes unavailable")));
      return;
    }
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (cause) => {
      if (child.pid !== undefined) processRegistry.unregister(child.pid);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ProcessSpawnError(executable, cause));
    });

    child.on("close", (exitCode) => {
      if (child.pid !== undefined) processRegistry.unregister(child.pid);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);

      if (timedOut) {
        reject(new ProcessTimeoutError(executable, timeoutMs));
        return;
      }
      if (aborted) {
        reject(new ProcessAbortedError(executable));
        return;
      }

      let stdout = Buffer.concat(stdoutChunks).toString("utf8");
      let stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (redact) {
        stdout = redact(stdout);
        stderr = redact(stderr);
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}
