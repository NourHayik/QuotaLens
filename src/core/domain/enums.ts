import { z } from "zod";

/** Overall provider result status. See requirements section 14. */
export const providerStatusSchema = z.enum([
  "ok",
  "partial",
  "not_installed",
  "not_authenticated",
  "unsupported",
  "timeout",
  "parse_error",
  "unavailable",
]);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

/** Authentication state without exposing any secret material. */
export const authStateSchema = z.enum(["authenticated", "not_authenticated", "unknown"]);
export type AuthState = z.infer<typeof authStateSchema>;

/** Whether the connector can read live usage from a deterministic local source. */
export const usageCapabilitySchema = z.enum(["supported", "unsupported", "unknown"]);
export type UsageCapability = z.infer<typeof usageCapabilitySchema>;

/** How the usage data was acquired. */
export const acquisitionSourceSchema = z.enum([
  "app-server",
  "cli-json",
  "cli-text",
  "tui-pty",
  "local-api",
  "fixture",
  "none",
]);
export type AcquisitionSource = z.infer<typeof acquisitionSourceSchema>;

export const limitCategorySchema = z.enum([
  "rolling_window",
  "weekly",
  "monthly",
  "credit",
  "model_specific",
  "other",
]);
export type LimitCategory = z.infer<typeof limitCategorySchema>;

export const amountUnitSchema = z.enum([
  "USD",
  "credits",
  "requests",
  "tokens",
  "percent",
  "provider-unit",
]);
export type AmountUnit = z.infer<typeof amountUnitSchema>;
