import { ProviderParseError, type UsageLimit } from "../../core/domain/index.js";
import { cleanTerminalOutput } from "../../infra/process/ansi.js";
import type { KimiUsageParsed } from "./types.js";

/**
 * Parses relative duration strings such as "4d 21h 18m", "18m", "2h 5m", "45s"
 * into total seconds.
 */
export function parseKimiDurationToSeconds(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.trim().toLowerCase();

  let totalSeconds = 0;
  let matched = false;

  const dMatch = cleaned.match(/(\d+)\s*d/);
  if (dMatch?.[1]) {
    totalSeconds += Number.parseInt(dMatch[1], 10) * 86400;
    matched = true;
  }

  const hMatch = cleaned.match(/(\d+)\s*h/);
  if (hMatch?.[1]) {
    totalSeconds += Number.parseInt(hMatch[1], 10) * 3600;
    matched = true;
  }

  const mMatch = cleaned.match(/(\d+)\s*m/);
  if (mMatch?.[1]) {
    totalSeconds += Number.parseInt(mMatch[1], 10) * 60;
    matched = true;
  }

  const sMatch = cleaned.match(/(\d+)\s*s/);
  if (sMatch?.[1]) {
    totalSeconds += Number.parseInt(sMatch[1], 10);
    matched = true;
  }

  return matched ? totalSeconds : undefined;
}

/**
 * Parses token string representation such as "1M", "500k", "12.5k", "0" into an integer.
 */
export function parseTokenQuantity(val: string): number | undefined {
  if (!val) return undefined;
  const clean = val.trim().toLowerCase().replace(/,/g, "");

  if (clean.endsWith("m")) {
    const num = Number.parseFloat(clean.slice(0, -1));
    return Number.isNaN(num) ? undefined : Math.round(num * 1_000_000);
  }
  if (clean.endsWith("k")) {
    const num = Number.parseFloat(clean.slice(0, -1));
    return Number.isNaN(num) ? undefined : Math.round(num * 1_000);
  }

  const num = Number.parseFloat(clean);
  return Number.isNaN(num) ? undefined : Math.round(num);
}

/**
 * Deterministically parses Kimi Code `/usage` output into normalized UsageLimit objects.
 * Throws ProviderParseError if the output format has drifted or cannot be recognized.
 */
