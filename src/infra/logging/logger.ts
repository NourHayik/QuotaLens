import { redactSecrets, redactValue } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to "info". */
  level?: LogLevel;
  /** Correlation ID included on every line (e.g. a refresh run ID). */
  correlationId?: string;
  /** Sink for JSON lines. Defaults to stderr; diagnostics never go to stdout. */
  write?: (line: string) => void;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured logger emitting one redacted JSON line per record to stderr.
 * Never pass environment objects, auth files, or raw provider output here.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = LEVEL_ORDER[options.level ?? "info"];
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));
  const baseContext: LogContext = options.correlationId
    ? { correlation_id: options.correlationId }
    : {};

  const emit = (level: LogLevel, message: string, context: LogContext | undefined) => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      msg: redactSecrets(message),
      ...baseContext,
      ...(context ? (redactValue(context) as LogContext) : {}),
    };
    write(JSON.stringify(record));
  };

  const logger: Logger = {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context),
    child: (context) => wrapWithContext(logger, context),
  };
  return logger;
}

function wrapWithContext(inner: Logger, staticContext: LogContext): Logger {
  const merge = (context?: LogContext) => ({ ...staticContext, ...context });
  return {
    debug: (message, context) => inner.debug(message, merge(context)),
    info: (message, context) => inner.info(message, merge(context)),
    warn: (message, context) => inner.warn(message, merge(context)),
    error: (message, context) => inner.error(message, merge(context)),
    child: (context) => wrapWithContext(inner, { ...staticContext, ...context }),
  };
}
