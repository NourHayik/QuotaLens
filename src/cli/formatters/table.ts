import type { AggregateSnapshot, ProviderSnapshot, UsageLimit } from "../../core/domain/index.js";

export interface TableFormatOptions {
  noColor?: boolean;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return "n/a";
  if (seconds === 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  if (m > 0) {
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${s}s`;
}

function formatLimit(limit: UsageLimit): string {
  const parts: string[] = [];
  const label = limit.name ?? limit.id;
  parts.push(`  • ${label}:`);

  if (limit.used_percent !== undefined) {
    parts.push(`${limit.used_percent}% used`);
    if (limit.remaining_percent !== undefined) {
      parts.push(`(${limit.remaining_percent}% remaining)`);
    }
    if (
      limit.used_amount !== undefined &&
      limit.limit_amount !== undefined &&
      limit.amount_unit &&
      limit.amount_unit !== "percent"
    ) {
      const isUsd = limit.amount_unit === "USD";
      const prefix = isUsd ? "$" : "";
      const suffix = !isUsd ? ` ${limit.amount_unit}` : "";
      parts.push(`[${prefix}${limit.used_amount} / ${prefix}${limit.limit_amount}${suffix}]`);
    }
  } else if (limit.used_amount !== undefined && limit.limit_amount !== undefined) {
    parts.push(`${limit.used_amount}/${limit.limit_amount} ${limit.amount_unit ?? ""}`);
  } else if (limit.remaining_amount !== undefined) {
    parts.push(`${limit.remaining_amount} ${limit.amount_unit ?? ""} available`.trim());
  }

  if (limit.reset_countdown_seconds !== undefined) {
    parts.push(`— resets in ${formatDuration(limit.reset_countdown_seconds)}`);
  } else if (limit.resets_at) {
    parts.push(`— resets at ${limit.resets_at}`);
  }

  return parts.join(" ");
}

function formatProviderStatus(provider: ProviderSnapshot): string {
  const lines: string[] = [];
  const statusBadge = provider.stale
    ? `[${provider.status.toUpperCase()} / STALE]`
    : `[${provider.status.toUpperCase()}]`;

  const version = provider.cli_version ? ` (v${provider.cli_version})` : "";
  const plan = provider.plan_label ? ` [${provider.plan_label}]` : "";
  lines.push(`${provider.display_name}${version}${plan} ${statusBadge}`);

  if (provider.limits.length > 0) {
    for (const limit of provider.limits) {
      lines.push(formatLimit(limit));
    }
  } else if (provider.status === "ok") {
    lines.push("  • No active rate-limit windows reported");
  }

  if (provider.errors.length > 0) {
    for (const err of provider.errors) {
      lines.push(`  ! [${err.code}] ${err.message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats an aggregate snapshot into a clean, human-readable terminal table view.
 */
export function formatStatusTable(
  snapshot: AggregateSnapshot,
  _options?: TableFormatOptions,
): string {
  const lines: string[] = [];
  const freshness = snapshot.fresh ? "FRESH" : "CACHED";
  lines.push("=".repeat(70));
  lines.push(`AI Limits Dashboard — Status [${freshness}]`);
  lines.push(`Generated at: ${snapshot.generated_at}`);
  lines.push("-".repeat(70));

  if (snapshot.providers.length === 0) {
    lines.push("No providers registered or enabled.");
  } else {
    for (let i = 0; i < snapshot.providers.length; i++) {
      const p = snapshot.providers[i];
      if (p) {
        lines.push(formatProviderStatus(p));
        if (i < snapshot.providers.length - 1) {
          lines.push("");
        }
      }
    }
  }

  lines.push("=".repeat(70));
  return lines.join("\n");
}

export interface ProviderListItem {
  id: string;
  displayName: string;
  enabled: boolean;
  timeoutMs: number;
  cooldownSeconds: number;
  source: string;
}

/**
 * Formats provider list into a readable table.
 */
export function formatProvidersTable(
  providers: ProviderListItem[],
  _options?: TableFormatOptions,
): string {
  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push("Configured AI Limits Providers");
  lines.push("-".repeat(70));

  if (providers.length === 0) {
    lines.push("No providers registered.");
  } else {
    // Header
    lines.push(
      `${"PROVIDER ID".padEnd(16)} ${"DISPLAY NAME".padEnd(20)} ${"ENABLED".padEnd(10)} ${"TIMEOUT".padEnd(10)} ${"COOLDOWN".padEnd(10)}`,
    );
    lines.push("-".repeat(70));
    for (const p of providers) {
      const enabledStr = p.enabled ? "yes" : "no";
      const timeoutStr = `${p.timeoutMs}ms`;
      const cooldownStr = `${p.cooldownSeconds}s`;
      lines.push(
        `${p.id.padEnd(16)} ${p.displayName.padEnd(20)} ${enabledStr.padEnd(10)} ${timeoutStr.padEnd(10)} ${cooldownStr.padEnd(10)}`,
      );
    }
  }

  lines.push("=".repeat(70));
  return lines.join("\n");
}
