import { describe, expect, it } from "vitest";
import { type CliContext, createCliContext } from "../src/cli/context.js";
import { runCli } from "../src/cli/index.js";
import { parseAggregateSnapshot } from "../src/core/domain/index.js";

describe("Codex end-to-end integration via CLI", () => {
  it("executes 'status --provider codex --json --fresh' returning normalized schema-compliant data", async () => {
    const stdoutChunks: string[] = [];
    const origStdout = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    let context: CliContext | null = null;
    try {
      context = createCliContext({
        dbPath: ":memory:",
        demo: false, // Use real providers!
      });

      const exitCode = await runCli(
        ["node", "ai-limits", "status", "--provider", "codex", "--json", "--fresh"],
        context,
      );

      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const parsed = JSON.parse(stdout);
      const snapshot = parseAggregateSnapshot(parsed);

      expect(snapshot.schema_version).toBe("1.0");
      expect(snapshot.fresh).toBe(true);
      expect(snapshot.providers.length).toBe(1);

      const codex = snapshot.providers[0];
      expect(codex).toBeDefined();
      if (!codex) throw new Error("Expected codex snapshot");

      expect(codex.id).toBe("codex");
      expect(codex.display_name).toBe("Codex");

      // On this machine with real codex-cli installed and authenticated:
      expect(codex.installed).toBe(true);
      expect(codex.status).toBe("ok");
      expect(codex.source).toBe("app-server");
      expect(codex.limits.length).toBeGreaterThanOrEqual(1);

      const primary = codex.limits.find((l) => l.id === "primary");
      if (primary) {
        expect(primary.category).toBe("rolling_window");
        expect(primary.window_minutes).toBe(300);
        expect(primary.used_percent).toBeGreaterThanOrEqual(0);
        expect(primary.remaining_percent).toBeLessThanOrEqual(100);
      }
    } finally {
      process.stdout.write = origStdout;
      context?.dispose();
    }
  });

  it("returns cached snapshot on subsequent '--cached' run without re-polling app-server", async () => {
    const stdoutChunks: string[] = [];
    const origStdout = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    let context: CliContext | null = null;
    try {
      context = createCliContext({
        dbPath: ":memory:",
        demo: false,
      });

      // 1. Initial live fetch
      await runCli(
        ["node", "ai-limits", "status", "--provider", "codex", "--json", "--fresh"],
        context,
      );
      stdoutChunks.length = 0;

      // 2. Cached read
      const exitCode = await runCli(
        ["node", "ai-limits", "status", "--provider", "codex", "--json", "--cached"],
        context,
      );
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const snapshot = parseAggregateSnapshot(JSON.parse(stdout));
      expect(snapshot.fresh).toBe(false);
      expect(snapshot.providers[0]?.id).toBe("codex");
    } finally {
      process.stdout.write = origStdout;
      context?.dispose();
    }
  });

  it("lists Codex in 'providers --json' output", async () => {
    const stdoutChunks: string[] = [];
    const origStdout = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    let context: CliContext | null = null;
    try {
      context = createCliContext({
        dbPath: ":memory:",
        demo: false,
      });

      const exitCode = await runCli(["node", "ai-limits", "providers", "--json"], context);
      expect(exitCode).toBe(0);

      const items = JSON.parse(stdoutChunks.join(""));
      const codexEntry = items.find((p: { id: string }) => p.id === "codex");
      expect(codexEntry).toBeDefined();
      expect(codexEntry.displayName).toBe("Codex");
      expect(codexEntry.enabled).toBe(true);
    } finally {
      process.stdout.write = origStdout;
      context?.dispose();
    }
  });
});
