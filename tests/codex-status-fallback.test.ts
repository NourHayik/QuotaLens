import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCodexStatusText } from "../src/providers/codex/status-fallback.js";

const FIXTURES_DIR = join(__dirname, "fixtures", "codex");

describe("Codex status fallback parser", () => {
  const testNow = new Date("2026-09-15T09:00:00.000Z");

  it("parses valid status text fixture deterministically without AI prompt", () => {
    const rawText = readFileSync(join(FIXTURES_DIR, "status-fallback.txt"), "utf8");
    const { limits, planLabel } = parseCodexStatusText(rawText, testNow);

    expect(planLabel).toBe("Pro");
    expect(limits.length).toBe(3);

    const primary = limits.find((l) => l.id === "primary");
    expect(primary).toBeDefined();
    expect(primary?.used_percent).toBe(42);
    expect(primary?.remaining_percent).toBe(58);
    expect(primary?.window_minutes).toBe(300);
    expect(primary?.reset_countdown_seconds).toBe(2 * 3600 + 18 * 60);

    const weekly = limits.find((l) => l.id === "weekly");
    expect(weekly).toBeDefined();
    expect(weekly?.used_percent).toBe(15);
    expect(weekly?.remaining_percent).toBe(85);
    expect(weekly?.window_minutes).toBe(10080);
    expect(weekly?.reset_countdown_seconds).toBe(4 * 86400 + 12 * 3600);

    const resetCredits = limits.find((l) => l.id === "reset_credits");
    expect(resetCredits).toBeDefined();
    expect(resetCredits?.remaining_amount).toBe(2);
    expect(resetCredits?.amount_unit).toBe("credits");
  });

  it("safely handles text with only 5-hour limit and no weekly limit", () => {
    const text = "5-hour limit: 50% used (resets in 1h 30m)\nAccount: Team";
    const { limits, planLabel } = parseCodexStatusText(text, testNow);

    expect(planLabel).toBe("Team");
    expect(limits.length).toBe(1);
    expect(limits[0]?.id).toBe("primary");
    expect(limits[0]?.used_percent).toBe(50);
  });

  it("returns empty limits on non-matching or garbage text", () => {
    const { limits, planLabel } = parseCodexStatusText(
      "Just a random log message without limits",
      testNow,
    );
    expect(limits).toEqual([]);
    expect(planLabel).toBeUndefined();
  });

  it("handles empty or blank input gracefully", () => {
    expect(parseCodexStatusText("", testNow).limits).toEqual([]);
    expect(parseCodexStatusText("   ", testNow).limits).toEqual([]);
  });
});
