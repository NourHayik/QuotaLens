export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
  emittedAtMs?: number;
}

export interface CodexRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  /** Unix timestamp in seconds (or milliseconds if > 1e11). */
  resetsAt: number | null;
}

export interface CodexCreditsSnapshot {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
}

export interface CodexRateLimitResetCredit {
  id: string;
  resetType: string;
  status: string;
  grantedAt: number | null;
  expiresAt: number | null;
  title: string;
  description: string;
}

export interface CodexRateLimitResetCreditsSummary {
  availableCount: number;
  credits?: CodexRateLimitResetCredit[];
}

export interface CodexRateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  normalModelSlug: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  credits: CodexCreditsSnapshot | null;
  individualLimit?: unknown;
  spendControlReached: boolean | null;
  planType: string | null;
  rateLimitReachedType: string | null;
}

export interface CodexRateLimitsResult {
  ordinaryUsageAllowed: boolean | null;
  rateLimits: CodexRateLimitSnapshot;
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> | null;
  rateLimitResetCredits: CodexRateLimitResetCreditsSummary | null;
  accountId: string | null;
  rateLimitUpsell?: unknown;
}

export interface CodexClientOptions {
  executable?: string | undefined;
  args?: readonly string[] | undefined;
  cwd?: string | undefined;
  env?: Readonly<Record<string, string>> | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface CodexAdapterOptions {
  executable?: string | undefined;
  timeoutMs?: number | undefined;
  clientFactory?: ((options: CodexClientOptions) => CodexAppServerClientLike) | undefined;
  statusFallbackRunner?: ((signal?: AbortSignal) => Promise<string>) | undefined;
  now?: (() => Date) | undefined;
}

export interface CodexAppServerClientLike {
  start(signal?: AbortSignal): Promise<void>;
  readRateLimits(signal?: AbortSignal): Promise<CodexRateLimitsResult>;
  close(): Promise<void>;
}
