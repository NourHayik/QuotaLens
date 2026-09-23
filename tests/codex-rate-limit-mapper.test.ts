import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapCodexRateLimits } from "../src/providers/codex/rate-limit-mapper.js";
import type { CodexRateLimitsResult } from "../src/providers/codex/types.js";

const FIXTURES_DIR = join(__dirname, "fixtures", "codex");

function loadFixture(filename: string): CodexRateLimitsResult {
  const content = readFileSync(join(FIXTURES_DIR, filename), "utf8");
  return JSON.parse(content) as CodexRateLimitsResult;
}

describe("Codex rate-limit-mapper", () => {
  const testNow = new Date("2026-09-15T09:00:00.000Z");

  it("correctly normalizes a full usage response", () => {
    const fixture = loadFixture("full-usage.json");
    const { limits, planLabel } = mapCodexRateLimits(fixture, testNow);

    expect(planLabel).toBe("Team");

    // Primary window (5-hour)
    const primary = limits.find((l) => l.id === "primary");
    expect(primary).toBeDefined();
    expect(primary?.name).toBe("5-hour rolling window");
    expect(primary?.category).toBe("rolling_window");
    expect(primary?.window_minutes).toBe(300);
    expect(primary?.used_percent).toBe(40);
    expect(primary?.remaining_percent).toBe(60);
    expect(primary?.model_id).toBe("gpt-4o");
    expect(primary?.resets_at).toBe(new Date(1789461659 * 1000).toISOString());
    expect(primary?.reset_countdown_seconds).toBeGreaterThanOrEqual(0);

    // Secondary window (weekly)
    const weekly = limits.find((l) => l.id === "weekly");
    expect(weekly).toBeDefined();
    expect(weekly?.name).toBe("Weekly quota");
    expect(weekly?.category).toBe("weekly");
    expect(weekly?.window_minutes).toBe(10080);
    expect(weekly?.used_percent).toBe(12);
    expect(weekly?.remaining_percent).toBe(88);
    expect(weekly?.resets_at).toBe(new Date(1789895223 * 1000).toISOString());

    // Additional bucket from rateLimitsByLimitId (spark)
    const spark = limits.find((l) => l.id === "spark:primary");
    expect(spark).toBeDefined();
    expect(spark?.name).toBe("Codex Spark Quota (5h)");
    expect(spark?.used_percent).toBe(5);
    expect(spark?.remaining_percent).toBe(95);
    expect(spark?.model_id).toBe("gpt-4o-mini");

    // Reset credits
    const resetCredits = limits.find((l) => l.id === "reset_credits");
    expect(resetCredits).toBeDefined();
    expect(resetCredits?.name).toBe("Rate limit reset credits");
    expect(resetCredits?.category).toBe("credit");
    expect(resetCredits?.remaining_amount).toBe(3);
    expect(resetCredits?.amount_unit).toBe("credits");
  });

  it("preserves single-window accounts: only 5-hour window present, secondary NOT fabricated", () => {
    const fixture = loadFixture("single-window-5h.json");
    const { limits, planLabel } = mapCodexRateLimits(fixture, testNow);

    expect(planLabel).toBe("Pro");
    expect(limits.length).toBe(1);

    const primary = limits.find((l) => l.id === "primary");
    expect(primary).toBeDefined();
    expect(primary?.used_percent).toBe(65);
    expect(primary?.remaining_percent).toBe(35);

    // Secondary MUST NOT be fabricated
    const secondary = limits.find((l) => l.id === "weekly");
    expect(secondary).toBeUndefined();
  });

  it("preserves single-window accounts: only weekly window present, primary NOT fabricated", () => {
    const fixture = loadFixture("single-window-weekly.json");
    const { limits, planLabel } = mapCodexRateLimits(fixture, testNow);

    expect(planLabel).toBe("Plus");
    expect(limits.length).toBe(1);

    const weekly = limits.find((l) => l.id === "weekly");
    expect(weekly).toBeDefined();
    expect(weekly?.used_percent).toBe(25);
    expect(weekly?.remaining_percent).toBe(75);

    // Primary MUST NOT be fabricated
    const primary = limits.find((l) => l.id === "primary");
    expect(primary).toBeUndefined();
  });

  it("handles accounts with no windows without error", () => {
    const fixture = loadFixture("no-windows.json");
    const { limits, planLabel } = mapCodexRateLimits(fixture, testNow);

    expect(planLabel).toBe("Free");
    expect(limits).toEqual([]);
  });

  it("parses account credits with currency symbol", () => {
    const custom: CodexRateLimitsResult = {
      ordinaryUsageAllowed: true,
      rateLimits: {
        limitId: "codex",
        limitName: null,
        normalModelSlug: null,
        primary: null,
        secondary: null,
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: "$25.50",
        },
        spendControlReached: false,
        planType: "team",
        rateLimitReachedType: null,
      },
      rateLimitsByLimitId: null,
      rateLimitResetCredits: null,
      accountId: "credit-user",
    };

    const { limits } = mapCodexRateLimits(custom, testNow);
    const credit = limits.find((l) => l.id === "credit_balance");
    expect(credit).toBeDefined();
    expect(credit?.remaining_amount).toBe(25.5);
    expect(credit?.amount_unit).toBe("USD");
  });
});
