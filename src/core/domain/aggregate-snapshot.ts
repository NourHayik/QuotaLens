import { z } from "zod";
import { providerSnapshotSchema } from "./provider-snapshot.js";

/** Stable public JSON contract version. Breaking changes require a bump. */
export const SCHEMA_VERSION = "1.0" as const;

/**
 * Top-level document returned by `ai-limits status --json` and the local API.
 * See requirements section 10 and research section 6.
 */
export const aggregateSnapshotSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  generated_at: z.string().datetime({ offset: true }),
  /** True when providers were invoked for this snapshot; false for cached reads. */
  fresh: z.boolean(),
  providers: z.array(providerSnapshotSchema),
});
export type AggregateSnapshot = z.infer<typeof aggregateSnapshotSchema>;

export function parseAggregateSnapshot(value: unknown): AggregateSnapshot {
  return aggregateSnapshotSchema.parse(value);
}
