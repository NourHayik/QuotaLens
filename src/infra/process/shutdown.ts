import { redactSecrets } from "../logging/redact.js";
import { processRegistry } from "./process-registry.js";

/**
 * Best-effort child cleanup on fatal process errors. Installed only from the
 * CLI entrypoint, never from unit tests.
 */
export function installFatalProcessCleanup(): void {
  const onFatal = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    try {
      process.stderr.write(`Fatal error: ${redactSecrets(message)}\n`);
    } catch {
      // Ignore stderr failures during shutdown.
    }
    void processRegistry.killAll().finally(() => {
      process.exit(1);
    });
  };

  process.on("uncaughtException", onFatal);
  process.on("unhandledRejection", onFatal);
}
