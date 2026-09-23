import { describe, expect, it } from "vitest";
import { runProcess } from "../src/infra/process/index.js";
import { processRegistry } from "../src/infra/process/process-registry.js";

const node = process.execPath;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("process registry shutdown cleanup", () => {
  it("kills a hung child process tree when killAll is invoked", async () => {
    const pending = runProcess({
      executable: node,
      args: ["-e", "setTimeout(() => {}, 60000)"],
      timeoutMs: 30_000,
    });

    let pid: number | undefined;
    for (let i = 0; i < 50 && pid === undefined; i++) {
      pid = processRegistry.pids[0];
      if (pid === undefined) {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    expect(pid).toBeDefined();
    expect(pidAlive(pid as number)).toBe(true);

    await processRegistry.killAll();
    await pending.catch(() => undefined);
    expect(pidAlive(pid as number)).toBe(false);
    expect(processRegistry.size).toBe(0);
  });
});
