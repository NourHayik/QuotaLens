import { describe, expect, it, vi } from "vitest";
import { createCliContext } from "../src/cli/context.js";
import { DEFAULT_APP_SETTINGS } from "../src/core/domain/index.js";

describe("Auto-refresh, Intervals, Cooldown, and Staggering", () => {
  it("defaults auto_refresh_enabled to false with 60s interval", () => {
    const ctx = createCliContext({ dbPath: ":memory:", demo: true });
    try {
      const settings = ctx.settingsRepo.getSettings();
      expect(settings.auto_refresh_enabled).toBe(false);
      expect(settings.refresh_interval_seconds).toBe(60);
      expect(DEFAULT_APP_SETTINGS.auto_refresh_enabled).toBe(false);
      expect(DEFAULT_APP_SETTINGS.refresh_interval_seconds).toBe(60);
    } finally {
      ctx.dispose();
    }
  });

  it("supports safe interval settings: 15s, 30s, 60s, 5m (300s)", () => {
    const ctx = createCliContext({ dbPath: ":memory:", demo: true });
    try {
      const safeIntervals = [15, 30, 60, 300];
      for (const interval of safeIntervals) {
        const updated = ctx.settingsRepo.updateSettings({
          refresh_interval_seconds: interval,
        });
        expect(updated.refresh_interval_seconds).toBe(interval);
      }
    } finally {
      ctx.dispose();
    }
  });

  it("honors provider cooldown to prevent redundant execution when force is false", async () => {
    const ctx = createCliContext({ dbPath: ":memory:", demo: true });
    try {
      // Configure 60s cooldown on codex
      ctx.settingsRepo.saveProviderConfig({
        provider_id: "codex",
        enabled: true,
        cooldown_seconds: 60,
      });

      // Initial fresh fetch
      const first = await ctx.refreshService.refreshProvider("codex", { force: true });
      expect(first.status).toBe("ok");

      // Immediate second fetch without force: returns cached last-good
      const second = await ctx.refreshService.refreshProvider("codex", { force: false });
      expect(second.fetched_at).toBe(first.fetched_at);
      expect(second.status).toBe("ok");
    } finally {
      ctx.dispose();
    }
  });

  it("auto-refresh scheduler simulates periodic ticks and stops when disabled", () => {
    vi.useFakeTimers();

    let refreshCount = 0;
    let isRunning = false;
    let intervalTimer: ReturnType<typeof setInterval> | null = null;

    const startAutoRefresh = (intervalSeconds: number) => {
      isRunning = true;
      intervalTimer = setInterval(() => {
        if (isRunning) {
          refreshCount++;
        }
      }, intervalSeconds * 1000);
    };

    const stopAutoRefresh = () => {
      isRunning = false;
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
    };

    // Start with 15s interval
    startAutoRefresh(15);
    expect(refreshCount).toBe(0);

    // Fast forward 15s -> 1 tick
    vi.advanceTimersByTime(15_000);
    expect(refreshCount).toBe(1);

    // Fast forward 30s -> 2 more ticks
    vi.advanceTimersByTime(30_000);
    expect(refreshCount).toBe(3);

    // Turn auto-refresh off -> stops polling
    stopAutoRefresh();
    vi.advanceTimersByTime(60_000);
    expect(refreshCount).toBe(3); // Unchanged!

    vi.useRealTimers();
  });
});
