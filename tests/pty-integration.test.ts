import { describe, expect, it } from "vitest";
import { type CliContext, createCliContext } from "../src/cli/context.js";
import { runCli } from "../src/cli/index.js";
import { parseAggregateSnapshot } from "../src/core/domain/index.js";

describe("Kimi and Antigravity CLI integration", () => {
  it("registers both Kimi and Antigravity in 'providers --json' output", async () => {
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
        demo: false, // Default real providers
      });

      const exitCode = await runCli(["node", "ai-limits", "providers", "--json"], context);
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const providers = JSON.parse(stdout);

      const kimi = providers.find((p: { id: string }) => p.id === "kimi");
      expect(kimi).toBeDefined();
      expect(kimi.displayName).toBe("Kimi");

      const agy = providers.find((p: { id: string }) => p.id === "antigravity");
      expect(agy).toBeDefined();
      expect(agy.displayName).toBe("Gemini / Antigravity");
    } finally {
      process.stdout.write = origStdout;
      context?.dispose();
    }
  });

  it("filters to kimi in demo mode and returns schema-compliant output", async () => {
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
        demo: true,
      });

      const exitCode = await runCli(
        ["node", "ai-limits", "status", "--provider", "kimi", "--json"],
        context,
      );
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const snapshot = parseAggregateSnapshot(JSON.parse(stdout));

      expect(snapshot.schema_version).toBe("1.0");
      expect(snapshot.providers).toHaveLength(1);
      const kimiProvider = snapshot.providers[0];
      expect(kimiProvider).toBeDefined();
      expect(kimiProvider?.id).toBe("kimi");
      expect(kimiProvider?.status).toBe("ok");
    } finally {
      process.stdout.write = origStdout;
      context?.dispose();
    }
  });

  it("filters to antigravity in demo mode and returns schema-compliant output", async () => {
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
        demo: true,
      });

      const exitCode = await runCli(
        ["node", "ai-limits", "status", "--provider", "antigravity", "--json"],
        context,
      );
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const snapshot = parseAggregateSnapshot(JSON.parse(stdout));

      expect(snapshot.schema_version).toBe("1.0");
      expect(snapshot.providers).toHaveLength(1);
      const agyProvider = snapshot.providers[0];
      expect(agyProvider).toBeDefined();
      expect(agyProvider?.id).toBe("antigravity");
      expect(agyProvider?.status).toBe("ok");
    } finally {
      process.stdout.write = origStdout;
      context?.dispose();
    }
  });
});
