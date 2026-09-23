// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/web/src/App.js";
import { Header } from "../src/web/src/components/Header.js";
import { SettingsModal } from "../src/web/src/components/SettingsModal.js";
import type { AggregateSnapshot } from "../src/web/src/types.js";

const demoSnapshot: AggregateSnapshot = {
  schema_version: "1.0",
  generated_at: "2026-09-15T08:00:00.000Z",
  fresh: false,
  providers: [
    {
      id: "codex",
      display_name: "Codex",
      installed: true,
      auth_state: "authenticated",
      usage_capability: "supported",
      status: "ok",
      source: "app-server",
      fetched_at: "2026-09-15T08:00:00.000Z",
      fetch_started_at: "2026-09-15T08:00:00.000Z",
      stale: false,
      limits: [
        {
          id: "primary",
          name: "5-hour rolling window",
          category: "rolling_window",
          used_percent: 42,
          remaining_percent: 58,
        },
      ],
      errors: [],
    },
  ],
};

vi.mock("../src/web/src/hooks/useDashboard.js", () => ({
  useDashboard: () => ({
    snapshot: demoSnapshot,
    refreshingProviders: new Set<string>(),
    isRefreshingAll: false,
    connectionStatus: "connected",
    lastUpdated: new Date("2026-09-15T08:00:00.000Z"),
    autoRefreshEnabled: false,
    refreshIntervalSeconds: 60,
    refreshAll: vi.fn(),
    refreshProvider: vi.fn(),
    toggleAutoRefresh: vi.fn(),
    changeInterval: vi.fn(),
    reloadSettings: vi.fn(),
  }),
}));

describe("Dashboard accessibility and responsive contract", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("exposes skip link, main landmark, live region, and last-updated time", () => {
    render(<App />);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveProperty(
      "hash",
      "#main-content",
    );
    expect(document.getElementById("main-content")?.tagName).toBe("MAIN");
    expect(screen.getByText("Live").closest("[aria-live]")?.getAttribute("aria-live")).toBe(
      "polite",
    );
    expect(screen.getByText(/Last updated/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Refresh all providers" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Open settings" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Active");
  });

  it("labels header controls for keyboard users", () => {
    render(
      <Header
        lastUpdated={new Date("2026-09-15T08:00:00.000Z")}
        connectionStatus="connected"
        autoRefreshEnabled={false}
        refreshIntervalSeconds={60}
        isRefreshingAll={false}
        onToggleAutoRefresh={() => undefined}
        onChangeInterval={() => undefined}
        onRefreshAll={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Toggle auto-refresh")).toBeDefined();
    expect(screen.getByLabelText("Select refresh interval")).toBeDefined();
    expect(screen.getByLabelText("Refresh all providers")).toBeDefined();
  });

  it("focuses the settings close button and closes on Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          settings: {
            auto_refresh_enabled: false,
            refresh_interval_seconds: 60,
            retention_days: 90,
            max_concurrency: 3,
            default_timeout_ms: 10_000,
            stagger_interval_ms: 200,
          },
          provider_configs: [{ provider_id: "codex", enabled: true, cooldown_seconds: 0 }],
        }),
      })),
    );

    const onClose = vi.fn();
    render(<SettingsModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Close modal")).toBeDefined();
    });
    expect(document.activeElement).toBe(screen.getByLabelText("Close modal"));
    expect(screen.getByLabelText("Toggle auto-refresh")).toBeDefined();
    expect(screen.getByLabelText("Refresh interval")).toBeDefined();
    expect(screen.getByLabelText("History retention")).toBeDefined();
    expect(screen.getByLabelText("Enable codex")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps desktop wrap and 640px single-column card layout in CSS", () => {
    const css = readFileSync(resolve(__dirname, "../src/web/src/styles/dashboard.css"), "utf8");
    expect(css).toContain("max-width: 1380px");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toMatch(/@media \(max-width: 640px\)/);
    expect(css).toContain("grid-template-columns: 1fr");
    expect(css).toContain(".btn:focus-visible");
    expect(css).toContain(".skip-link");
  });
});
