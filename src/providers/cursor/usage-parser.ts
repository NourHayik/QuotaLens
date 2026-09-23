import { z } from "zod";
import {
  amountUnitSchema,
  limitCategorySchema,
  type UsageLimit,
  usageLimitSchema,
} from "../../core/domain/index.js";

export const cursorUsagePayloadSchema = z.object({
  plan: z.string().optional(),
  limits: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      category: limitCategorySchema.default("other"),
      windowMinutes: z.number().int().positive().optional(),
      used: z.number().min(0).optional(),
      limit: z.number().min(0).optional(),
      usedPercent: z.number().min(0).max(100).optional(),
      remainingPercent: z.number().min(0).max(100).optional(),
      usedAmount: z.number().min(0).optional(),
      limitAmount: z.number().min(0).optional(),
      remainingAmount: z.number().min(0).optional(),
      unit: amountUnitSchema.optional(),
      resetsAt: z.string().datetime({ offset: true }).optional(),
      modelId: z.string().optional(),
    }),
  ),
});
export type CursorUsagePayload = z.infer<typeof cursorUsagePayloadSchema>;

export interface ParsedCursorUsage {
  planLabel?: string | undefined;
  limits: UsageLimit[];
}

/**
 * Parses future structured Cursor usage JSON payload into normalized UsageLimits.
 */
export function parseCursorUsageJson(raw: string, now: Date = new Date()): ParsedCursorUsage {
  const json = JSON.parse(raw);
  const validated = cursorUsagePayloadSchema.parse(json);

  const limits: UsageLimit[] = validated.limits.map((item) => {
    let usedPercent = item.usedPercent;
    let remainingPercent = item.remainingPercent;

    if (
      usedPercent === undefined &&
      item.used !== undefined &&
      item.limit !== undefined &&
      item.limit > 0
    ) {
      usedPercent = Math.min(100, Math.max(0, Math.round((item.used / item.limit) * 100)));
      remainingPercent = Math.max(0, 100 - usedPercent);
    } else if (usedPercent !== undefined && remainingPercent === undefined) {
      remainingPercent = Math.max(0, 100 - usedPercent);
    }

    let resetCountdown: number | undefined;
    if (item.resetsAt) {
      const resetTime = new Date(item.resetsAt).getTime();
      resetCountdown = Math.max(0, Math.floor((resetTime - now.getTime()) / 1000));
    }

    const limitObj: UsageLimit = {
      id: item.id,
      category: item.category,
      ...(item.name ? { name: item.name } : {}),
      ...(item.windowMinutes ? { window_minutes: item.windowMinutes } : {}),
      ...(usedPercent !== undefined ? { used_percent: usedPercent } : {}),
      ...(remainingPercent !== undefined ? { remaining_percent: remainingPercent } : {}),
      ...(item.usedAmount !== undefined
        ? { used_amount: item.usedAmount }
        : item.used !== undefined
          ? { used_amount: item.used }
          : {}),
      ...(item.limitAmount !== undefined
        ? { limit_amount: item.limitAmount }
        : item.limit !== undefined
          ? { limit_amount: item.limit }
          : {}),
      ...(item.remainingAmount !== undefined ? { remaining_amount: item.remainingAmount } : {}),
      ...(item.unit ? { amount_unit: item.unit } : {}),
      ...(item.resetsAt ? { resets_at: item.resetsAt } : {}),
      ...(resetCountdown !== undefined ? { reset_countdown_seconds: resetCountdown } : {}),
      ...(item.modelId ? { model_id: item.modelId } : {}),
    };

    return usageLimitSchema.parse(limitObj);
  });

  return {
    planLabel: validated.plan,
    limits,
  };
}

export interface CursorRestPlanPayload {
  planInfo?: {
    planName?: string;
    includedAmountCents?: number;
    price?: string;
    billingCycleEnd?: string | number;
    planOwner?: string;
  };
}

export interface CursorPeriodUsagePayload {
  billingCycleStart?: string | number;
  billingCycleEnd?: string | number;
  planUsage?: {
    totalSpend?: number;
    includedSpend?: number;
    bonusSpend?: number;
    limit?: number;
    remainingBonus?: boolean;
    autoPercentUsed?: number;
    apiPercentUsed?: number;
    totalPercentUsed?: number;
  };
  spendLimitUsage?: {
    limitType?: string;
  };
  autoModelSelectedDisplayMessage?: string;
  namedModelSelectedDisplayMessage?: string;
}

