import type { UsageLimit } from "../../core/domain/index.js";
import type { PtyFactory } from "../../infra/process/pty.js";

export interface AntigravityAdapterOptions {
  executable?: string;
  timeoutMs?: number;
  ptyFactory?: PtyFactory;
  ptyRunner?: (signal?: AbortSignal) => Promise<string>;
  now?: () => Date;
}

export interface AntigravityUsageParsed {
  limits: UsageLimit[];
  planLabel?: string | undefined;
}
