import { type AggregateSnapshot, aggregateSnapshotSchema } from "../../core/domain/index.js";

/** Regex matching standard ANSI terminal escape sequences. */
const ANSI_REGEX =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip ANSI escape codes
  /\u001b\[[0-9;]*[a-zA-Z]/g;

/**
 * Formats an aggregate snapshot or data object as a single valid JSON document.
 * Guarantees zero ANSI escape sequences and exactly one document with trailing newline.
 */
export function formatJsonSnapshot(snapshot: AggregateSnapshot): string {
  // Validate schema first to guarantee contract fidelity
  aggregateSnapshotSchema.parse(snapshot);
  const serialized = JSON.stringify(snapshot, null, 2);
  const clean = serialized.replaceAll(ANSI_REGEX, "");
  return `${clean}\n`;
}

/**
 * Formats generic data (e.g. providers or doctor output) as JSON without ANSI codes.
 */
export function formatJsonGeneric(data: unknown): string {
  const serialized = JSON.stringify(data, null, 2);
  const clean = serialized.replaceAll(ANSI_REGEX, "");
  return `${clean}\n`;
}
