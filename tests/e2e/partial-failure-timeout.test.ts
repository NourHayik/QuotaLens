import { describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { runCli } from "../../src/cli/index.js";
import { ProviderRegistry } from "../../src/core/application/index.js";
import { parseAggregateSnapshot } from "../../src/core/domain/index.js";
import { createDemoProvider } from "../../src/providers/demo/index.js";

describe("E2E: one provider timeout while four others return", () => {
  it("keeps exit 0 and isolates a kimi timeout from the other four priority providers", async () => {
    const registry = new ProviderRegistry();
    registry.register(createDemoProvider({ id: "codex", displayName: "Codex", mode: "healthy" }));
    registry.register(
      createDemoProvider({ id: "kimi", displayName: "Kimi Code", mode: "timeout" }),
    );
    registry.register(
      createDemoProvider({
        id: "antigravity",
        displayName: "Google Antigravity",
        mode: "healthy",
      }),
    );
    registry.register(
      createDemoProvider({
        id: "cursor",
        displayName: "Cursor",
        mode: "unsupported",
        unsupportedReason: "No deterministic local usage source",
      }),
    );
    registry.register(
      createDemoProvider({
        id: "opencode",
        displayName: "OpenCode Go",
        mode: "unsupported",
        unsupportedReason: "No deterministic local usage source",
      }),
    );

    const context = createCliContext({ dbPath: ":memory:", registry });
    context.settingsRepo.updateSettings({
      default_timeout_ms: 250,
      stagger_interval_ms: 0,
      max_concurrency: 5,
    });

    const stdoutChunks: string[] = [];
    const origStdout = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    try {
      const exitCode = await runCli(["node", "ai-limits", "status", "--json", "--fresh"], context);
      expect(exitCode).toBe(0);

      const snapshot = parseAggregateSnapshot(JSON.parse(stdoutChunks.join("")));
      expect(snapshot.providers).toHaveLength(5);

      const byId = Object.fromEntries(snapshot.providers.map((p) => [p.id, p]));
      expect(byId.codex?.status).toBe("ok");
      expect(byId.codex?.limits.length).toBeGreaterThan(0);
      expect(byId.antigravity?.status).toBe("ok");
      expect(byId.antigravity?.limits.length).toBeGreaterThan(0);
      expect(byId.cursor?.status).toBe("unsupported");
      expect(byId.opencode?.status).toBe("unsupported");
      expect(byId.kimi?.status).toBe("timeout");
      expect(byId.kimi?.errors[0]?.code).toBe("timeout");
    } finally {
      process.stdout.write = origStdout;
      context.dispose();
    }
  });
});