export function parseKimiUsageText(rawText: string, now: Date = new Date()): KimiUsageParsed {
  const cleaned = cleanTerminalOutput(rawText);

  // If output indicates not logged in and contains no usage box
  if (
    cleaned.includes("Send /login to login") &&
    !cleaned.toLowerCase().includes("plan usage") &&
    !cleaned.toLowerCase().includes("weekly limit")
  ) {
    throw new ProviderParseError("kimi", "Kimi CLI session is not authenticated");
  }

  const limits: UsageLimit[] = [];
  let planLabel: string | undefined;

  // 1. Five Hour Limit
  const fiveHourRegex = /5h\s+limit[^\d%]*(\d+)%\s+used(?:[^\n│]*?resets\s+in\s+([^\n│\r]+))?/i;
  const fiveHourMatch = cleaned.match(fiveHourRegex);
  if (fiveHourMatch?.[1]) {
    const usedPercent = Math.max(0, Math.min(100, Number.parseInt(fiveHourMatch[1], 10)));
    const remainingPercent = Math.max(0, 100 - usedPercent);
    const countdown = fiveHourMatch[2] ? parseKimiDurationToSeconds(fiveHourMatch[2]) : undefined;

    let resetsAtIso: string | undefined;
    if (countdown !== undefined) {
      resetsAtIso = new Date(now.getTime() + countdown * 1000).toISOString();
    }

    limits.push({
      id: "5h",
      name: "5-hour rolling limit",
      category: "rolling_window",
      window_minutes: 300,
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
      ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
    });
  }

  // 2. Weekly Limit
  const weeklyRegex = /weekly\s+limit[^\d%]*(\d+)%\s+used(?:[^\n│]*?resets\s+in\s+([^\n│\r]+))?/i;
  const weeklyMatch = cleaned.match(weeklyRegex);
  if (weeklyMatch?.[1]) {
    const usedPercent = Math.max(0, Math.min(100, Number.parseInt(weeklyMatch[1], 10)));
    const remainingPercent = Math.max(0, 100 - usedPercent);
    const countdown = weeklyMatch[2] ? parseKimiDurationToSeconds(weeklyMatch[2]) : undefined;

    let resetsAtIso: string | undefined;
    if (countdown !== undefined) {
      resetsAtIso = new Date(now.getTime() + countdown * 1000).toISOString();
    }

    limits.push({
      id: "weekly",
      name: "Weekly quota",
      category: "weekly",
      window_minutes: 10080,
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
      ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
    });
  }

  // 3. Monthly Limit (if reported in some plans)
  const monthlyRegex = /monthly\s+limit[^\d%]*(\d+)%\s+used(?:[^\n│]*?resets\s+in\s+([^\n│\r]+))?/i;
  const monthlyMatch = cleaned.match(monthlyRegex);
  if (monthlyMatch?.[1]) {
    const usedPercent = Math.max(0, Math.min(100, Number.parseInt(monthlyMatch[1], 10)));
    const remainingPercent = Math.max(0, 100 - usedPercent);
    const countdown = monthlyMatch[2] ? parseKimiDurationToSeconds(monthlyMatch[2]) : undefined;

    let resetsAtIso: string | undefined;
    if (countdown !== undefined) {
      resetsAtIso = new Date(now.getTime() + countdown * 1000).toISOString();
    }

    limits.push({
      id: "monthly",
      name: "Monthly quota",
      category: "monthly",
      window_minutes: 43200,
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
      ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
    });
  }

  // 4. Context Window
  const contextRegex = /context\s+window[^\d%]*(\d+)%\s*(?:\(([^/]+)\/\s*([^)]+)\))?/i;
  const contextMatch = cleaned.match(contextRegex);
  if (contextMatch?.[1]) {
    const usedPercent = Math.max(0, Math.min(100, Number.parseInt(contextMatch[1], 10)));
    const remainingPercent = Math.max(0, 100 - usedPercent);
    const usedAmount = contextMatch[2] ? parseTokenQuantity(contextMatch[2]) : undefined;
    const limitAmount = contextMatch[3] ? parseTokenQuantity(contextMatch[3]) : undefined;
    const remainingAmount =
      limitAmount !== undefined && usedAmount !== undefined
        ? Math.max(0, limitAmount - usedAmount)
        : undefined;

    limits.push({
      id: "context_window",
      name: "Context window",
      category: "other",
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      ...(usedAmount !== undefined ? { used_amount: usedAmount } : {}),
      ...(limitAmount !== undefined ? { limit_amount: limitAmount } : {}),
      ...(remainingAmount !== undefined ? { remaining_amount: remainingAmount } : {}),
      amount_unit: "tokens",
    });
  }

  // 5. Plan Label
  const planMatch = cleaned.match(/(?:plan|tier|membership):\s*([^\n│\r]+)/i);
  if (planMatch?.[1]) {
    planLabel = planMatch[1].trim();
  }

  // 6. Check if any recognized usage limit was extracted
  if (limits.length === 0) {
    throw new ProviderParseError(
      "kimi",
      "Unable to parse Kimi /usage output: no recognized limit windows found",
    );
  }

  return { limits, planLabel };
}

/**
 * Parses real-time Kimi Code REST API usage payload (/coding/v1/usages)
 * into normalized UsageLimit objects.
 */
