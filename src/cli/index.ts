import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import { processRegistry } from "../infra/process/process-registry.js";
import { installFatalProcessCleanup } from "../infra/process/shutdown.js";
import { handleDashboardCommand } from "./commands/dashboard.js";
import { handleDoctorCommand } from "./commands/doctor.js";
import { handleProvidersCommand } from "./commands/providers.js";
import { handleStatusCommand } from "./commands/status.js";
import { type CliContext, createCliContext } from "./context.js";

export const CLI_PHASE = 3 as const;
export { installFatalProcessCleanup } from "../infra/process/shutdown.js";

export interface CliExecutionResult {
  exitCode: number;
}

export function createProgram(existingContext?: CliContext): {
  program: Command;
  getExitCode: () => number;
} {
  let exitCode = 0;
  const program = new Command();
  const binName = process.argv[1]?.includes("quotalens") ? "quotalens" : "ai-limits";

  program
    .name(binName)
    .description("QuotaLens: Local dashboard and CLI for AI coding subscription limits")
    .version("1.0.0")
    .option("--db <path>", "Override SQLite database path (default: ~/.ai-limits/ai-limits.db)")
    .option("--demo", "Enable deterministic demo fixtures for all priority providers")
    .option("--no-color", "Disable color formatting in table outputs")
    .exitOverride();

  // Helper to obtain context and execute action with proper cleanup
  const executeWithContext = async (
    cmdOpts: Record<string, unknown>,
    action: (ctx: CliContext) => Promise<number>,
  ): Promise<void> => {
    const isExternalContext = Boolean(existingContext);
    const ctx =
      existingContext ??
      createCliContext({
        ...(typeof cmdOpts.db === "string" ? { dbPath: cmdOpts.db } : {}),
        demo: Boolean(cmdOpts.demo),
      });

    try {
      const onSignal = () => {
        if (!ctx.shutdownController.signal.aborted) {
          ctx.shutdownController.abort();
        }
        void processRegistry.killAll();
      };
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
      try {
        exitCode = await action(ctx);
      } finally {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
      }
    } finally {
      if (!isExternalContext) {
        ctx.dispose();
      }
    }
  };

  // status command
  program
    .command("status")
    .description("Display current usage limits across AI providers")
    .option("-j, --json", "Output single machine-readable JSON document on stdout")
    .option("-f, --fresh", "Force fresh refresh bypassing cooldowns")
    .option("-c, --cached", "Return cached snapshot without executing providers")
    .option("-p, --provider <id>", "Filter status to a single provider ID")
    .action(async (_options, command) => {
      const opts = command.optsWithGlobals();
      await executeWithContext(opts, (ctx) =>
        handleStatusCommand(ctx, {
          json: Boolean(opts.json),
          fresh: Boolean(opts.fresh),
          cached: Boolean(opts.cached),
          provider: typeof opts.provider === "string" ? opts.provider : undefined,
          demo: Boolean(opts.demo),
          noColor: opts.color === false,
        }),
      );
    });

  // providers command
  program
    .command("providers")
    .description("List registered AI providers and their configuration")
    .option("-j, --json", "Output provider configurations as JSON on stdout")
    .action(async (_options, command) => {
      const opts = command.optsWithGlobals();
      await executeWithContext(opts, (ctx) =>
        handleProvidersCommand(ctx, {
          json: Boolean(opts.json),
          demo: Boolean(opts.demo),
          noColor: opts.color === false,
        }),
      );
    });

  // doctor command
  program
    .command("doctor")
    .description("Run environment, storage, and provider health diagnostics")
    .option("-j, --json", "Output diagnostic report as JSON on stdout")
    .action(async (_options, command) => {
      const opts = command.optsWithGlobals();
      await executeWithContext(opts, (ctx) =>
        handleDoctorCommand(ctx, {
          json: Boolean(opts.json),
          demo: Boolean(opts.demo),
          noColor: opts.color === false,
        }),
      );
    });

  // dashboard command
  program
    .command("dashboard")
    .description("Launch local API server and web dashboard")
    .option("-p, --port <number>", "Port to bind local server", "3000")
    .option("--no-open", "Do not open browser automatically")
    .action(async (_options, command) => {
      const opts = command.optsWithGlobals();
      await executeWithContext(opts, (ctx) =>
        handleDashboardCommand(ctx, {
          port: Number.parseInt(String(opts.port ?? 3000), 10),
          open: opts.open !== false,
        }),
      );
    });

  return { program, getExitCode: () => exitCode };
}

/**
 * Runs the CLI using the provided argument vector.
 */
export async function runCli(argv: string[] = process.argv, context?: CliContext): Promise<number> {
  installFatalProcessCleanup();
  const { program, getExitCode } = createProgram(context);

  try {
    // If no subcommand specified, show help and exit 0
    if (argv.length <= 2) {
      program.outputHelp();
      return 0;
    }

    await program.parseAsync(argv);
    return getExitCode();
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal error: ${msg}\n`);
    return 1;
  }
}

// Direct execution entrypoint
let isMain = false;
if (process.argv[1]) {
  try {
    const entryPath = resolve(process.argv[1]).toLowerCase();
    const modulePath = fileURLToPath(import.meta.url).toLowerCase();
    isMain =
      entryPath === modulePath ||
      entryPath.replace(/\\/g, "/") === modulePath.replace(/\\/g, "/");
  } catch {
    isMain = false;
  }
}

if (isMain) {
  installFatalProcessCleanup();
  runCli(process.argv).then((code) => {
    process.exit(code);
  });
}
