import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getProviderSnapshot } from "../src/core/application/index.js";
import { OpenCodeAdapter } from "../src/providers/opencode/opencode-adapter.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/opencode");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("OpenCodeAdapter", () => {
  const fixedNow = new Date("2026-09-15T10:00:00.000Z");

  it("exposes expected metadata and default capabilities", async () => {
    const adapter = new OpenCodeAdapter({ authPath: "/nonexistent/auth.json" });
    expect(adapter.id).toBe("opencode");
    expect(adapter.displayName).toBe("OpenCode Go");

    const caps = await adapter.getCapabilities();
    expect(caps.usage).toBe("unsupported");
    expect(caps.source).toBe("none");
    expect(caps.reason).toContain(
      "OpenCode CLI does not expose a deterministic local usage endpoint",
    );
  });

  it("detects real or mocked opencode executable presence", async () => {
    const adapter = new OpenCodeAdapter();
    const installed = await adapter.detect();
    expect(typeof installed).toBe("boolean");
  });

  it("extracts version string cleanly from output", async () => {
    const executedArgs: string[][] = [];
    const adapter = new OpenCodeAdapter({
      commandRunner: async (args) => {
        executedArgs.push(args);
        return {
          stdout: "1.18.27\n",
          stderr: "",
          exitCode: 0,
        };
      },
    });

    const version = await adapter.getVersion();
    expect(version).toBe("1.18.27");
    expect(executedArgs).toEqual([["--version"]]);
  });

  it("extracts authenticated auth state when OpenCode Go credentials are listed", async () => {
    const fixture = readFixture("auth-list-authenticated.txt");
    const adapter = new OpenCodeAdapter({
      commandRunner: async (args) => {
        if (args.includes("auth")) {
          return { stdout: fixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const auth = await adapter.getAuthState();
    expect(auth).toBe("authenticated");
  });

  it("extracts not_authenticated auth state when 0 credentials exist", async () => {
    const fixture = readFixture("auth-list-empty.txt");
    const adapter = new OpenCodeAdapter({
      authPath: "/nonexistent/auth.json",
      commandRunner: async (args) => {
        if (args.includes("auth")) {
          return { stdout: fixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const auth = await adapter.getAuthState();
    expect(auth).toBe("not_authenticated");
  });

  it("returns OpenCode Go plan label", async () => {
    const adapter = new OpenCodeAdapter();
    const plan = await adapter.getPlanLabel();
    expect(plan).toBe("OpenCode Go");
  });

  it("generates honest unsupported snapshot through getProviderSnapshot", async () => {
    const authFixture = readFixture("auth-list-authenticated.txt");

    const adapter = new OpenCodeAdapter({
      authPath: "/nonexistent/auth.json",
      now: () => fixedNow,
      commandRunner: async (args) => {
        if (args.includes("--version")) {
          return { stdout: "1.18.27\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("auth")) {
          return { stdout: authFixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs: 5000,
      now: fixedNow,
    });

    expect(snapshot.id).toBe("opencode");
    expect(snapshot.display_name).toBe("OpenCode Go");
    expect(snapshot.installed).toBe(true);
    expect(snapshot.auth_state).toBe("authenticated");
    expect(snapshot.usage_capability).toBe("unsupported");
    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.limits).toEqual([]);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]?.code).toBe("usage_unsupported");
    expect(snapshot.errors[0]?.message).toContain(
      "OpenCode CLI does not expose a deterministic local usage endpoint",
    );
  });

  it("supports future structured Go usage payload with 5h, weekly, and monthly limits", async () => {
    const usageFixture = readFixture("future-usage-supported.json");
    const adapter = new OpenCodeAdapter({
      forceSupportedUsage: true,
      futureUsageRunner: async () => usageFixture,
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(3);

    const fiveHour = limits.find((l) => l.id === "5h");
    expect(fiveHour).toBeDefined();
    expect(fiveHour?.name).toBe("5-hour rolling limit");
    expect(fiveHour?.category).toBe("rolling_window");
    expect(fiveHour?.window_minutes).toBe(300);
    expect(fiveHour?.used_percent).toBe(25);
    expect(fiveHour?.remaining_percent).toBe(75);
    expect(fiveHour?.reset_countdown_seconds).toBeGreaterThan(0);

    const weekly = limits.find((l) => l.id === "weekly");
    expect(weekly).toBeDefined();
    expect(weekly?.category).toBe("weekly");
    expect(weekly?.window_minutes).toBe(10080);
    expect(weekly?.used_percent).toBe(40);
    expect(weekly?.remaining_percent).toBe(60);

    const monthly = limits.find((l) => l.id === "monthly");
    expect(monthly).toBeDefined();
    expect(monthly?.category).toBe("monthly");
    expect(monthly?.window_minutes).toBe(43200);
    expect(monthly?.used_percent).toBe(15);
    expect(monthly?.remaining_percent).toBe(85);
  });

  it("enforces zero-AI-credit invariant: never executes 'run' or model queries", async () => {
    const executedCommands: string[][] = [];
    const adapter = new OpenCodeAdapter({
      authPath: "/nonexistent/auth.json",
      commandRunner: async (args) => {
        executedCommands.push(args);
        if (args.includes("--version")) {
          return { stdout: "1.18.27\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("auth")) {
          return { stdout: "●  OpenCode Go api\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("--help")) {
          return { stdout: "Commands: opencode auth", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    await adapter.detect();
    await adapter.getVersion();
    await adapter.getAuthState();
    await adapter.getCapabilities();
    await adapter.fetchUsage();

    for (const args of executedCommands) {
      expect(args).not.toContain("run");
      for (const arg of args) {
        expect(arg.toLowerCase()).not.toContain("tell me my limits");
        expect(arg.toLowerCase()).not.toContain("quota");
      }
    }
  });

  it("fetches active quotas via mock REST API", async () => {
    const mockUsage = {
      usage: {
        rolling: { percent: 2, resetsAt: "2026-09-16T12:00:00.000Z" },
        weekly: { percent: 4, resetsAt: "2026-09-21T00:00:00.000Z" },
        monthly: { percent: 98, resetsAt: "2026-09-17T20:00:00.000Z" },
      },
    };

    const adapter = new OpenCodeAdapter({
      fetchImpl: async () => new Response(JSON.stringify(mockUsage), { status: 200 }),
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(3);
    expect(limits.find((l) => l.id === "rolling")?.used_percent).toBe(2);
    expect(limits.find((l) => l.id === "weekly")?.used_percent).toBe(4);
    expect(limits.find((l) => l.id === "monthly")?.used_percent).toBe(98);
  });
});
