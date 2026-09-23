import type { AggregateSnapshot } from "../../core/domain/index.js";
import type { CliContext } from "../context.js";
import { formatJsonSnapshot } from "../formatters/json.js";
import { formatStatusTable } from "../formatters/table.js";

export interface StatusCommandOptions {
  json?: boolean;
  fresh?: boolean;
  cached?: boolean;
  provider?: string;
  demo?: boolean;
  noColor?: boolean;
}

/**
 * Handles `ai-limits status` execution.
 * Returns process exit code (0 on valid snapshot produced, 1 on fatal/argument error).
 */
export async function handleStatusCommand(
  context: CliContext,
  options: StatusCommandOptions,
): Promise<number> {
  // Validate mutually exclusive flags
  if (options.fresh && options.cached) {
    process.stderr.write("Error: Options --fresh and --cached are mutually exclusive.\n");
    return 1;
  }

  // Validate provider filter if specified
  let providerIds: string[] | undefined;
  if (options.provider) {
    const requested = options.provider.trim();
    if (!context.registry.has(requested)) {
      process.stderr.write(
        `Error: Unknown provider "${requested}". Run 'ai-limits providers' to list registered providers.\n`,
      );
      return 1;
    }
    providerIds = [requested];
  }

  try {
    let snapshot: AggregateSnapshot;

    const filterOpts = {
      ...(providerIds ? { providerIds } : {}),
    };

    if (options.cached) {
      snapshot = context.refreshService.getCachedAggregateSnapshot(filterOpts);
    } else if (options.fresh) {
      snapshot = await context.refreshService.refreshAll({
        force: true,
        ...filterOpts,
        signal: context.shutdownSignal,
      });
    } else {
      snapshot = await context.refreshService.refreshAll({
        force: false,
        ...filterOpts,
        signal: context.shutdownSignal,
      });
    }

    if (options.json) {
      const output = formatJsonSnapshot(snapshot);
      process.stdout.write(output);
    } else {
      const tableOpts = options.noColor !== undefined ? { noColor: options.noColor } : undefined;
      const output = formatStatusTable(snapshot, tableOpts);
      process.stdout.write(`${output}\n`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal error during status retrieval: ${message}\n`);
    return 1;
  }
}
