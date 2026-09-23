import {
  type DoctorReport,
  DoctorService,
  doctorReportSchema,
} from "../../core/application/index.js";
import type { CliContext } from "../context.js";
import { formatJsonGeneric } from "../formatters/json.js";

export interface DoctorCommandOptions {
  json?: boolean;
  demo?: boolean;
  noColor?: boolean;
}

function formatDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push("AI Limits Diagnostic Doctor");
  lines.push("-".repeat(70));
  lines.push(
    `${report.node.compatible ? "✓" : "✗"} Node.js ${report.node.version} (requires >= ${report.node.requiredMajor}.0.0)`,
  );
  lines.push(
    `${report.database.accessible ? "✓" : "✗"} SQLite Database: ${report.database.accessible ? "accessible" : "inaccessible"} (${report.database.migrationsApplied} migrations applied)`,
  );
  lines.push(`• Database path: ${report.database.path}`);
  lines.push(
    `• Environment: ${report.environment.runtime} (${report.environment.os}/${report.environment.arch})`,
  );
  if (report.environment.wsl.detected) {
    lines.push(
      `• WSL: detected${report.environment.wsl.distro ? ` (${report.environment.wsl.distro})` : ""}`,
    );
  }
  for (const note of report.environment.notes) {
    lines.push(`• ${note}`);
  }
  lines.push(`• Demo Mode: ${report.demoMode ? "enabled" : "disabled"}`);
  lines.push("-".repeat(70));
  lines.push("Providers");
  for (const provider of report.providers) {
    const mark = provider.installed ? "✓" : "✗";
    const version = provider.version ? ` v${provider.version}` : "";
    lines.push(
      `${mark} ${provider.display_name} (${provider.executable_name})${version} — installed=${provider.installed} auth=${provider.auth_state} usage=${provider.usage_capability} source=${provider.source}`,
    );
    if (provider.executable_path) {
      lines.push(`    PATH: ${provider.executable_path}`);
    } else {
      lines.push(`    PATH: not found`);
    }
    if (provider.reason) {
      lines.push(`    Reason: ${provider.reason}`);
    }
    for (const hint of provider.remediation) {
      lines.push(`    Hint: ${hint}`);
    }
  }
  if (!report.node.compatible) {
    lines.push(`Hint: Install Node.js ${report.node.requiredMajor} or later.`);
  }
  if (!report.database.accessible) {
    lines.push(
      "Hint: Check that the data directory is writable (default ~/.ai-limits). Do not dump environment variables when debugging.",
    );
  }
  lines.push("-".repeat(70));
  lines.push(report.healthy ? "Overall Status: HEALTHY" : "Overall Status: UNHEALTHY");
  lines.push("=".repeat(70));
  return `${lines.join("\n")}\n`;
}

/**
 * Handles `ai-limits doctor` execution.
 * Probes environment, storage, and provider detect/version/auth/capability only.
 */
export async function handleDoctorCommand(
  context: CliContext,
  options: DoctorCommandOptions,
): Promise<number> {
  try {
    const service = new DoctorService({
      registry: context.registry,
      dbManager: context.dbManager,
      isDemo: context.isDemo || Boolean(options.demo),
      ...(context.shutdownSignal ? { signal: context.shutdownSignal } : {}),
    });
    const report = doctorReportSchema.parse(await service.run());

    if (options.json) {
      process.stdout.write(formatJsonGeneric(report));
    } else {
      process.stdout.write(formatDoctorText(report));
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal error during doctor check: ${message}\n`);
    return 1;
  }
}
