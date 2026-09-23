import type { AcquisitionSource, AuthState, UsageCapability, UsageLimit } from "../domain/index.js";

/**
 * Provider adapter contract. Adding a provider means implementing this
 * interface plus tests — no dashboard or CLI changes. See requirements
 * section 22.
 */
export interface ProviderAdapter {
  /** Stable provider ID, e.g. "codex". */
  readonly id: string;
  readonly displayName: string;

  /** Whether the provider CLI/executable is installed locally. */
  detect(signal?: AbortSignal): Promise<boolean>;
  /** Installed CLI version, or null when not detectable. */
  getVersion(signal?: AbortSignal): Promise<string | null>;
  /** Non-secret authentication state. */
  getAuthState(signal?: AbortSignal): Promise<AuthState>;
  /** Usage acquisition capability and the source it would use. */
  getCapabilities(signal?: AbortSignal): Promise<ProviderCapabilities>;
  /** Raw normalized limits from the provider's deterministic local source. */
  fetchUsage(signal?: AbortSignal): Promise<UsageLimit[]>;
  /** Privacy-safe plan/account label when available (e.g. "Team", "Pro"). */
  getPlanLabel?(signal?: AbortSignal): Promise<string | null>;
}

export interface ProviderCapabilities {
  usage: UsageCapability;
  source: AcquisitionSource;
  /** Non-secret reason when usage is unsupported/unknown. */
  reason?: string;
}

export interface SnapshotOptions {
  /** Per-provider acquisition timeout in milliseconds. */
  timeoutMs: number;
  signal?: AbortSignal;
  /** Fixed timestamp override for deterministic testing. */
  now?: Date;
}
