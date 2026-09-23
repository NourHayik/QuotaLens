import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAggregateSnapshot } from "../../src/core/domain/index.js";

const BIN_PATH = join(__dirname, "..", "..", "bin", "ai-limits.js");

// biome-ignore lint/suspicious/noControlCharactersInRegex: assert JSON stdout has no ANSI
const ANSI_REGEX = /\u001b\[[0-9;]*[a-zA-Z]/;
const SECRET_LIKE = /sk-[a-zA-Z0-9]|ghp_|xox[baprs]-|Bearer\s+[A-Za-z0-9._-]+|api[_-]?key/i;

describe("CLI JSON automation-agent scenario", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "ai-limits-agent-"));
    dbPath = join(dbDir, "ai-limits.db");
  });

  afterEach(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  function runStatus(args: string[]): string {
    return execFileSync(process.execPath, [BIN_PATH, "--demo", "--db", dbPath, "status", ...args], {
      encoding: "utf8",
      env: { ...process.env, AI_LIMITS_DB_PATH: dbPath },
    });
  }

  it("produces one schema 1.0 JSON document an automation agent can parse", () => {
    const freshStdout = runStatus(["--json", "--fresh"]);
    expect(ANSI_REGEX.test(freshStdout)).toBe(false);
    expect(SECRET_LIKE.test(freshStdout)).toBe(false);

    const fresh = parseAggregateSnapshot(JSON.parse(freshStdout));
    expect(fresh.schema_version).toBe("1.0");
    expect(fresh.fresh).toBe(true);
    expect(fresh.providers.map((p) => p.id).sort()).toEqual(
      ["antigravity", "codex", "cursor", "kimi", "opencode"].sort(),
    );

    const cachedStdout = runStatus(["--json", "--cached"]);
    expect(ANSI_REGEX.test(cachedStdout)).toBe(false);
    expect(SECRET_LIKE.test(cachedStdout)).toBe(false);

    const cached = parseAggregateSnapshot(JSON.parse(cachedStdout));
    expect(cached.schema_version).toBe("1.0");
    expect(cached.fresh).toBe(false);
    expect(cached.providers).toHaveLength(5);

    const summary = cached.providers
      .map((p) => {
        const primary = p.limits[0];
        const usage = primary ? `${primary.used_percent ?? "n/a"}%` : p.status;
        return `${p.id}:${usage}`;
      })
      .join(" ");
    expect(summary).toContain("codex:");
    expect(summary).toContain("cursor:unsupported");
  });
});
