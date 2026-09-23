import { describe, expect, it } from "vitest";
import { formatJsonSnapshot } from "../src/cli/formatters/json.js";
import {
  aggregateSnapshotSchema,
  parseAggregateSnapshot,
  parseProviderSnapshot,
  providerSnapshotSchema,
  SCHEMA_VERSION,
  usageLimitSchema,
} from "../src/core/domain/index.js";

const validLimit = {
  id: "primary",
  name: "5-hour rolling window",
  category: "rolling_window",
  window_minutes: 300,
  used_percent: 42,
  remaining_percent: 58,
  resets_at: "2026-09-15T10:20:00+00:00",
  reset_countdown_seconds: 7200,
};

const validProvider = {
  id: "codex",
  display_name: "Codex",
  installed: true,
  auth_state: "authenticated",
  usage_capability: "supported",
  status: "ok",
  source: "app-server",
  cli_version: "1.2.3",
  fetch_started_at: "2026-09-15T07:55:00+00:00",
  fetched_at: "2026-09-15T07:55:02+00:00",
  stale: false,
  limits: [validLimit],
  errors: [],
};

describe("domain schemas", () => {
  it("accepts a valid aggregate snapshot", () => {
    const doc = {
      schema_version: SCHEMA_VERSION,
      generated_at: "2026-09-15T07:55:02+00:00",
      fresh: true,
      providers: [validProvider],
    };
    expect(parseAggregateSnapshot(doc)).toEqual(doc);
  });

  it("rejects a wrong schema_version", () => {
    const doc = {
      schema_version: "2.0",
      generated_at: "2026-09-15T07:55:02+00:00",
      fresh: true,
      providers: [],
    };
    expect(() => parseAggregateSnapshot(doc)).toThrow();
  });

  it("rejects an unknown provider status", () => {
    expect(() =>
      parseProviderSnapshot({ ...validProvider, status: "everything_is_fine" }),
    ).toThrow();
  });

  it("rejects out-of-range percentages", () => {
    expect(() => usageLimitSchema.parse({ ...validLimit, used_percent: 101 })).toThrow();
    expect(() => usageLimitSchema.parse({ ...validLimit, used_percent: -1 })).toThrow();
  });

  it("allows optional fields to be absent without fabrication", () => {
    const minimal = { id: "weekly", category: "weekly" };
    const parsed = usageLimitSchema.parse(minimal);
    expect(parsed.used_percent).toBeUndefined();
    expect(parsed.resets_at).toBeUndefined();
  });

  it("rejects non-UTC-ish timestamps", () => {
    expect(() =>
      providerSnapshotSchema.parse({ ...validProvider, fetched_at: "not a date" }),
    ).toThrow();
  });

  it("keeps the aggregate schema stable", () => {
    expect(aggregateSnapshotSchema.shape.schema_version.parse("1.0")).toBe(SCHEMA_VERSION);
  });

  it("round-trips CLI JSON formatter output through the public schema", () => {
    const doc = {
      schema_version: SCHEMA_VERSION,
      generated_at: "2026-09-15T07:55:02.000Z",
      fresh: false,
      providers: [validProvider],
    };
    const stdout = formatJsonSnapshot(parseAggregateSnapshot(doc));
    expect(stdout.endsWith("\n")).toBe(true);
    expect(parseAggregateSnapshot(JSON.parse(stdout))).toEqual(parseAggregateSnapshot(doc));
  });
});
