// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderSnapshot, UsageLimit } from "../src/core/domain/index.js";
import { Badge } from "../src/web/src/components/Badge.js";
import { HistoryChart } from "../src/web/src/components/HistoryChart.js";
import { ProviderCard } from "../src/web/src/components/ProviderCard.js";
import { UsageLimitBar } from "../src/web/src/components/UsageLimitBar.js";

describe("Web Dashboard React Components", () => {
  afterEach(() => {
    cleanup();
  });
  const mockHealthySnapshot: ProviderSnapshot = {
    id: "codex",
    display_name: "OpenAI Codex",
    installed: true,
    auth_state: "authenticated",
    usage_capability: "supported",
    status: "ok",
    source: "app-server",
    cli_version: "0.1.2",
    plan_label: "Pro",
    fetched_at: new Date().toISOString(),
    fetch_started_at: new Date().toISOString(),
    stale: false,
    limits: [
      {
        id: "primary",
        name: "5-hour rolling",
        category: "rolling_window",
        used_percent: 45,
        remaining_percent: 55,
        resets_at: new Date(Date.now() + 7200_000).toISOString(),
        reset_countdown_seconds: 7200,
      },
    ],
    errors: [],
  };

  it("Badge renders appropriate styles and labels for each status", () => {
    const { rerender } = render(<Badge status="ok" />);
    expect(screen.getByRole("status").textContent).toBe("Active");
    expect(screen.getByRole("status").className).toContain("badge-ok");

    rerender(<Badge status="unsupported" />);
    expect(screen.getByRole("status").textContent).toBe("Unsupported");
    expect(screen.getByRole("status").className).toContain("badge-unsupported");

    rerender(<Badge status="stale" />);
    expect(screen.getByRole("status").textContent).toBe("Stale");
    expect(screen.getByRole("status").className).toContain("badge-stale");

    rerender(<Badge status="not_authenticated" />);
    expect(screen.getByRole("status").textContent).toBe("Auth Required");
    expect(screen.getByRole("status").className).toContain("badge-error");
  });

  it("UsageLimitBar applies semantic colors: green < 70%, amber 70-90%, red >= 90%", () => {
    const greenLimit: UsageLimit = {
      id: "test",
      name: "Green Limit",
      category: "rolling_window",
      used_percent: 50,
      remaining_percent: 50,
      reset_countdown_seconds: 3600,
    };

    const { container, rerender } = render(<UsageLimitBar limit={greenLimit} />);
    expect(container.querySelector(".progress-green")).not.toBeNull();
    expect(screen.getByText("50% used")).toBeDefined();
    expect(screen.getByText("Resets in 1h 0m")).toBeDefined();

    const amberLimit: UsageLimit = { ...greenLimit, used_percent: 75, remaining_percent: 25 };
    rerender(<UsageLimitBar limit={amberLimit} />);
    expect(container.querySelector(".progress-amber")).not.toBeNull();

    const redLimit: UsageLimit = { ...greenLimit, used_percent: 95, remaining_percent: 5 };
    rerender(<UsageLimitBar limit={redLimit} />);
    expect(container.querySelector(".progress-red")).not.toBeNull();
  });

  it("ProviderCard renders healthy snapshot with limits and controls", () => {
    let refreshedId = "";
    let detailsId = "";

    render(
      <ProviderCard
        snapshot={mockHealthySnapshot}
        onRefresh={(id) => {
          refreshedId = id;
        }}
        onViewDetails={(id) => {
          detailsId = id;
        }}
      />,
    );

    expect(screen.getByText("OpenAI Codex")).toBeDefined();
    expect(screen.getByText("Pro")).toBeDefined();
    expect(screen.getByText("5-hour rolling")).toBeDefined();
    expect(screen.getByText("45% used")).toBeDefined();

    // Refresh button works
    screen.getByRole("button", { name: "Refresh OpenAI Codex" }).click();
    expect(refreshedId).toBe("codex");

    // Details button works
    screen.getByRole("button", { name: "View details and history for OpenAI Codex" }).click();
    expect(detailsId).toBe("codex");
  });

  it("ProviderCard renders honest unsupported state and zero AI credit tag", () => {
    const mockUnsupportedSnapshot: ProviderSnapshot = {
      id: "cursor",
      display_name: "Cursor",
      installed: true,
      auth_state: "authenticated",
      usage_capability: "unsupported",
      status: "unsupported",
      source: "none",
      cli_version: "0.45.1",
      fetched_at: new Date().toISOString(),
      fetch_started_at: new Date().toISOString(),
      stale: false,
      limits: [],
      errors: [
        {
          code: "usage_unsupported",
          message: "Cursor CLI does not expose a local usage command",
        },
      ],
    };

    render(
      <ProviderCard
        snapshot={mockUnsupportedSnapshot}
        onRefresh={() => {}}
        onViewDetails={() => {}}
      />,
    );

    expect(screen.getByText("Usage Tracking Unsupported")).toBeDefined();
    expect(screen.getByText("Cursor CLI does not expose a local usage command")).toBeDefined();
    expect(screen.getByText("✓ Zero AI credits consumed")).toBeDefined();
    // Must NOT show 0% progress bar
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("ProviderCard displays stale badge when snapshot is stale", () => {
    const staleSnapshot: ProviderSnapshot = {
      ...mockHealthySnapshot,
      stale: true,
      status: "timeout",
    };

    render(<ProviderCard snapshot={staleSnapshot} onRefresh={() => {}} onViewDetails={() => {}} />);

    expect(screen.getByText("Stale")).toBeDefined();
  });

  it("HistoryChart renders polyline SVG and handles range changes", () => {
    let currentRange = "24h";
    const primaryLimit = mockHealthySnapshot.limits[0] ?? {
      id: "primary",
      category: "rolling_window" as const,
    };
    const history: ProviderSnapshot[] = [
      {
        ...mockHealthySnapshot,
        fetched_at: new Date(Date.now() - 3600_000).toISOString(),
        limits: [{ ...primaryLimit, used_percent: 20 }],
      },
      {
        ...mockHealthySnapshot,
        fetched_at: new Date().toISOString(),
        limits: [{ ...primaryLimit, used_percent: 65 }],
      },
    ];

    const { rerender } = render(
      <HistoryChart
        history={history}
        range="24h"
        onRangeChange={(r) => {
          currentRange = r;
        }}
      />,
    );

    // SVG polyline is rendered
    expect(document.querySelector("polyline")).not.toBeNull();

    // Range selector switches
    screen.getByRole("button", { name: "7d" }).click();
    expect(currentRange).toBe("7d");

    // Empty history renders empty state message
    rerender(
      <HistoryChart
        history={[]}
        range="24h"
        onRangeChange={(r) => {
          currentRange = r;
        }}
      />,
    );
    expect(
      screen.getByText("No historical usage snapshots recorded for this period yet."),
    ).toBeDefined();
  });
});
