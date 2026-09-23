import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodexAppServerClient } from "../src/providers/codex/app-server-client.js";

const MOCK_SERVER_SCRIPT = join(__dirname, "fixtures", "codex", "mock-app-server.cjs");

describe("CodexAppServerClient", () => {
  it("completes initialize handshake and reads rate limits from mock app-server", async () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      args: [MOCK_SERVER_SCRIPT, "normal"],
      timeoutMs: 3000,
    });

    await client.start();
    const result = await client.readRateLimits();

    expect(result.ordinaryUsageAllowed).toBe(true);
    expect(result.rateLimits.primary?.usedPercent).toBe(40);
    expect(result.rateLimits.secondary?.usedPercent).toBe(12);
    expect(result.rateLimits.planType).toBe("team");
    expect(result.rateLimitResetCredits?.availableCount).toBe(1);

    await client.close();
  });

  it("handles server JSON-RPC error responses cleanly", async () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      args: [MOCK_SERVER_SCRIPT, "normal"],
      timeoutMs: 3000,
    });

    await client.start();

    await expect(client.sendRequest("simulate_error", {})).rejects.toThrow(/JSON-RPC Error -32600/);

    await client.close();
  });

  it("times out and kills child process when server hangs", async () => {
    const client = new CodexAppServerClient({
      executable: process.execPath,
      args: [MOCK_SERVER_SCRIPT, "hang"],
      timeoutMs: 300,
    });

    await expect(client.start()).rejects.toThrow(/exceeded timeout of 300ms/);
    await client.close();
  });

  it("supports external AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const client = new CodexAppServerClient({
      executable: process.execPath,
      args: [MOCK_SERVER_SCRIPT, "hang"],
      timeoutMs: 5000,
    });

    setTimeout(() => controller.abort(), 100);

    await expect(client.start(controller.signal)).rejects.toThrow(/aborted|ProcessAbortedError/);
    await client.close();
  });

  it("can interact with real installed codex app-server when present", async () => {
    // Only run if codex binary exists in PATH
    try {
      const client = new CodexAppServerClient({
        executable: "codex",
        timeoutMs: 5000,
      });

      await client.start();
      const result = await client.readRateLimits();

      expect(result).toBeDefined();
      expect(result.rateLimits).toBeDefined();
      expect(typeof result.rateLimits.planType).toBe("string");

      await client.close();
    } catch (err) {
      // If not installed on the running environment, skip
      if (err instanceof Error && err.message.includes("ENOENT")) {
        return;
      }
      throw err;
    }
  });
});
