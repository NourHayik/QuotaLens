import type { LimitCategory, UsageLimit } from "../../core/domain/index.js";
import type { CodexRateLimitsResult, CodexRateLimitWindow } from "./types.js";

function formatPlanLabel(planType: string | null | undefined): string | undefined {
  if (!planType || typeof planType !== "string") return undefined;
  const cleaned = planType.trim();
  if (cleaned.length === 0 || cleaned.toLowerCase() === "unknown") return undefined;

  return cleaned
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function mapWindow(
  window: CodexRateLimitWindow,
  id: string,
  defaultName: string,
  defaultCategory: LimitCategory,
  now: Date,
  modelId?: string,
): UsageLimit {
  const duration = window.windowDurationMins ?? undefined;
  let category: LimitCategory = defaultCategory;

  if (duration !== undefined) {
    if (duration === 10080) {
      category = "weekly";
    } else if (duration >= 40000 && duration <= 44640) {
      category = "monthly";
    } else if (duration <= 1440) {
      category = "rolling_window";
    }
  }

  const usedPercent = Math.max(0, Math.min(100, Math.round(window.usedPercent)));
  const remainingPercent = Math.max(0, Math.min(100, 100 - usedPercent));

  let resetsAtIso: string | undefined;
  let countdownSeconds: number | undefined;

  if (
    typeof window.resetsAt === "number" &&
    !Number.isNaN(window.resetsAt) &&
    window.resetsAt > 0
  ) {
    const ms = window.resetsAt > 1e11 ? window.resetsAt : window.resetsAt * 1000;
    const resetDate = new Date(ms);
    if (!Number.isNaN(resetDate.getTime())) {
      resetsAtIso = resetDate.toISOString();
      countdownSeconds = Math.max(0, Math.floor((resetDate.getTime() - now.getTime()) / 1000));
    }
  }

  return {
    id,
    name: defaultName,
    category,
    ...(duration !== undefined ? { window_minutes: duration } : {}),
    used_percent: usedPercent,
    remaining_percent: remainingPercent,
    ...(resetsAtIso ? { resets_at: resetsAtIso } : {}),
    ...(countdownSeconds !== undefined ? { reset_countdown_seconds: countdownSeconds } : {}),
    ...(modelId ? { model_id: modelId } : {}),
  };
}

export interface MapCodexResult {
  limits: UsageLimit[];
  planLabel?: string | undefined;
}

/**
 * Normalizes OpenAI Codex `account/rateLimits/read` response.
 *
 * Guarantees:
 * - If primary or secondary window is absent/null, it remains absent (never fabricated).
 * - Multi-bucket limits in `rateLimitsByLimitId` remain distinct.
 * - Reset timestamps are converted from Unix seconds to ISO 8601 UTC.
 * - Countdowns are derived relative to `now`.
 * - Available reset credits are represented as credit limits.
 */
export function mapCodexRateLimits(
  data: CodexRateLimitsResult,
  now: Date = new Date(),
): MapCodexResult {
  const limits: UsageLimit[] = [];
  const planLabel = formatPlanLabel(data.rateLimits?.planType);

  // 1. Primary window (typically 5-hour rolling window)
  if (data.rateLimits?.primary) {
    const duration = data.rateLimits.primary.windowDurationMins;
    const name =
      duration === 300
        ? "5-hour rolling window"
        : duration
          ? `${duration / 60}h window`
          : "Primary window";

    limits.push(
      mapWindow(
        data.rateLimits.primary,
        "primary",
        name,
        "rolling_window",
        now,
        data.rateLimits.normalModelSlug ?? undefined,
      ),
    );
  }

  // 2. Secondary window (typically weekly quota)
  if (data.rateLimits?.secondary) {
    const duration = data.rateLimits.secondary.windowDurationMins;
    const name = duration === 10080 ? "Weekly quota" : "Secondary window";

    limits.push(
      mapWindow(
        data.rateLimits.secondary,
        "weekly",
        name,
        "weekly",
        now,
        data.rateLimits.normalModelSlug ?? undefined,
      ),
    );
  }

  // 3. Multi-bucket entries in rateLimitsByLimitId
  if (data.rateLimitsByLimitId && typeof data.rateLimitsByLimitId === "object") {
    const primaryLimitId = data.rateLimits?.limitId ?? "codex";

    for (const [limitKey, bucket] of Object.entries(data.rateLimitsByLimitId)) {
      if (!bucket || typeof bucket !== "object") continue;
      // Skip the default bucket if it's identical to the already mapped rateLimits
      if (limitKey === primaryLimitId && limits.length > 0) continue;

      const baseName = bucket.limitName ?? limitKey;

      if (bucket.primary) {
        limits.push(
          mapWindow(
            bucket.primary,
            `${limitKey}:primary`,
            `${baseName} (5h)`,
            "rolling_window",
            now,
            bucket.normalModelSlug ?? undefined,
          ),
        );
      }

      if (bucket.secondary) {
        limits.push(
          mapWindow(
            bucket.secondary,
            `${limitKey}:weekly`,
            `${baseName} (weekly)`,
            "weekly",
            now,
            bucket.normalModelSlug ?? undefined,
          ),
        );
      }
    }
  }

  // 4. Rate limit reset credits
  if (
    data.rateLimitResetCredits &&
    typeof data.rateLimitResetCredits.availableCount === "number" &&
    data.rateLimitResetCredits.availableCount > 0
  ) {
    limits.push({
      id: "reset_credits",
      name: "Rate limit reset credits",
      category: "credit",
      remaining_amount: data.rateLimitResetCredits.availableCount,
      amount_unit: "credits",
    });
  }

  // 5. Account credit balance if available
  if (data.rateLimits?.credits?.hasCredits && data.rateLimits.credits.balance) {
    const balanceStr = data.rateLimits.credits.balance.trim();
    const isUsd = balanceStr.startsWith("$");
    const num = Number.parseFloat(balanceStr.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(num)) {
      limits.push({
        id: "credit_balance",
        name: "Credit balance",
        category: "credit",
        remaining_amount: num,
        amount_unit: isUsd ? "USD" : "credits",
      });
    }
  }

  return { limits, planLabel };
}
