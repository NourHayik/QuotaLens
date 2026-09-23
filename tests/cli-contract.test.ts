import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCliContext } from "../src/cli/context.js";
import { runCli } from "../src/cli/index.js";
import {
  type ProviderAdapter,
  ProviderRegistry,
  ProviderStatusError,
} from "../src/core/application/index.js";
import { parseAggregateSnapshot } from "../src/core/domain/index.js";
import { createDemoProvider } from "../src/providers/demo/index.js";

const BIN_PATH = join(__dirname, "..", "bin", "ai-limits.js");

// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to test absence of ANSI codes
const ANSI_REGEX = /\u001b\[[0-9;]*[a-zA-Z]/;

describe("CLI machine-readable JSON contract", () => {
  it("executes binary directly and returns strictly ONE parseable JSON document on stdout", () => {
    const rawStdout = execFileSync(process.execPath, [BIN_PATH, "status", "--demo", "--json"], {
      encoding: "utf8",
      env: { ...process.env, AI_LIMITS_DB_PATH: ":memory:" },
    });

    // Stdout must NOT have any ANSI escape sequences
    expect(ANSI_REGEX.test(rawStdout)).toBe(false);

    // Stdout must be directly parseable without any stripping or header removal
    const parsed = JSON.parse(rawStdout);
    const snapshot = parseAggregateSnapshot(parsed);

    expect(snapshot.schema_version).toBe("1.0");
    expect(snapshot.fresh).toBe(true);
    expect(snapshot.providers.length).toBe(5);
  });

  it("produces exit 0 and includes error entry when a provider fails (failure isolation)", async () => {
    const registry = new ProviderRegistry();

    // 1 healthy provider
    registry.register(
      createDemoProvider({
        id: "codex",
        displayName: "Codex",
        mode: "healthy",
      }),
    );

    // 1 failing provider throwing parse error
    const failingAdapter: ProviderAdapter = {
      id: "failing_provider",
      displayName: "Failing Provider",
      detect: async () => true,
      getVersion: async () => "1.0.0",
      getAuthState: async () => "authenticated",
      getCapabilities: async () => ({ usage: "supported", source: "cli-text" }),
      fetchUsage: async () => {
        throw new ProviderStatusError("parse_error", "Unexpected token in CLI output");
      },
    };
    registry.register(failingAdapter);

    const context = createCliContext({
      dbPath: ":memory:",
      registry,
    });

    const stdoutChunks: string[] = [];
    const origStdout = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    try {
      const exitCode = await runCli(["node", "ai-limits", "status", "--json"], context);

      // Contract: Exit 0 even when some providers fail, because a valid aggregate snapshot was produced
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const snapshot = parseAggregateSnapshot(JSON.parse(stdout));

      expect(snapshot.providers.length).toBe(2);

      const codex = snapshot.providers.find((p) => p.id === "codex");
      expect(codex?.status).toBe("ok");
      expect(codex?.limits.length).toBeGreaterThan(0);

      const failing = snapshot.providers.find((p) => p.id === "failing_provider");
      expect(failing?.status).toBe("parse_error");
      expect(failing?.limits).toEqual([]);
      expect(failing?.errors.length).toBe(1);
      expect(failing?.errors[0]?.code).toBe("parse_error");
      expect(failing?.errors[0]?.message).toContain("Unexpected token in CLI output");
    } finally {
      process.stdout.write = origStdout;
      context.dispose();
    }
  });

  it("exits with non-zero code on invalid command arguments", () => {
    expect(() => {
      execFileSync(process.execPath, [BIN_PATH, "status", "--invalid-flag-that-does-not-exist"], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }).toThrow();
  });

  it("simulates WhatsApp automation agent consuming --cached status", () => {
    const tmpDb = join(
      tmpdir(),
      `test-whatsapp-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    try {
      // 1. Prime the snapshot
      execFileSync(process.execPath, [BIN_PATH, "status", "--demo", "--json"], {
        encoding: "utf8",
        env: { ...process.env, AI_LIMITS_DB_PATH: tmpDb },
      });

      // 2. Automated agent retrieves cached snapshot
      const output = execFileSync(
        process.execPath,
        [BIN_PATH, "status", "--demo", "--cached", "--json"],
        {
          encoding: "utf8",
          env: { ...process.env, AI_LIMITS_DB_PATH: tmpDb },
        },
      );

      const doc = JSON.parse(output);
      expect(doc.schema_version).toBe("1.0");

      // Agent formats a WhatsApp message
      const summaryLines = doc.providers.map(
        (p: {
          display_name: string;
          status: string;
          limits: Array<{ name: string; used_percent: number }>;
        }) => {
          const primary = p.limits[0];
          const usage = primary ? `${primary.name}: ${primary.used_percent}% used` : p.status;
          return `${p.display_name}: ${usage}`;
        },
      );

      const agentMessage = `*AI Limits Report*\n${summaryLines.join("\n")}`;
      expect(agentMessage).toContain("Codex: 5-hour rolling window: 42% used");
      expect(agentMessage).toContain("Cursor: unsupported");
    } finally {
      if (existsSync(tmpDb)) {
        unlinkSync(tmpDb);
      }
    }
  });

  it("retrieves Cursor status via CLI binary and reports status cleanly", () => {
    const rawStdout = execFileSync(
      process.execPath,
      [BIN_PATH, "status", "--provider", "cursor", "--json", "--fresh"],
      {
        encoding: "utf8",
        env: { ...process.env, AI_LIMITS_DB_PATH: ":memory:" },
      },
    );

    const doc = JSON.parse(rawStdout);
    const snapshot = parseAggregateSnapshot(doc);

    expect(snapshot.schema_version).toBe("1.0");
    expect(snapshot.providers.length).toBe(1);
    const cursor = snapshot.providers[0];
    expect(cursor?.id).toBe("cursor");
    expect(cursor?.usage_capability).toBe("supported");
    expect(cursor?.status).toBe("ok");
    expect(cursor?.limits.length).toBeGreaterThan(0);
  });

  it("retrieves OpenCode status via CLI binary and reports status cleanly", () => {
    const rawStdout = execFileSync(
      process.execPath,
      [BIN_PATH, "status", "--provider", "opencode", "--json", "--fresh"],
      {
        encoding: "utf8",
        env: { ...process.env, AI_LIMITS_DB_PATH: ":memory:" },
      },
    );

    const doc = JSON.parse(rawStdout);
    const snapshot = parseAggregateSnapshot(doc);

    expect(snapshot.schema_version).toBe("1.0");
    expect(snapshot.providers.length).toBe(1);
    const opencode = snapshot.providers[0];
    expect(opencode?.id).toBe("opencode");
    expect(opencode?.usage_capability).toBe("supported");
    expect(opencode?.status).toBe("ok");
    expect(opencode?.limits.length).toBeGreaterThan(0);
  });

  it("lists all 5 default production providers on 'ai-limits providers --json'", () => {
    const rawStdout = execFileSync(process.execPath, [BIN_PATH, "providers", "--json"], {
      encoding: "utf8",
      env: { ...process.env, AI_LIMITS_DB_PATH: ":memory:" },
    });

    const items = JSON.parse(rawStdout) as Array<{ id: string; displayName: string }>;
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(["codex", "kimi", "antigravity", "cursor", "opencode"]);
  });
});
