import type {
  AggregateSnapshot,
  AppSettings,
  AuthState,
  LimitCategory,
  ProviderConfig,
  ProviderError,
  ProviderSnapshot,
  ProviderStatus,
  UsageCapability,
  UsageLimit,
} from "../../core/domain/index.js";

export type {
  AggregateSnapshot,
  AppSettings,
  AuthState,
  LimitCategory,
  ProviderConfig,
  ProviderError,
  ProviderSnapshot,
  ProviderStatus,
  UsageCapability,
  UsageLimit,
};

export type HistoryRange = "24h" | "7d" | "30d";

export type SseConnectionStatus = "connected" | "connecting" | "offline";

export interface ProviderDetailResponse {
  id: string;
  displayName: string;
  config: ProviderConfig;
  capability: {
    installed: boolean;
    cli_version?: string;
    auth_state: AuthState;
    usage_capability: UsageCapability;
    source: string;
    reason?: string;
    probed_at: string;
  } | null;
  latestHealth: {
    status: ProviderStatus;
    error_code?: string;
    error_message?: string;
    duration_ms?: number;
    occurred_at: string;
  } | null;
  snapshot: ProviderSnapshot | null;
  lastGoodSnapshot: ProviderSnapshot | null;
}

export interface ProviderHistoryResponse {
  provider_id: string;
  range: HistoryRange;
  since: string;
  count: number;
  history: ProviderSnapshot[];
}
