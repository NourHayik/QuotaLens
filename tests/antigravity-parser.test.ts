import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderParseError } from "../src/core/domain/index.js";
import {
  parseAntigravityDurationToSeconds,
  parseAntigravityUsageText,
} from "../src/providers/antigravity/usage-parser.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/antigravity");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("Antigravity usage parser helpers", () => {
  it("parses duration strings accurately into seconds", () => {
    expect(parseAntigravityDurationToSeconds("3h 41m")).toBe(3 * 3600 + 41 * 60);
    expect(parseAntigravityDurationToSeconds("166h 41m")).toBe(166 * 3600 + 41 * 60);
    expect(parseAntigravityDurationToSeconds("1d 2h")).toBe(86400 + 7200);
    expect(parseAntigravityDurationToSeconds("Quota available")).toBeUndefined();
    expect(parseAntigravityDurationToSeconds("")).toBeUndefined();
  });
});

describe("Antigravity usage parser with fixtures", () => {
  const fixedNow = new Date("2026-09-15T10:00:00.000Z");

  it("parses healthy usage fixture preserving distinct Gemini and Claude/GPT model groups", () => {
    const raw = readFixture("healthy-usage.txt");
    const result = parseAntigravityUsageText(raw, fixedNow);

    expect(result.planLabel).toBe("Google AI Pro");
    expect(result.limits).toHaveLength(4);

    // 1. Gemini Weekly
    const geminiWeekly = result.limits.find((l) => l.id === "gemini_models:weekly");
    expect(geminiWeekly).toBeDefined();
    expect(geminiWeekly?.name).toBe("Gemini Models (Weekly)");
    expect(geminiWeekly?.category).toBe("weekly");
    expect(geminiWeekly?.window_minutes).toBe(10080);
    expect(geminiWeekly?.remaining_percent).toBe(95.06);
    expect(geminiWeekly?.used_percent).toBe(4.94);
    expect(geminiWeekly?.reset_countdown_seconds).toBe(166 * 3600 + 41 * 60);
    expect(geminiWeekly?.model_id).toBe("gemini-flash,gemini-pro");

    // 2. Gemini 5h
    const gemini5h = result.limits.find((l) => l.id === "gemini_models:5h");
    expect(gemini5h).toBeDefined();
    expect(gemini5h?.name).toBe("Gemini Models (5-hour)");
    expect(gemini5h?.category).toBe("rolling_window");
    expect(gemini5h?.window_minutes).toBe(300);
    expect(gemini5h?.remaining_percent).toBe(70.38);
    expect(gemini5h?.used_percent).toBe(29.62);
    expect(gemini5h?.reset_countdown_seconds).toBe(3 * 3600 + 41 * 60);
    expect(gemini5h?.model_id).toBe("gemini-flash,gemini-pro");

    // 3. Claude & GPT Weekly
    const claudeWeekly = result.limits.find((l) => l.id === "claude_and_gpt_models:weekly");
    expect(claudeWeekly).toBeDefined();
    expect(claudeWeekly?.category).toBe("weekly");
    expect(claudeWeekly?.remaining_percent).toBe(100);
    expect(claudeWeekly?.used_percent).toBe(0);
    expect(claudeWeekly?.model_id).toBe("claude-opus,claude-sonnet,gpt-oss");
    expect(claudeWeekly?.resets_at).toBeUndefined();

    // 4. Claude & GPT 5h
    const claude5h = result.limits.find((l) => l.id === "claude_and_gpt_models:5h");
    expect(claude5h).toBeDefined();
    expect(claude5h?.category).toBe("rolling_window");
    expect(claude5h?.remaining_percent).toBe(100);
    expect(claude5h?.used_percent).toBe(0);
  });

  it("parses exhausted quota fixture correctly", () => {
    const raw = readFixture("exhausted-usage.txt");
    const result = parseAntigravityUsageText(raw, fixedNow);

    const weekly = result.limits.find((l) => l.id === "gemini_models:weekly");
    expect(weekly?.remaining_percent).toBe(0);
    expect(weekly?.used_percent).toBe(100);
    expect(weekly?.reset_countdown_seconds).toBe(42 * 3600 + 10 * 60);

    const fiveH = result.limits.find((l) => l.id === "gemini_models:5h");
    expect(fiveH?.remaining_percent).toBe(0);
    expect(fiveH?.used_percent).toBe(100);
    expect(fiveH?.reset_countdown_seconds).toBe(1 * 3600 + 20 * 60);
  });

  it("parses single group fixture without error", () => {
    const raw = readFixture("single-group.txt");
    const result = parseAntigravityUsageText(raw, fixedNow);

    expect(result.limits).toHaveLength(2);
    expect(result.limits.map((l) => l.id)).toEqual(["gemini_models:weekly", "gemini_models:5h"]);
  });

  it("throws ProviderParseError on unparseable / drifted format", () => {
    const raw = readFixture("drifted-format.txt");
    expect(() => parseAntigravityUsageText(raw, fixedNow)).toThrow(ProviderParseError);
  });

  it("throws ProviderParseError on unauthenticated session response", () => {
    const raw = readFixture("unauthenticated.txt");
    expect(() => parseAntigravityUsageText(raw, fixedNow)).toThrow(ProviderParseError);
  });
});
