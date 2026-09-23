import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { ProviderRegistry } from "../../src/core/application/index.js";
import { parseAggregateSnapshot } from "../../src/core/domain/index.js";
import { createDemoProvider } from "../../src/providers/demo/index.js";
import { type RunningServer, startServer } from "../../src/server/index.js";
import { createMutableDemoProvider } from "./helpers.js";

describe("E2E: dashboard HTTP cached load, refresh, failure, recovery", () => {
  let kimiMode: "healthy" | "parse_error" = "healthy";
  let ctx: ReturnType<typeof createCliContext>;
  let running: RunningServer;

  beforeAll(async () => {
    const registry = new ProviderRegistry();
    registry.register(
      createMutableDemoProvider(
        { id: "kimi", displayName: "Kimi Code", cliVersion: "1.2.0" },
        () => kimiMode,
      ),
    );
    registry.register(createDemoProvider({ id: "codex", displayName: "Codex", mode: "healthy" }));
    registry.register(
      createDemoProvider({
        id: "antigravity",
        displayName: "Google Antigravity",
        mode: "healthy",
      }),
    );
    registry.register(
      createDemoProvider({ id: "cursor", displayName: "Cursor", mode: "unsupported" }),
    );
    registry.register(
      createDemoProvider({ id: "opencode", displayName: "OpenCode Go", mode: "unsupported" }),
    );

    ctx = createCliContext({ dbPath: ":memory:", registry });
    ctx.settingsRepo.updateSettings({ stagger_interval_ms: 0 });
    running = await startServer(ctx, { host: "127.0.0.1", port: 0 });
  });

  afterAll(async () => {
    await running.close();
    ctx.dispose();
  });

  it("binds only to loopback", () => {
    expect(running.url.startsWith("http://127.0.0.1:")).toBe(true);
    expect(running.host).toBe("127.0.0.1");
  });

  it("loads cached snapshot then refreshes, fails with last-good, and recovers", async () => {
    const seed = await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    expect(seed.status).toBe(200);

    const cachedRes = await fetch(`${running.url}/api/snapshot?fresh=false`);
    expect(cachedRes.status).toBe(200);
    const cached = parseAggregateSnapshot(await cachedRes.json());
    expect(cached.fresh).toBe(false);
    expect(cached.providers).toHaveLength(5);
    const cachedKimi = cached.providers.find((p) => p.id === "kimi");
    expect(cachedKimi?.status).toBe("ok");
    expect(cachedKimi?.limits.length).toBeGreaterThan(0);
    const lastGoodIds = (cachedKimi?.limits ?? []).map((l) => l.id);

    kimiMode = "parse_error";
    const failedRes = await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    expect(failedRes.status).toBe(200);
    const failedBody = (await failedRes.json()) as { snapshot: unknown };
    const failed = parseAggregateSnapshot(failedBody.snapshot);
    const failedKimi = failed.providers.find((p) => p.id === "kimi");
    expect(failedKimi?.status).toBe("parse_error");
    expect(failedKimi?.stale).toBe(true);
    expect(failedKimi?.limits.map((l) => l.id)).toEqual(lastGoodIds);

    const othersOk = failed.providers.filter((p) => p.id !== "kimi");
    expect(othersOk.every((p) => p.status === "ok" || p.status === "unsupported")).toBe(true);

    kimiMode = "healthy";
    const recoveredRes = await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    expect(recoveredRes.status).toBe(200);
    const recoveredBody = (await recoveredRes.json()) as { snapshot: unknown };
    const recovered = parseAggregateSnapshot(recoveredBody.snapshot);
    const recoveredKimi = recovered.providers.find((p) => p.id === "kimi");
    expect(recoveredKimi?.status).toBe("ok");
    expect(recoveredKimi?.stale).toBe(false);
    expect(recoveredKimi?.limits.length).toBeGreaterThan(0);
  });
});
