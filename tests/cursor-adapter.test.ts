import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getProviderSnapshot } from "../src/core/application/index.js";
import { CursorAdapter } from "../src/providers/cursor/cursor-adapter.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/cursor");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("CursorAdapter", () => {
  const fixedNow = new Date("2026-09-15T10:00:00.000Z");

  it("exposes expected metadata and default capabilities", async () => {
    const adapter = new CursorAdapter({ stateDbPath: "/nonexistent/state.vscdb" });
    expect(adapter.id).toBe("cursor");
    expect(adapter.displayName).toBe("Cursor");

    const caps = await adapter.getCapabilities();
    expect(caps.usage).toBe("unsupported");
    expect(caps.source).toBe("none");
    expect(caps.reason).toContain(
      "Cursor CLI does not expose a deterministic local usage endpoint",
    );
  });

  it("detects real or mocked cursor-agent executable presence", async () => {
    const adapter = new CursorAdapter();
    const installed = await adapter.detect();
    expect(typeof installed).toBe("boolean");
  });

  it("extracts version string cleanly without tip banner", async () => {
    const executedArgs: string[][] = [];
    const adapter = new CursorAdapter({
      commandRunner: async (args) => {
        executedArgs.push(args);
        return {
          stdout:
            "Tip: You can start the Cursor CLI with `agent` (same as `cursor-agent`).\n2026.09.10-fd3934a\n",
          stderr: "",
          exitCode: 0,
        };
      },
    });

    const version = await adapter.getVersion();
    expect(version).toBe("2026.09.10-fd3934a");
    expect(executedArgs).toEqual([["--version"]]);
  });

  it("extracts authenticated auth state from json output without leaking user info", async () => {
    const fixture = readFixture("status-authenticated.json");
    const adapter = new CursorAdapter({
      commandRunner: async (args) => {
        if (args.includes("status")) {
          return { stdout: fixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const auth = await adapter.getAuthState();
    expect(auth).toBe("authenticated");
  });

  it("extracts unauthenticated auth state from json output", async () => {
    const fixture = readFixture("status-unauthenticated.json");
    const adapter = new CursorAdapter({
      stateDbPath: "/nonexistent/state.vscdb",
      commandRunner: async (args) => {
        if (args.includes("status")) {
          return { stdout: fixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const auth = await adapter.getAuthState();
    expect(auth).toBe("not_authenticated");
  });

  it("extracts plan tier label from about json output", async () => {
    const fixture = readFixture("about-ultra.json");
    const adapter = new CursorAdapter({
      commandRunner: async (args) => {
        if (args.includes("about")) {
          return { stdout: fixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const plan = await adapter.getPlanLabel();
    expect(plan).toBe("Ultra");
  });

  it("generates honest unsupported snapshot through getProviderSnapshot", async () => {
    const statusFixture = readFixture("status-authenticated.json");
    const aboutFixture = readFixture("about-ultra.json");

    const adapter = new CursorAdapter({
      stateDbPath: "/nonexistent/state.vscdb",
      now: () => fixedNow,
      commandRunner: async (args) => {
        if (args.includes("--version")) {
          return { stdout: "2026.09.10-fd3934a\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("status")) {
          return { stdout: statusFixture, stderr: "", exitCode: 0 };
        }
        if (args.includes("about")) {
          return { stdout: aboutFixture, stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs: 5000,
      now: fixedNow,
    });

    expect(snapshot.id).toBe("cursor");
    expect(snapshot.display_name).toBe("Cursor");
    expect(snapshot.installed).toBe(true);
    expect(snapshot.auth_state).toBe("authenticated");
    expect(snapshot.usage_capability).toBe("unsupported");
    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.limits).toEqual([]);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]?.code).toBe("usage_unsupported");
    expect(snapshot.errors[0]?.message).toContain(
      "Cursor CLI does not expose a deterministic local usage endpoint",
    );
  });

  it("supports future structured usage payload without contract changes", async () => {
    const usageFixture = readFixture("future-usage-supported.json");
    const adapter = new CursorAdapter({
      forceSupportedUsage: true,
      futureUsageRunner: async () => usageFixture,
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(2);

    const fastRequests = limits.find((l) => l.id === "fast_requests");
    expect(fastRequests).toBeDefined();
    expect(fastRequests?.name).toBe("Fast Requests");
    expect(fastRequests?.category).toBe("monthly");
    expect(fastRequests?.used_amount).toBe(180);
    expect(fastRequests?.limit_amount).toBe(500);
    expect(fastRequests?.used_percent).toBe(36);
    expect(fastRequests?.remaining_percent).toBe(64);
    expect(fastRequests?.amount_unit).toBe("requests");
    expect(fastRequests?.reset_countdown_seconds).toBeGreaterThan(0);

    const credit = limits.find((l) => l.id === "usage_based_credit");
    expect(credit).toBeDefined();
    expect(credit?.amount_unit).toBe("USD");
    expect(credit?.used_amount).toBe(12.5);
    expect(credit?.limit_amount).toBe(50.0);
  });

  it("enforces zero-AI-credit invariant: never executes -p or model prompts", async () => {
    const executedCommands: string[][] = [];
    const adapter = new CursorAdapter({
      stateDbPath: "/nonexistent/state.vscdb",
      commandRunner: async (args) => {
        executedCommands.push(args);
        if (args.includes("--version")) {
          return { stdout: "2026.09.10\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("status")) {
          return { stdout: '{"isAuthenticated": true}', stderr: "", exitCode: 0 };
        }
        if (args.includes("--help")) {
          return { stdout: "Usage: agent [options] [command]", stderr: "", exitCode: 0 };
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
      expect(args).not.toContain("-p");
      expect(args).not.toContain("--print");
      // Check that no free-form prompt argument was passed
      for (const arg of args) {
        expect(arg.toLowerCase()).not.toContain("what is my quota");
        expect(arg.toLowerCase()).not.toContain("usage");
      }
    }
  });

  it("fetches active plan allowance via mock ConnectRPC and web usage", async () => {
    const mockPlanInfo = {
      planInfo: {
        planName: "Ultra",
        includedAmountCents: 40000,
        billingCycleEnd: 1728376720,
      },
    };

    const adapter = new CursorAdapter({
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes("GetPlanInfo")) {
          return new Response(JSON.stringify(mockPlanInfo), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      },
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(1);
    expect(limits[0]?.id).toBe("plan_allowance");
    expect(limits[0]?.name).toBe("Ultra Plan Allowance");
    expect(limits[0]?.limit_amount).toBe(400);
    expect(limits[0]?.amount_unit).toBe("USD");
  });

  it("fetches full period usage and sand agent usage via ConnectRPC endpoints", async () => {
    const mockPlanInfo = {
      planInfo: {
        planName: "Ultra",
        includedAmountCents: 40000,
        billingCycleEnd: "1791448720000",
      },
    };

    const mockPeriodUsage = {
      billingCycleStart: "1788856720000",
      billingCycleEnd: "1791448720000",
      planUsage: {
        totalSpend: 48902,
        includedSpend: 40000,
        bonusSpend: 8902,
        limit: 40000,
        remainingBonus: false,
        autoPercentUsed: 14.7996,
        apiPercentUsed: 12.008,
        totalPercentUsed: 14.4894,
      },
    };

    const mockSandUsage = {
      currentPeriodStart: "2026-09-16T09:31:26.113Z",
      nextResetTimestampUtc: "2026-09-23T09:31:26.113Z",
      usagePercent: 3.965,
      grokPlanLabel: "Grok Bot Plan",
      cursorPlanName: "Ultra",
    };

    const adapter = new CursorAdapter({
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.includes("GetPlanInfo")) {
          return new Response(JSON.stringify(mockPlanInfo), { status: 200 });
        }
        if (u.includes("GetCurrentPeriodUsage")) {
          return new Response(JSON.stringify(mockPeriodUsage), { status: 200 });
        }
        if (u.includes("GetSandUsageStatus")) {
          return new Response(JSON.stringify(mockSandUsage), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      },
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(4);

    const planAllowance = limits.find((l) => l.id === "plan_allowance");
    expect(planAllowance).toBeDefined();
    expect(planAllowance?.name).toBe("Ultra Plan Allowance");
    expect(planAllowance?.limit_amount).toBe(400);
    expect(planAllowance?.amount_unit).toBe("USD");
    expect(planAllowance?.used_percent).toBe(14.5);
    expect(planAllowance?.remaining_percent).toBe(85.5);
    expect(planAllowance?.used_amount).toBe(57.96);
    expect(planAllowance?.remaining_amount).toBe(342.04);
    expect(planAllowance?.resets_at).toBe("2026-10-08T08:38:40.000Z");

    const autoModels = limits.find((l) => l.id === "auto_models");
    expect(autoModels).toBeDefined();
    expect(autoModels?.name).toBe("Auto Models Usage");
    expect(autoModels?.used_percent).toBe(14.8);
    expect(autoModels?.remaining_percent).toBe(85.2);
    expect(autoModels?.amount_unit).toBe("percent");

    const apiModels = limits.find((l) => l.id === "api_models");
    expect(apiModels).toBeDefined();
    expect(apiModels?.name).toBe("API / Named Models Usage");
    expect(apiModels?.used_percent).toBe(12.0);
    expect(apiModels?.remaining_percent).toBe(88.0);
    expect(apiModels?.amount_unit).toBe("percent");

    const agentUsage = limits.find((l) => l.id === "agent_usage");
    expect(agentUsage).toBeDefined();
    expect(agentUsage?.name).toBe("Grok Bot Plan");
    expect(agentUsage?.category).toBe("weekly");
    expect(agentUsage?.used_percent).toBe(4.0);
    expect(agentUsage?.remaining_percent).toBe(96.0);
    expect(agentUsage?.amount_unit).toBe("percent");
    expect(agentUsage?.resets_at).toBe("2026-09-23T09:31:26.113Z");
  });
});
