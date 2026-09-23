import type { CliContext } from "../context.js";
import { formatJsonGeneric } from "../formatters/json.js";
import { formatProvidersTable, type ProviderListItem } from "../formatters/table.js";

export interface ProvidersCommandOptions {
  json?: boolean;
  demo?: boolean;
  noColor?: boolean;
}

/**
 * Handles `ai-limits providers` execution.
 * Lists all registered providers and their configured limits/settings.
 */
export async function handleProvidersCommand(
  context: CliContext,
  options: ProvidersCommandOptions,
): Promise<number> {
  try {
    const adapters = context.registry.getAll();
    const settings = context.settingsRepo.getSettings();

    const items: ProviderListItem[] = adapters.map((adapter) => {
      const config = context.settingsRepo.getProviderConfig(adapter.id);
      const capability = context.capabilityRepo.getCapability(adapter.id);

      return {
        id: adapter.id,
        displayName: config?.display_name_override ?? adapter.displayName,
        enabled: config?.enabled ?? true,
        timeoutMs: config?.timeout_ms_override ?? settings.default_timeout_ms,
        cooldownSeconds: config?.cooldown_seconds ?? 0,
        source: capability?.source ?? "unknown",
      };
    });

    if (options.json) {
      const output = formatJsonGeneric(items);
      process.stdout.write(output);
    } else {
      const tableOpts = options.noColor !== undefined ? { noColor: options.noColor } : undefined;
      const output = formatProvidersTable(items, tableOpts);
      process.stdout.write(`${output}\n`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal error during providers listing: ${message}\n`);
    return 1;
  }
}
