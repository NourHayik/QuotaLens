import type { UsageLimit } from "../../core/domain/index.js";
import type { PtyFactory } from "../../infra/process/pty.js";

export interface KimiAdapterOptions {
  executable?: string;
  timeoutMs?: number;
  ptyFactory?: PtyFactory;
  ptyRunner?: (signal?: AbortSignal) => Promise<string>;
  now?: () => Date;
  credentialsPath?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface KimiUsageParsed {
  limits: UsageLimit[];
  planLabel?: string | undefined;
}
