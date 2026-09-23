import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CliContext, createCliContext } from "../src/cli/context.js";
import { aggregateSnapshotSchema } from "../src/core/domain/index.js";
import { type RunningServer, startServer } from "../src/server/index.js";

interface HealthResponse {
  status: string;
  loopback_only: boolean;
  uptime: number;
}

interface ProvidersResponse {
  providers: Array<{ id: string; displayName: string; enabled: boolean }>;
}

interface ProviderDetailResponse {
  id: string;
  displayName: string;
  config: { provider_id: string; enabled: boolean };
}

interface RefreshResponse {
  refreshed: string;
  provider_id?: string;
  snapshot: { id?: string; fresh?: boolean };
}

interface HistoryResponse {
  provider_id: string;
  range: string;
  count: number;
  history: unknown[];
}

interface SettingsResponse {
  settings: { auto_refresh_enabled: boolean; refresh_interval_seconds: number };
  provider_configs: unknown[];
}

interface ProviderConfigResponse {
  provider_config: { display_name_override?: string; cooldown_seconds: number };
}

interface ErrorResponse {
  error: string;
  message: string;
}

describe("Server REST API", () => {
  let ctx: CliContext;
  let running: RunningServer;

  beforeAll(async () => {
    ctx = createCliContext({ dbPath: ":memory:", demo: true });
    running = await startServer(ctx, { host: "127.0.0.1", port: 0 });
  });

  afterAll(async () => {
    await running.close();
    ctx.dispose();
  });

  it("GET /api/health returns loopback verification and ok status", async () => {
    const res = await fetch(`${running.url}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as HealthResponse;
    expect(data.status).toBe("ok");
    expect(data.loopback_only).toBe(true);
    expect(typeof data.uptime).toBe("number");
  });

  it("GET /api/snapshot returns cached snapshot by default", async () => {
    const res = await fetch(`${running.url}/api/snapshot`);
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aggregateSnapshotSchema.parse(json);
    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.fresh).toBe(false);
    expect(parsed.providers.length).toBeGreaterThan(0);
  });

  it("GET /api/snapshot?fresh=true refreshes providers and returns fresh snapshot", async () => {
    const res = await fetch(`${running.url}/api/snapshot?fresh=true`);
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aggregateSnapshotSchema.parse(json);
    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.fresh).toBe(true);
    expect(parsed.providers.length).toBeGreaterThan(0);
  });

  it("GET /api/snapshot with providerId filter filters returned providers", async () => {
    const res = await fetch(`${running.url}/api/snapshot?providerId=codex`);
    expect(res.status).toBe(200);
    const json = await res.json();
    const parsed = aggregateSnapshotSchema.parse(json);
    expect(parsed.providers.length).toBe(1);
    expect(parsed.providers[0]?.id).toBe("codex");
  });

  it("GET /api/providers lists all registered providers and their capability state", async () => {
    const res = await fetch(`${running.url}/api/providers`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as ProvidersResponse;
    expect(Array.isArray(data.providers)).toBe(true);
    expect(data.providers.length).toBeGreaterThan(0);

    const first = data.providers[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("displayName");
    expect(first).toHaveProperty("enabled");
  });

  it("GET /api/providers/:id returns provider detail or 404 for unknown provider", async () => {
    const resOk = await fetch(`${running.url}/api/providers/codex`);
    expect(resOk.status).toBe(200);
    const okData = (await resOk.json()) as ProviderDetailResponse;
    expect(okData.id).toBe("codex");
    expect(okData.displayName).toBe("Codex");
    expect(okData.config).toBeDefined();

    const resMissing = await fetch(`${running.url}/api/providers/unknown_provider_id`);
    expect(resMissing.status).toBe(404);
  });

  it("POST /api/refresh triggers global refresh and returns updated snapshot", async () => {
    const res = await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as RefreshResponse;
    expect(data.refreshed).toBe("all");
    expect(data.snapshot.fresh).toBe(true);
  });

  it("POST /api/refresh with providerId refreshes a single provider", async () => {
    const res = await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "codex", force: true }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as RefreshResponse;
    expect(data.refreshed).toBe("single");
    expect(data.provider_id).toBe("codex");
    expect(data.snapshot.id).toBe("codex");
  });

  it("GET /api/history/:id returns history entries filtered by range", async () => {
    // Refresh to ensure history exists
    await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "codex", force: true }),
    });

    const res24h = await fetch(`${running.url}/api/history/codex?range=24h`);
    expect(res24h.status).toBe(200);
    const data24h = (await res24h.json()) as HistoryResponse;
    expect(data24h.provider_id).toBe("codex");
    expect(data24h.range).toBe("24h");
    expect(Array.isArray(data24h.history)).toBe(true);
    expect(data24h.count).toBeGreaterThan(0);

    const res7d = await fetch(`${running.url}/api/history/codex?range=7d`);
    expect(res7d.status).toBe(200);
    const data7d = (await res7d.json()) as HistoryResponse;
    expect(data7d.range).toBe("7d");
  });

  it("GET /api/settings and PUT /api/settings manages application settings", async () => {
    const resGet = await fetch(`${running.url}/api/settings`);
    expect(resGet.status).toBe(200);
    const initial = (await resGet.json()) as SettingsResponse;
    expect(initial.settings).toBeDefined();
    expect(initial.provider_configs).toBeDefined();

    // Update settings
    const resPut = await fetch(`${running.url}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_refresh_enabled: true,
        refresh_interval_seconds: 30,
      }),
    });
    expect(resPut.status).toBe(200);
    const updated = (await resPut.json()) as SettingsResponse;
    expect(updated.settings.auto_refresh_enabled).toBe(true);
    expect(updated.settings.refresh_interval_seconds).toBe(30);

    // Verify persisted
    const verifyGet = await fetch(`${running.url}/api/settings`);
    const verified = (await verifyGet.json()) as SettingsResponse;
    expect(verified.settings.auto_refresh_enabled).toBe(true);
    expect(verified.settings.refresh_interval_seconds).toBe(30);
  });

  it("PUT /api/settings/providers/:id updates provider configuration", async () => {
    const res = await fetch(`${running.url}/api/settings/providers/codex`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name_override: "Custom Codex Name",
        cooldown_seconds: 45,
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as ProviderConfigResponse;
    expect(data.provider_config.display_name_override).toBe("Custom Codex Name");
    expect(data.provider_config.cooldown_seconds).toBe(45);
  });

  it("returns 400 validation error on invalid parameters", async () => {
    const res = await fetch(`${running.url}/api/history/codex?range=invalid_range`);
    expect(res.status).toBe(400);
    const err = (await res.json()) as ErrorResponse;
    expect(err.error).toBe("VALIDATION_ERROR");
  });
});
