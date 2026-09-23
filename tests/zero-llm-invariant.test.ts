import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProviderSnapshot } from "../src/core/application/index.js";
import { ANTIGRAVITY_ALLOWED_ARGS } from "../src/providers/antigravity/command-allowlist.js";
import { CODEX_ALLOWED_ARGS } from "../src/providers/codex/command-allowlist.js";
import { CURSOR_ALLOWED_ARGS } from "../src/providers/cursor/command-allowlist.js";
import { CursorAdapter } from "../src/providers/cursor/cursor-adapter.js";
import { KIMI_ALLOWED_ARGS } from "../src/providers/kimi/command-allowlist.js";
import { OPENCODE_ALLOWED_ARGS } from "../src/providers/opencode/command-allowlist.js";
import { OpenCodeAdapter } from "../src/providers/opencode/opencode-adapter.js";

const FORBIDDEN_TOKENS = new Set(["-p", "--print", "run"]);
const PROVIDERS_ROOT = join(__dirname, "..", "src", "providers");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("zero-LLM collector invariant", () => {
  const allowlists: Array<{ id: string; sequences: ReadonlyArray<readonly string[]> }> = [
    { id: "codex", sequences: CODEX_ALLOWED_ARGS },
    { id: "kimi", sequences: KIMI_ALLOWED_ARGS },
    { id: "antigravity", sequences: ANTIGRAVITY_ALLOWED_ARGS },
    { id: "cursor", sequences: CURSOR_ALLOWED_ARGS },
    { id: "opencode", sequences: OPENCODE_ALLOWED_ARGS },
  ];

  it("forbids model-prompt argv in every provider allowlist", () => {
    for (const { id, sequences } of allowlists) {
      for (const seq of sequences) {
        for (const token of seq) {
          expect(FORBIDDEN_TOKENS.has(token), `${id} allowlist contains ${token}`).toBe(false);
        }
        expect(seq[0]).not.toBe("run");
      }
    }

    expect(CODEX_ALLOWED_ARGS).toContainEqual(["app-server", "--stdio"]);
  });

  it("does not introduce -p, --print, or run argv literals in collector source", () => {
    const argvLiteral =
      /["']-p["']|["']--print["']|\[[^\]]*["']run["'][^\]]*\]|exec\(\s*\[[^\]]*["']run["']/;
    for (const file of listTsFiles(PROVIDERS_ROOT)) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      expect(argvLiteral.test(stripped), `forbidden argv literal in ${file}`).toBe(false);
    }
  });

  it("Cursor never executes -p or --print during a full probe", async () => {
    const executed: string[][] = [];
    const adapter = new CursorAdapter({
      commandRunner: async (args) => {
        executed.push(args);
        if (args.includes("--version")) {
          return { stdout: "2026.09.10\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("status")) {
          return { stdout: '{"isAuthenticated": true}', stderr: "", exitCode: 0 };
        }
        if (args.includes("--help")) {
          return { stdout: "Usage: agent [options] [command]", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    await getProviderSnapshot(adapter, { timeoutMs: 3000 });
    for (const args of executed) {
      expect(args).not.toContain("-p");
      expect(args).not.toContain("--print");
    }
  });

  it("OpenCode never executes run during a full probe", async () => {
    const executed: string[][] = [];
    const adapter = new OpenCodeAdapter({
      commandRunner: async (args) => {
        executed.push(args);
        if (args.includes("--version")) {
          return { stdout: "1.18.27\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("auth")) {
          return { stdout: "●  OpenCode Go api\n", stderr: "", exitCode: 0 };
        }
        if (args.includes("--help")) {
          return { stdout: "Commands: opencode auth", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    await getProviderSnapshot(adapter, { timeoutMs: 3000 });
    for (const args of executed) {
      expect(args).not.toContain("run");
    }
  });
});