export interface CursorSandUsagePayload {
  currentPeriodStart?: string;
  nextResetTimestampUtc?: string;
  usagePercent?: number;
  hasAvailableUsage?: boolean;
  hasNonZeroIncludedLimit?: boolean;
  grokPlanLabel?: string;
  cursorPlanName?: string;
}

export interface CursorRestWebUsagePayload {
  "gpt-4"?: {
    numRequests?: number;
    numRequestsTotal?: number;
    numTokens?: number;
    maxTokenUsage?: number | null;
    maxRequestUsage?: number | null;
  };
  startOfMonth?: string;
}

export interface CursorRestStripePayload {
  membershipType?: string;
  subscriptionStatus?: string;
}

function parseTimestampToMs(val: string | number | undefined): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "string" && !/^\d+$/.test(val.trim())) {
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }
  const n = Number(val);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return n > 1e11 ? n : n * 1000;
}

function parseTimestamp(
  val: string | number | undefined,
  now: Date,
): { resetsAt: string; countdown: number } | undefined {
  const ms = parseTimestampToMs(val);
  if (!ms) return undefined;
  return {
    resetsAt: new Date(ms).toISOString(),
    countdown: Math.max(0, Math.floor((ms - now.getTime()) / 1000)),
  };
}

/**
 * Parses real-time Cursor plan info, period usage, sand agent usage, and web dashboard usage into normalized UsageLimits.
 */
