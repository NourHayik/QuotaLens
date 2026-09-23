import { ProviderParseError, type UsageLimit } from "../../core/domain/index.js";
import { cleanTerminalOutput } from "../../infra/process/ansi.js";
import type { AntigravityUsageParsed } from "./types.js";

/**
 * Parses duration strings like "166h 41m", "3h 41m", "1d 2h", "15m" into seconds.
 */
export function parseAntigravityDurationToSeconds(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.trim().toLowerCase();
  if (cleaned.includes("available")) return undefined;

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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
}

function formatGroupDisplayName(groupTitle: string): string {
  return groupTitle
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => {
      if (word === "gpt") return "GPT";
      if (word === "oss") return "OSS";
      if (word === "ai") return "AI";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Deterministically parses Antigravity `/usage` text into normalized UsageLimit objects.
 * Preserves distinct model groups and model IDs without collapsing them.
 */
export function parseAntigravityUsageText(
  rawText: string,
  now: Date = new Date(),
): AntigravityUsageParsed {
  const cleaned = cleanTerminalOutput(rawText);

  if (
    !cleaned.includes("Models & Quota") &&
    !cleaned.includes("Models within this group") &&
    (cleaned.includes("You are currently not signed in") || cleaned.includes("Select login method"))
  ) {
    throw new ProviderParseError("antigravity", "Antigravity CLI is not authenticated");
  }

  const limits: UsageLimit[] = [];

  // Extract Plan Label or Account if visible
  let planLabel: string | undefined;
  const planMatch = cleaned.match(/(?:Google AI Pro|Google AI Ultra|Google AI Studio|Google AI)/i);
  if (planMatch?.[0]) {
    planLabel = planMatch[0];
  } else {
    const accountMatch = cleaned.match(/Account:\s*([^\s\n│]+)/i);
    if (accountMatch?.[1]) {
      planLabel = "Google Account";
    }
  }

  // Regex to match each model group block
  // Heading followed by "Models within this group: ..."
  const groupRegex = /([A-Z0-9][A-Z0-9\s&/-]+MODELS?)\n\s*Models within this group:\s*([^\n\r]+)/g;

  const matches = [...cleaned.matchAll(groupRegex)];
  if (matches.length === 0) {
    throw new ProviderParseError(
      "antigravity",
      "Unable to parse Antigravity /usage output: no model quota groups found",
    );
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match?.[1] || !match?.[2]) continue;

    const groupTitle = match[1].trim();
    const modelsRaw = match[2].trim();
    const groupSlug = slugify(groupTitle);
    const groupDisplayName = formatGroupDisplayName(groupTitle);

    // Format model_id as slugified comma-separated list
    const modelId = modelsRaw
      .split(/,\s*/)
      .map((m) => m.toLowerCase().replace(/[^\w-]/g, "-"))
      .join(",");

    // Slice block of text belonging to this group
    const startIndex = match.index ?? 0;
    const nextMatch = i + 1 < matches.length ? matches[i + 1] : undefined;
    const nextIndex = nextMatch?.index ?? cleaned.length;
    const groupBlock = cleaned.slice(startIndex, nextIndex);

    const weeklyIndex = groupBlock.indexOf("Weekly Limit Remaining");
    const fiveHourIndex = groupBlock.indexOf("Five Hour Limit Remaining");

    // 1. Weekly Limit Remaining
    if (weeklyIndex !== -1) {
      const weeklyEnd =
        fiveHourIndex !== -1 && fiveHourIndex > weeklyIndex ? fiveHourIndex : groupBlock.length;
      const weeklySection = groupBlock.slice(weeklyIndex, weeklyEnd);

      const pctMatch = weeklySection.match(/([\d.]+)%/);
      if (pctMatch?.[1]) {
        const remainingPercent = Math.max(0, Math.min(100, Number.parseFloat(pctMatch[1])));
        const usedPercent = Math.max(
          0,
          Math.min(100, Math.round((100 - remainingPercent) * 100) / 100),
        );

        const refreshMatch = weeklySection.match(/Refreshes in\s*([^\n\r│]+)/i);
        const countdown = refreshMatch?.[1]
          ? parseAntigravityDurationToSeconds(refreshMatch[1])
          : undefined;
        let resetsAtIso: string | undefined;
        if (countdown !== undefined) {
          resetsAtIso = new Date(now.getTime() + countdown * 1000).toISOString();
        }

        limits.push({
          id: `${groupSlug}:weekly`,
          name: `${groupDisplayName} (Weekly)`,
          category: "weekly",
          window_minutes: 10080,
          used_percent: usedPercent,
          remaining_percent: remainingPercent,
          ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
          ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
          model_id: modelId,
        });
      }
    }

    // 2. Five Hour Limit Remaining
    if (fiveHourIndex !== -1) {
      const fiveHourSection = groupBlock.slice(fiveHourIndex);

      const pctMatch = fiveHourSection.match(/([\d.]+)%/);
      if (pctMatch?.[1]) {
        const remainingPercent = Math.max(0, Math.min(100, Number.parseFloat(pctMatch[1])));
        const usedPercent = Math.max(
          0,
          Math.min(100, Math.round((100 - remainingPercent) * 100) / 100),
        );

        const refreshMatch = fiveHourSection.match(/Refreshes in\s*([^\n\r│]+)/i);
        const countdown = refreshMatch?.[1]
          ? parseAntigravityDurationToSeconds(refreshMatch[1])
          : undefined;
        let resetsAtIso: string | undefined;
        if (countdown !== undefined) {
          resetsAtIso = new Date(now.getTime() + countdown * 1000).toISOString();
        }

        limits.push({
          id: `${groupSlug}:5h`,
          name: `${groupDisplayName} (5-hour)`,
          category: "rolling_window",
          window_minutes: 300,
          used_percent: usedPercent,
          remaining_percent: remainingPercent,
          ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
          ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
          model_id: modelId,
        });
      }
    }
  }

  if (limits.length === 0) {
    throw new ProviderParseError(
      "antigravity",
      "Unable to parse Antigravity /usage output: no quota limits found within model groups",
    );
  }

  return { limits, planLabel };
}
