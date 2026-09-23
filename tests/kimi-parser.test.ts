import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderParseError } from "../src/core/domain/index.js";
import {
  parseKimiDurationToSeconds,
  parseKimiRestUsage,
  parseKimiUsageText,
  parseTokenQuantity,
} from "../src/providers/kimi/usage-parser.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/kimi");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("Kimi usage parser helpers", () => {
  it("parses duration strings accurately into seconds", () => {
    expect(parseKimiDurationToSeconds("18m")).toBe(1080);
    expect(parseKimiDurationToSeconds("2h 5m")).toBe(7500);
    expect(parseKimiDurationToSeconds("4d 21h 18m")).toBe(422280);
    expect(parseKimiDurationToSeconds("45s")).toBe(45);
    expect(parseKimiDurationToSeconds("")).toBeUndefined();
  });

  it("parses token quantity representations", () => {
    expect(parseTokenQuantity("0")).toBe(0);
    expect(parseTokenQuantity("1M")).toBe(1_000_000);
    expect(parseTokenQuantity("200k")).toBe(200_000);
    expect(parseTokenQuantity("12.5k")).toBe(12_500);
  });
});

describe("Kimi usage parser with fixtures", () => {
  const fixedNow = new Date("2026-09-15T10:00:00.000Z");

  it("parses healthy usage fixture containing 5h, weekly, and context window", () => {
    const raw = readFixture("healthy-usage.txt");
    const result = parseKimiUsageText(raw, fixedNow);

    expect(result.limits).toHaveLength(3);

    const fiveH = result.limits.find((l) => l.id === "5h");
    expect(fiveH).toBeDefined();
    expect(fiveH?.name).toBe("5-hour rolling limit");
    expect(fiveH?.category).toBe("rolling_window");
    expect(fiveH?.window_minutes).toBe(300);
    expect(fiveH?.used_percent).toBe(12);
    expect(fiveH?.remaining_percent).toBe(88);
    expect(fiveH?.reset_countdown_seconds).toBe(1080);
    expect(fiveH?.resets_at).toBe("2026-09-15T10:18:00.000Z");

    const weekly = result.limits.find((l) => l.id === "weekly");
    expect(weekly).toBeDefined();
    expect(weekly?.name).toBe("Weekly quota");
    expect(weekly?.category).toBe("weekly");
    expect(weekly?.window_minutes).toBe(10080);
    expect(weekly?.used_percent).toBe(27);
    expect(weekly?.remaining_percent).toBe(73);
    expect(weekly?.reset_countdown_seconds).toBe(422280);

    const context = result.limits.find((l) => l.id === "context_window");
    expect(context).toBeDefined();
    expect(context?.category).toBe("other");
    expect(context?.used_percent).toBe(0);
    expect(context?.used_amount).toBe(0);
    expect(context?.limit_amount).toBe(1_000_000);
    expect(context?.remaining_amount).toBe(1_000_000);
    expect(context?.amount_unit).toBe("tokens");
  });

  it("parses exhausted quota fixture correctly", () => {
    const raw = readFixture("exhausted-usage.txt");
    const result = parseKimiUsageText(raw, fixedNow);

    const fiveH = result.limits.find((l) => l.id === "5h");
    expect(fiveH?.used_percent).toBe(100);
    expect(fiveH?.remaining_percent).toBe(0);
    expect(fiveH?.reset_countdown_seconds).toBe(2 * 3600 + 45 * 60);

    const weekly = result.limits.find((l) => l.id === "weekly");
    expect(weekly?.used_percent).toBe(100);
    expect(weekly?.remaining_percent).toBe(0);

    const context = result.limits.find((l) => l.id === "context_window");
    expect(context?.used_percent).toBe(100);
    expect(context?.remaining_amount).toBe(0);
  });

  it("parses partial fixture without inventing absent windows", () => {
    const raw = readFixture("missing-window.txt");
    const result = parseKimiUsageText(raw, fixedNow);

    expect(result.limits.find((l) => l.id === "5h")).toBeUndefined();
    expect(result.limits.find((l) => l.id === "weekly")).toBeDefined();
  });

  it("throws ProviderParseError on unparseable / drifted format", () => {
    const raw = readFixture("drifted-format.txt");
    expect(() => parseKimiUsageText(raw, fixedNow)).toThrow(ProviderParseError);
  });

  it("throws ProviderParseError on unauthenticated session response without usage box", () => {
    const raw = readFixture("unauthenticated.txt");
    expect(() => parseKimiUsageText(raw, fixedNow)).toThrow(ProviderParseError);
  });

  it("parses real-time Kimi REST usage payload accurately", () => {
    const restPayload = {
      usage: {
        limit: "100",
        used: "38",
        remaining: "62",
        resetTime: "2026-09-20T04:02:06.200Z",
      },
      limits: [
        {
          window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
          detail: {
            limit: "100",
            used: "5",
            remaining: "95",
            resetTime: "2026-09-16T08:02:06.200Z",
          },
        },
      ],
      booster_wallet: {
        status: "STATUS_ENABLED",
        monthlyChargeLimit: {
          currency: "USD",
          priceInCents: 10000,
        },
        monthlyUsed: {
          currency: "USD",
          priceInCents: 2500,
        },
      },
    };

    const result = parseKimiRestUsage(restPayload, fixedNow);
    expect(result.limits).toHaveLength(3);

    const weekly = result.limits.find((l) => l.id === "weekly");
    expect(weekly?.used_percent).toBe(38);
    expect(weekly?.remaining_percent).toBe(62);
    expect(weekly?.category).toBe("weekly");
    expect(weekly?.window_minutes).toBe(10080);
    expect(weekly?.resets_at).toBe("2026-09-20T04:02:06.200Z");

    const fiveH = result.limits.find((l) => l.id === "5h");
    expect(fiveH?.used_percent).toBe(5);
    expect(fiveH?.remaining_percent).toBe(95);
    expect(fiveH?.category).toBe("rolling_window");
    expect(fiveH?.window_minutes).toBe(300);

    const booster = result.limits.find((l) => l.id === "booster_wallet");
    expect(booster?.category).toBe("credit");
    expect(booster?.limit_amount).toBe(100);
    expect(booster?.used_amount).toBe(25);
    expect(booster?.remaining_amount).toBe(75);
    expect(booster?.used_percent).toBe(25);
  });
});