export function parseCursorRestUsage(
  planData?: CursorRestPlanPayload,
  webUsage?: CursorRestWebUsagePayload,
  stripeData?: CursorRestStripePayload,
  periodUsage?: CursorPeriodUsagePayload,
  sandUsage?: CursorSandUsagePayload,
  now: Date = new Date(),
): ParsedCursorUsage {
  const limits: UsageLimit[] = [];
  const planInfo = planData?.planInfo;
  const planName =
    planInfo?.planName ?? sandUsage?.cursorPlanName ?? stripeData?.membershipType ?? "Pro";

  // Resets at date calculation
  const cycleEnd = periodUsage?.billingCycleEnd ?? planInfo?.billingCycleEnd;
  const cycleStart = periodUsage?.billingCycleStart;

  let resetsAt: string | undefined;
  let countdown: number | undefined;

  if (cycleEnd) {
    const parsedEnd = parseTimestamp(cycleEnd, now);
    if (parsedEnd) {
      resetsAt = parsedEnd.resetsAt;
      countdown = parsedEnd.countdown;
    }
  }

  let windowMinutes = 43200; // 30-day default
  if (cycleStart && cycleEnd) {
    const startMs = parseTimestampToMs(cycleStart);
    const endMs = parseTimestampToMs(cycleEnd);
    if (startMs && endMs && endMs > startMs) {
      windowMinutes = Math.round((endMs - startMs) / 60000);
    }
  }

  // 1. Monthly Plan Allowance / Credits
  const planUsage = periodUsage?.planUsage;
  const includedCents =
    planUsage?.includedSpend ?? planUsage?.limit ?? planInfo?.includedAmountCents;

  if (includedCents !== undefined && includedCents > 0) {
    const limitAmount = includedCents / 100;
    const rawUsedPercent = planUsage?.totalPercentUsed;
    let usedPercent: number | undefined;
    let remainingPercent: number | undefined;
    let usedAmount: number | undefined;
    let remainingAmount: number | undefined;

    if (rawUsedPercent !== undefined) {
      usedPercent = Math.min(100, Math.max(0, Math.round(rawUsedPercent * 10) / 10));
      remainingPercent = Math.max(0, Math.round((100 - usedPercent) * 10) / 10);
      usedAmount = Math.round(((limitAmount * rawUsedPercent) / 100) * 100) / 100;
      remainingAmount = Math.max(0, Math.round((limitAmount - usedAmount) * 100) / 100);
    } else {
      usedAmount = 0;
      remainingAmount = limitAmount;
      usedPercent = 0;
      remainingPercent = 100;
    }

    limits.push({
      id: "plan_allowance",
      name: `${planName} Plan Allowance`,
      category: "monthly",
      window_minutes: windowMinutes,
      used_amount: usedAmount,
      limit_amount: limitAmount,
      remaining_amount: remainingAmount,
      amount_unit: "USD",
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  // 2. Auto Models Usage (Composer / Auto bucket)
  if (planUsage?.autoPercentUsed !== undefined) {
    const autoUsed = Math.min(100, Math.max(0, Math.round(planUsage.autoPercentUsed * 10) / 10));
    const autoRemaining = Math.max(0, Math.round((100 - autoUsed) * 10) / 10);
    limits.push({
      id: "auto_models",
      name: "Auto Models Usage",
      category: "monthly",
      window_minutes: windowMinutes,
      used_percent: autoUsed,
      remaining_percent: autoRemaining,
      amount_unit: "percent",
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  // 3. API / Named Models Usage
  if (planUsage?.apiPercentUsed !== undefined) {
    const apiUsed = Math.min(100, Math.max(0, Math.round(planUsage.apiPercentUsed * 10) / 10));
    const apiRemaining = Math.max(0, Math.round((100 - apiUsed) * 10) / 10);
    limits.push({
      id: "api_models",
      name: "API / Named Models Usage",
      category: "monthly",
      window_minutes: windowMinutes,
      used_percent: apiUsed,
      remaining_percent: apiRemaining,
      amount_unit: "percent",
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  // 4. Agent / Grok Bot Usage (weekly)
  if (sandUsage?.usagePercent !== undefined) {
    const sandUsed = Math.min(100, Math.max(0, Math.round(sandUsage.usagePercent * 10) / 10));
    const sandRemaining = Math.max(0, Math.round((100 - sandUsed) * 10) / 10);

    let sandResetsAt: string | undefined;
    let sandCountdown: number | undefined;
    if (sandUsage.nextResetTimestampUtc) {
      const parsed = parseTimestamp(sandUsage.nextResetTimestampUtc, now);
      if (parsed) {
        sandResetsAt = parsed.resetsAt;
        sandCountdown = parsed.countdown;
      }
    }

    let sandWindowMinutes = 10080; // 7-day default
    if (sandUsage.currentPeriodStart && sandUsage.nextResetTimestampUtc) {
      const startMs = parseTimestampToMs(sandUsage.currentPeriodStart);
      const endMs = parseTimestampToMs(sandUsage.nextResetTimestampUtc);
      if (startMs && endMs && endMs > startMs) {
        sandWindowMinutes = Math.round((endMs - startMs) / 60000);
      }
    }

    limits.push({
      id: "agent_usage",
      name: sandUsage.grokPlanLabel ?? "Agent Usage",
      category: "weekly",
      window_minutes: sandWindowMinutes,
      used_percent: sandUsed,
      remaining_percent: sandRemaining,
      amount_unit: "percent",
      ...(sandResetsAt ? { resets_at: sandResetsAt } : {}),
      ...(sandCountdown !== undefined ? { reset_countdown_seconds: sandCountdown } : {}),
    });
  }

  // 5. Fast Requests / Legacy Requests limit
  if (webUsage?.["gpt-4"]) {
    const gpt4 = webUsage["gpt-4"];
    const usedRequests = gpt4.numRequestsTotal ?? gpt4.numRequests ?? 0;
    const maxRequests =
      gpt4.maxRequestUsage ??
      (planName.toLowerCase() === "ultra"
        ? 2000
        : planName.toLowerCase() === "pro"
          ? 500
          : undefined);

    let usedPercent: number | undefined;
    let remainingPercent: number | undefined;
    if (maxRequests && maxRequests > 0) {
      usedPercent = Math.min(100, Math.max(0, Math.round((usedRequests / maxRequests) * 100)));
      remainingPercent = Math.max(0, 100 - usedPercent);
    }

    limits.push({
      id: "fast_requests",
      name: "Fast Requests",
      category: "monthly",
      window_minutes: windowMinutes,
      used_amount: usedRequests,
      ...(maxRequests !== undefined ? { limit_amount: maxRequests } : {}),
      ...(maxRequests !== undefined
        ? { remaining_amount: Math.max(0, maxRequests - usedRequests) }
        : {}),
      amount_unit: "requests",
      ...(usedPercent !== undefined ? { used_percent: usedPercent } : {}),
      ...(remainingPercent !== undefined ? { remaining_percent: remainingPercent } : {}),
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  return {
    planLabel: planName,
    limits,
  };
}
