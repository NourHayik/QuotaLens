import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CliContext, createCliContext } from "../src/cli/context.js";
import { runCli } from "../src/cli/index.js";
import { parseAggregateSnapshot } from "../src/core/domain/index.js";

describe("CLI status command", () => {
  let context: CliContext;
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let origStdoutWrite: typeof process.stdout.write;
  let origStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    origStdoutWrite = process.stdout.write;
    origStderrWrite = process.stderr.write;

    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
      stderrChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stderr.write;

    // Use in-memory database and demo providers for isolation
    context = createCliContext({
      dbPath: ":memory:",
      demo: true,
    });
  });

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    context.dispose();
  });

  it("outputs valid schema version 1.0 JSON on 'status --json'", async () => {
    const exitCode = await runCli(["node", "ai-limits", "status", "--json"], context);
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout);
    const validated = parseAggregateSnapshot(parsed);

    expect(validated.schema_version).toBe("1.0");
    expect(validated.fresh).toBe(true);
    expect(validated.providers.length).toBe(5);
    expect(validated.providers.map((p) => p.id)).toEqual([
      "codex",
      "kimi",
      "antigravity",
      "cursor",
      "opencode",
    ]);
  });

  it("returns cached snapshot on 'status --json --cached' after initial run", async () => {
    // Prime cache with initial run
    await runCli(["node", "ai-limits", "status", "--json"], context);
    stdoutChunks = [];

    const exitCode = await runCli(["node", "ai-limits", "status", "--json", "--cached"], context);
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout);
    expect(parsed.fresh).toBe(false);
    expect(parsed.providers.length).toBe(5);
  });

  it("forces live refresh on 'status --json --fresh'", async () => {
    const exitCode = await runCli(["node", "ai-limits", "status", "--json", "--fresh"], context);
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout);
    expect(parsed.fresh).toBe(true);
  });

  it("filters to a single provider when '--provider <id>' is passed", async () => {
    const exitCode = await runCli(
      ["node", "ai-limits", "status", "--provider", "codex", "--json"],
      context,
    );
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout);
    expect(parsed.providers.length).toBe(1);
    expect(parsed.providers[0].id).toBe("codex");
    expect(parsed.providers[0].display_name).toBe("Codex");
    expect(parsed.providers[0].limits.length).toBe(2);
  });

  it("filters to kimi when '--provider kimi --json' is passed", async () => {
    const exitCode = await runCli(
      ["node", "ai-limits", "status", "--provider", "kimi", "--json"],
      context,
    );
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout);
    expect(parsed.providers.length).toBe(1);
    expect(parsed.providers[0].id).toBe("kimi");
    expect(parsed.providers[0].display_name).toBe("Kimi Code");
    expect(parsed.providers[0].limits.length).toBe(2);
  });

  it("filters to antigravity when '--provider antigravity --json' is passed", async () => {
    const exitCode = await runCli(
      ["node", "ai-limits", "status", "--provider", "antigravity", "--json"],
      context,
    );
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout);
    expect(parsed.providers.length).toBe(1);
    expect(parsed.providers[0].id).toBe("antigravity");
    expect(parsed.providers[0].display_name).toBe("Google Antigravity");
    expect(parsed.providers[0].limits.length).toBe(2);
  });

  it("errors with exit code 1 when unknown provider is requested", async () => {
    const exitCode = await runCli(
      ["node", "ai-limits", "status", "--provider", "unknown_tool", "--json"],
      context,
    );
    expect(exitCode).toBe(1);

    const stderr = stderrChunks.join("");
    expect(stderr).toContain('Unknown provider "unknown_tool"');
  });

  it("errors with exit code 1 when --fresh and --cached are passed together", async () => {
    const exitCode = await runCli(
      ["node", "ai-limits", "status", "--fresh", "--cached", "--json"],
      context,
    );
    expect(exitCode).toBe(1);

    const stderr = stderrChunks.join("");
    expect(stderr).toContain("mutually exclusive");
  });

  it("renders human-readable table output by default when --json is omitted", async () => {
    const exitCode = await runCli(["node", "ai-limits", "status"], context);
    expect(exitCode).toBe(0);

    const stdout = stdoutChunks.join("");
    expect(stdout).toContain("AI Limits Dashboard — Status");
    expect(stdout).toContain("Codex (v0.14.0) [OK]");
    expect(stdout).toContain("5-hour rolling window: 42% used (58% remaining)");
    expect(stdout).toContain("Cursor (v0.45.1) [UNSUPPORTED]");
  });
});
