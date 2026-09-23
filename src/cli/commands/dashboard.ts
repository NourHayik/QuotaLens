import { spawn } from "node:child_process";
import { processRegistry } from "../../infra/process/process-registry.js";
import { startServer } from "../../server/index.js";
import { type CliContext, createCliContext } from "../context.js";

export interface DashboardCommandOptions {
  port?: number;
  open?: boolean;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "linux") {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "win32") {
      spawn("cmd.exe", ["/c", "start", url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Best-effort browser launch; ignore if desktop launcher fails
  }
}

/**
 * Handles `ai-limits dashboard` execution.
 * Launches loopback-only Fastify server, serves static React UI, and opens browser.
 */
export async function handleDashboardCommand(
  contextOrOptions?: CliContext | DashboardCommandOptions,
  maybeOptions?: DashboardCommandOptions,
): Promise<number> {
  const ctx: CliContext =
    contextOrOptions && "refreshService" in contextOrOptions
      ? contextOrOptions
      : createCliContext();

  const options: DashboardCommandOptions =
    contextOrOptions && !("refreshService" in contextOrOptions)
      ? contextOrOptions
      : (maybeOptions ?? {});

  const port = options.port ?? 3000;
  const shouldOpen = options.open !== false;

  try {
    const running = await startServer(ctx, {
      host: "127.0.0.1",
      port,
    });

    const banner = [
      "============================================================",
      `  QuotaLens: AI Limits Dashboard is running at:`,
      `  ${running.url}`,
      "  Bound strictly to loopback (127.0.0.1).",
      "  Press Ctrl+C to stop.",
      "============================================================",
    ].join("\n");

    process.stdout.write(`${banner}\n`);

    if (shouldOpen) {
      openBrowser(running.url);
    }

    // Keep server running until shutdown signal
    await new Promise<void>((resolve) => {
      const onSignal = async () => {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        process.stdout.write("\nShutting down AI Limits Dashboard (QuotaLens)...\n");
        if (!ctx.shutdownController.signal.aborted) {
          ctx.shutdownController.abort();
        }
        await processRegistry.killAll();
        await running.close();
        resolve();
      };

      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
    });

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to start dashboard server: ${message}\n`);
    return 1;
  }
}