export function parseKimiRestUsage(raw: unknown, now: Date = new Date()): KimiUsageParsed {
  if (!raw || typeof raw !== "object") {
    throw new ProviderParseError("kimi", "Invalid Kimi REST usage response: expected object");
  }

  const data = raw as {
    usage?: {
      limit?: string | number;
      used?: string | number;
      remaining?: string | number;
      resetTime?: string;
    };
    limits?: Array<{
      window?: {
        duration?: number;
        timeUnit?: string;
      };
      detail?: {
        limit?: string | number;
        used?: string | number;
        remaining?: string | number;
        resetTime?: string;
      };
    }>;
    booster_wallet?: {
      status?: string;
      monthlyChargeLimit?: {
        currency?: string;
        priceInCents?: string | number;
      };
      monthlyUsed?: {
        currency?: string;
        priceInCents?: string | number;
      };
    };
  };

  const limits: UsageLimit[] = [];

  // 1. Weekly Limit
  if (data.usage) {
    const limitNum = Number(data.usage.limit) || 100;
    const usedNum = Number(data.usage.used) || 0;
    const usedPercent = Math.max(0, Math.min(100, Math.round((usedNum / limitNum) * 100)));
    const remainingPercent = Math.max(0, 100 - usedPercent);
    const resetsAt = data.usage.resetTime;
    let countdown: number | undefined;
    if (resetsAt) {
      countdown = Math.max(0, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / 1000));
    }

    limits.push({
      id: "weekly",
      name: "Weekly quota",
      category: "weekly",
      window_minutes: 10080,
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  // 2. Rolling Limits (e.g., 5-hour limit)
  if (Array.isArray(data.limits)) {
    for (const item of data.limits) {
      const duration = item.window?.duration ?? 300;
      const detail = item.detail;
      if (!detail) continue;

      const limitNum = Number(detail.limit) || 100;
      const usedNum = Number(detail.used) || 0;
      const usedPercent = Math.max(0, Math.min(100, Math.round((usedNum / limitNum) * 100)));
      const remainingPercent = Math.max(0, 100 - usedPercent);
      const resetsAt = detail.resetTime;
      let countdown: number | undefined;
      if (resetsAt) {
        countdown = Math.max(0, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / 1000));
      }

      if (duration === 300) {
        limits.push({
          id: "5h",
          name: "5-hour rolling limit",
          category: "rolling_window",
          window_minutes: 300,
          used_percent: usedPercent,
          remaining_percent: remainingPercent,
          ...(resetsAt ? { resets_at: resetsAt } : {}),
          ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
        });
      } else {
        limits.push({
          id: `window_${duration}m`,
          name: `${Math.round(duration / 60)}-hour limit`,
          category: "rolling_window",
          window_minutes: duration,
          used_percent: usedPercent,
          remaining_percent: remainingPercent,
          ...(resetsAt ? { resets_at: resetsAt } : {}),
          ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
        });
      }
    }
  }

  // 3. Extra Usage (Booster wallet)
  if (data.booster_wallet && data.booster_wallet.status !== "STATUS_DISABLED") {
    const limitCents = Number(data.booster_wallet.monthlyChargeLimit?.priceInCents ?? 0);
    const usedCents = Number(data.booster_wallet.monthlyUsed?.priceInCents ?? 0);
    if (limitCents > 0) {
      const usedAmount = usedCents / 100;
      const limitAmount = limitCents / 100;
      const remainingAmount = Math.max(0, limitAmount - usedAmount);
      const usedPercent = Math.max(0, Math.min(100, Math.round((usedCents / limitCents) * 100)));
      limits.push({
        id: "booster_wallet",
        name: "Monthly Extra Usage",
        category: "credit",
        used_amount: usedAmount,
        limit_amount: limitAmount,
        remaining_amount: remainingAmount,
        amount_unit:
          data.booster_wallet.monthlyChargeLimit?.currency?.toUpperCase() === "USD"
            ? "USD"
            : "credits",
        used_percent: usedPercent,
        remaining_percent: Math.max(0, 100 - usedPercent),
      });
    }
  }

  if (limits.length === 0) {
    throw new ProviderParseError(
      "kimi",
      "Unable to parse Kimi REST usage: no recognized limit windows found",
    );
  }

  return { limits };
}
