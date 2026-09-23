import type { UsageLimit } from "../../core/domain/index.js";

export interface ParsedStatusResult {
  limits: UsageLimit[];
  planLabel?: string | undefined;
}

/**
 * Parses duration strings like "2h 18m", "4d 12h", "45m", "3h" into milliseconds.
 */
function parseDurationToMs(str: string): number | undefined {
  if (!str) return undefined;
  const days = str.match(/(\d+)\s*d/i);
  const hours = str.match(/(\d+)\s*h/i);
  const minutes = str.match(/(\d+)\s*m/i);
  const seconds = str.match(/(\d+)\s*s/i);

  let totalMs = 0;
  let matched = false;

  if (days?.[1]) {
    totalMs += Number.parseInt(days[1], 10) * 24 * 60 * 60 * 1000;
    matched = true;
  }
  if (hours?.[1]) {
    totalMs += Number.parseInt(hours[1], 10) * 60 * 60 * 1000;
    matched = true;
  }
  if (minutes?.[1]) {
    totalMs += Number.parseInt(minutes[1], 10) * 60 * 1000;
    matched = true;
  }
  if (seconds?.[1]) {
    totalMs += Number.parseInt(seconds[1], 10) * 1000;
    matched = true;
  }

  return matched ? totalMs : undefined;
}

/**
 * Deterministic regex-based parser for Codex `/status` output.
 * Used strictly as a fallback when `codex app-server --stdio` is unsupported.
 * NEVER invokes an AI model prompt.
 */
export function parseCodexStatusText(text: string, now: Date = new Date()): ParsedStatusResult {
  const limits: UsageLimit[] = [];
  if (!text || typeof text !== "string") {
    return { limits };
  }

  // 1. Detect plan label
  let planLabel: string | undefined;
  const planMatch = text.match(/(?:Account|Plan):\s*([a-zA-Z0-9_-]+)/i);
  if (planMatch?.[1]) {
    const raw = planMatch[1].trim();
    if (raw.toLowerCase() !== "unknown") {
      planLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }

  // 2. Detect 5-hour limit
  const fiveHourMatch = text.match(
    /(?:5-?hour|rolling)[^:\n]*:\s*(\d+)%?\s*(?:used)?(?:\s*\((?:resets in\s*)?([^)]+)\))?/i,
  );
  if (fiveHourMatch?.[1]) {
    const used = Math.max(0, Math.min(100, Number.parseInt(fiveHourMatch[1], 10)));
    const durationStr = fiveHourMatch[2];
    const durationMs = durationStr ? parseDurationToMs(durationStr) : undefined;

    let resetsAtIso: string | undefined;
    let countdownSeconds: number | undefined;
    if (durationMs !== undefined) {
      const resetDate = new Date(now.getTime() + durationMs);
      resetsAtIso = resetDate.toISOString();
      countdownSeconds = Math.max(0, Math.floor(durationMs / 1000));
    }

    limits.push({
      id: "primary",
      name: "5-hour rolling window",
      category: "rolling_window",
      window_minutes: 300,
      used_percent: used,
      remaining_percent: 100 - used,
      ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
      ...(countdownSeconds !== undefined ? { reset_countdown_seconds: countdownSeconds } : {}),
    });
  }

  // 3. Detect weekly limit
  const weeklyMatch = text.match(
    /(?:weekly|7-?day)[^:\n]*:\s*(\d+)%?\s*(?:used)?(?:\s*\((?:resets in\s*)?([^)]+)\))?/i,
  );
  if (weeklyMatch?.[1]) {
    const used = Math.max(0, Math.min(100, Number.parseInt(weeklyMatch[1], 10)));
    const durationStr = weeklyMatch[2];
    const durationMs = durationStr ? parseDurationToMs(durationStr) : undefined;

    let resetsAtIso: string | undefined;
    let countdownSeconds: number | undefined;
    if (durationMs !== undefined) {
      const resetDate = new Date(now.getTime() + durationMs);
      resetsAtIso = resetDate.toISOString();
      countdownSeconds = Math.max(0, Math.floor(durationMs / 1000));
    }

    limits.push({
      id: "weekly",
      name: "Weekly quota",
      category: "weekly",
      window_minutes: 10080,
      used_percent: used,
      remaining_percent: 100 - used,
      ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
      ...(countdownSeconds !== undefined ? { reset_countdown_seconds: countdownSeconds } : {}),
    });
  }

  // 4. Detect reset credits
  const creditsMatch = text.match(/(?:rate limit reset credits|reset credits)[^:\n]*:\s*(\d+)/i);
  if (creditsMatch?.[1]) {
    const count = Number.parseInt(creditsMatch[1], 10);
    if (count > 0) {
      limits.push({
        id: "reset_credits",
        name: "Rate limit reset credits",
        category: "credit",
        remaining_amount: count,
        amount_unit: "credits",
      });
    }
  }

  return { limits, planLabel };
}
