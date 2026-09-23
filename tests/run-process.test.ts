import { describe, expect, it } from "vitest";
import { ProcessTimeoutError, runProcess } from "../src/infra/process/index.js";

const node = process.execPath;

describe("runProcess", () => {
  it("captures stdout and stderr separately with exit code", async () => {
    const result = await runProcess({
      executable: node,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err');"],
      timeoutMs: 5_000,
    });
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(0);
  });

  it("does not use a shell (metacharacters are literal arguments)", async () => {
    const result = await runProcess({
      executable: node,
      args: ["-e", "process.stdout.write(process.argv[1])", "a; rm -rf / && echo pwned"],
      timeoutMs: 5_000,
    });
    expect(result.stdout).toBe("a; rm -rf / && echo pwned");
  });

  it("kills a hung process on timeout", async () => {
    const started = Date.now();
    await expect(
      runProcess({
        executable: node,
        args: ["-e", "setTimeout(() => {}, 60000)"],
        timeoutMs: 300,
      }),
    ).rejects.toBeInstanceOf(ProcessTimeoutError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("applies the redaction hook to captured output", async () => {
    const result = await runProcess({
      executable: node,
      args: ["-e", "process.stdout.write('token=abc123')"],
      timeoutMs: 5_000,
      redact: (text) => text.replace(/abc123/g, "[REDACTED]"),
    });
    expect(result.stdout).toBe("token=[REDACTED]");
  });

  it("aborts a running process via AbortSignal", async () => {
    const controller = new AbortController();
    const promise = runProcess({
      executable: node,
      args: ["-e", "setTimeout(() => {}, 60000)"],
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);
    await expect(promise).rejects.toMatchObject({ name: "ProcessAbortedError" });
  });
});
