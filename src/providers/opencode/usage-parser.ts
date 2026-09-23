import { z } from "zod";
import {
  amountUnitSchema,
  limitCategorySchema,
  type UsageLimit,
  usageLimitSchema,
} from "../../core/domain/index.js";

export const opencodeUsagePayloadSchema = z.object({
  provider: z.string().optional(),
  plan: z.string().optional(),
  limits: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      category: limitCategorySchema.default("rolling_window"),
      windowMinutes: z.number().int().positive().optional(),
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
export type OpenCodeUsagePayload = z.infer<typeof opencodeUsagePayloadSchema>;

export interface ParsedOpenCodeUsage {
  planLabel?: string;
  limits: UsageLimit[];
}

/**
 * Parses future structured OpenCode Go usage JSON payload into normalized UsageLimits.
 */
export function parseOpenCodeUsageJson(raw: string, now: Date = new Date()): ParsedOpenCodeUsage {
  const json = JSON.parse(raw);
  const validated = opencodeUsagePayloadSchema.parse(json);

  const limits: UsageLimit[] = validated.limits.map((item) => {
    let usedPercent = item.usedPercent;
    let remainingPercent = item.remainingPercent;

    if (usedPercent !== undefined && remainingPercent === undefined) {
      remainingPercent = Math.max(0, 100 - usedPercent);
    } else if (usedPercent === undefined && remainingPercent !== undefined) {
      usedPercent = Math.max(0, 100 - remainingPercent);
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
      ...(item.usedAmount !== undefined ? { used_amount: item.usedAmount } : {}),
      ...(item.limitAmount !== undefined ? { limit_amount: item.limitAmount } : {}),
      ...(item.remainingAmount !== undefined ? { remaining_amount: item.remainingAmount } : {}),
      ...(item.unit ? { amount_unit: item.unit } : {}),
      ...(item.resetsAt ? { resets_at: item.resetsAt } : {}),
      ...(resetCountdown !== undefined ? { reset_countdown_seconds: resetCountdown } : {}),
      ...(item.modelId ? { model_id: item.modelId } : {}),
    };

    return usageLimitSchema.parse(limitObj);
  });

  return {
    planLabel: validated.plan ?? "OpenCode Go",
    limits,
  };
}

/**
 * Parses real-time OpenCode Go REST API usage payload (/zen/go/v1/usage)
 * into normalized UsageLimit objects.
 */
export function parseOpenCodeRestUsage(raw: unknown, now: Date = new Date()): ParsedOpenCodeUsage {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid OpenCode REST usage response: expected object");
  }
  const data = raw as {
    usage?: {
      rolling?: { status?: string; percent?: number; resetsAt?: string };
      weekly?: { status?: string; percent?: number; resetsAt?: string };
      monthly?: { status?: string; percent?: number; resetsAt?: string };
    };
  };

  const limits: UsageLimit[] = [];
  const u = data.usage;
  if (!u) {
    throw new Error("Invalid OpenCode REST usage response: missing usage object");
  }

  if (u.rolling && typeof u.rolling.percent === "number") {
    const used = Math.max(0, Math.min(100, Math.round(u.rolling.percent)));
    const resetsAt = u.rolling.resetsAt;
    const countdown = resetsAt
      ? Math.max(0, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / 1000))
      : undefined;
    limits.push({
      id: "rolling",
      name: "Rolling limit",
      category: "rolling_window",
      used_percent: used,
      remaining_percent: Math.max(0, 100 - used),
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  if (u.weekly && typeof u.weekly.percent === "number") {
    const used = Math.max(0, Math.min(100, Math.round(u.weekly.percent)));
    const resetsAt = u.weekly.resetsAt;
    const countdown = resetsAt
      ? Math.max(0, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / 1000))
      : undefined;
    limits.push({
      id: "weekly",
      name: "Weekly quota",
      category: "weekly",
      window_minutes: 10080,
      used_percent: used,
      remaining_percent: Math.max(0, 100 - used),
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  if (u.monthly && typeof u.monthly.percent === "number") {
    const used = Math.max(0, Math.min(100, Math.round(u.monthly.percent)));
    const resetsAt = u.monthly.resetsAt;
    const countdown = resetsAt
      ? Math.max(0, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / 1000))
      : undefined;
    limits.push({
      id: "monthly",
      name: "Monthly quota",
      category: "monthly",
      window_minutes: 43200,
      used_percent: used,
      remaining_percent: Math.max(0, 100 - used),
      ...(resetsAt ? { resets_at: resetsAt } : {}),
      ...(countdown !== undefined ? { reset_countdown_seconds: countdown } : {}),
    });
  }

  return {
    planLabel: "OpenCode Go",
    limits,
  };
}
