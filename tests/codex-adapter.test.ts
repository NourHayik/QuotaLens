import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProviderSnapshot } from "../src/core/application/provider-snapshot-service.js";
import { CodexAdapter } from "../src/providers/codex/codex-adapter.js";
import type {
  CodexAppServerClientLike,
  CodexRateLimitsResult,
} from "../src/providers/codex/types.js";

const FIXTURES_DIR = join(__dirname, "fixtures", "codex");

function loadFixture(filename: string): CodexRateLimitsResult {
  const content = readFileSync(join(FIXTURES_DIR, filename), "utf8");
  return JSON.parse(content) as CodexRateLimitsResult;
}

class FakeCodexClient implements CodexAppServerClientLike {
  constructor(
    private readonly fixture: CodexRateLimitsResult,
    private readonly shouldFail = false,
  ) {}

  async start(): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Simulated app-server failure");
    }
  }

  async readRateLimits(): Promise<CodexRateLimitsResult> {
    if (this.shouldFail) {
      throw new Error("Simulated app-server failure");
    }
    return this.fixture;
  }

  async close(): Promise<void> {}
}

describe("CodexAdapter", () => {
  const testNow = new Date("2026-09-15T09:00:00.000Z");

  it("detects installed status and version on real or mock binary", async () => {
    // Test with non-existent binary first
    const missingAdapter = new CodexAdapter({ executable: "non_existent_binary_xyz_123" });
    expect(await missingAdapter.detect()).toBe(false);
    expect(await missingAdapter.getVersion()).toBeNull();

    // Test with node binary as mock
    const nodeAdapter = new CodexAdapter({ executable: process.execPath });
    expect(await nodeAdapter.detect()).toBe(true);
    const ver = await nodeAdapter.getVersion();
    expect(ver).toMatch(/[0-9]+\.[0-9]+/);
  });

  it("fetches normalized usage limits via clientFactory and captures plan label", async () => {
    const fixture = loadFixture("full-usage.json");
    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture),
      now: () => testNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits.length).toBe(4); // primary, weekly, spark, reset_credits

    const planLabel = await adapter.getPlanLabel();
    expect(planLabel).toBe("Team");
  });

  it("preserves single-window accounts: only 5h window returned, no weekly fabricated", async () => {
    const fixture = loadFixture("single-window-5h.json");
    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture),
      now: () => testNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits.length).toBe(1);
    expect(limits[0]?.id).toBe("primary");
    expect(limits[0]?.category).toBe("rolling_window");
    expect(limits[0]?.window_minutes).toBe(300);

    // Weekly window is absent and must not be fabricated
    expect(limits.find((l) => l.id === "weekly")).toBeUndefined();
  });

  it("falls back to status text parser when app-server client fails", async () => {
    const fallbackText = readFileSync(join(FIXTURES_DIR, "status-fallback.txt"), "utf8");
    const fixture = loadFixture("full-usage.json");

    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture, true /* shouldFail */),
      statusFallbackRunner: async () => fallbackText,
      now: () => testNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits.length).toBe(3); // 5h, weekly, reset_credits from status-fallback.txt
    expect(await adapter.getPlanLabel()).toBe("Pro");
  });

  it("rethrows error when both app-server and fallback fail", async () => {
    const fixture = loadFixture("full-usage.json");
    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture, true /* shouldFail */),
      statusFallbackRunner: async () => {
        throw new Error("Fallback failed too");
      },
    });

    await expect(adapter.fetchUsage()).rejects.toThrow("Simulated app-server failure");
  });

  it("integrates seamlessly into getProviderSnapshot producing ok status and plan label", async () => {
    const fixture = loadFixture("full-usage.json");
    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture),
      now: () => testNow,
    });

    // Mock detect/version/auth for determinism
    adapter.detect = async () => true;
    adapter.getVersion = async () => "0.154.0";
    adapter.getAuthState = async () => "authenticated";

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs: 5000,
      now: testNow,
    });

    expect(snapshot.id).toBe("codex");
    expect(snapshot.display_name).toBe("Codex");
    expect(snapshot.status).toBe("ok");
    expect(snapshot.installed).toBe(true);
    expect(snapshot.auth_state).toBe("authenticated");
    expect(snapshot.source).toBe("app-server");
    expect(snapshot.cli_version).toBe("0.154.0");
    expect(snapshot.plan_label).toBe("Team");
    expect(snapshot.limits.length).toBe(4);
    expect(snapshot.errors).toEqual([]);
  });

  it("maps not_authenticated authState to not_authenticated snapshot status", async () => {
    const fixture = loadFixture("full-usage.json");
    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture),
    });

    adapter.detect = async () => true;
    adapter.getVersion = async () => "0.154.0";
    adapter.getAuthState = async () => "not_authenticated";

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs: 5000,
      now: testNow,
    });

    expect(snapshot.status).toBe("not_authenticated");
    expect(snapshot.limits).toEqual([]);
    expect(snapshot.errors.length).toBe(1);
    expect(snapshot.errors[0]?.code).toBe("auth_required");
  });

  it("maps not installed binary to not_installed snapshot status", async () => {
    const adapter = new CodexAdapter({ executable: "no_such_codex_bin_xyz" });

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs: 5000,
      now: testNow,
    });

    expect(snapshot.status).toBe("not_installed");
    expect(snapshot.installed).toBe(false);
    expect(snapshot.limits).toEqual([]);
  });

  it("ensures zero credential leakage into snapshot or errors", async () => {
    const fixture = loadFixture("full-usage.json");
    const adapter = new CodexAdapter({
      clientFactory: () => new FakeCodexClient(fixture),
    });

    adapter.detect = async () => true;
    adapter.getVersion = async () => "0.154.0";
    adapter.getAuthState = async () => "authenticated";

    const snapshot = await getProviderSnapshot(adapter, {
      timeoutMs: 5000,
      now: testNow,
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/bearer\s+/i);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(serialized).not.toMatch(/api[_-]?key/i);
  });
});
