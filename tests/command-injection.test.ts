import { describe, expect, it } from "vitest";
import { assertAllowedArgs } from "../src/infra/process/allowlist.js";
import { CommandNotAllowedError } from "../src/infra/process/errors.js";
import { runProcess } from "../src/infra/process/run-process.js";
import { ANTIGRAVITY_ALLOWED_ARGS } from "../src/providers/antigravity/command-allowlist.js";
import { CODEX_ALLOWED_ARGS } from "../src/providers/codex/command-allowlist.js";
import { CURSOR_ALLOWED_ARGS } from "../src/providers/cursor/command-allowlist.js";
import { KIMI_ALLOWED_ARGS } from "../src/providers/kimi/command-allowlist.js";
import { OPENCODE_ALLOWED_ARGS } from "../src/providers/opencode/command-allowlist.js";
import { refreshBodySchema } from "../src/server/schemas.js";

const node = process.execPath;

describe("command allowlists and injection resistance", () => {
  it("rejects argv sequences that are not on the connector allowlist", () => {
    expect(() => assertAllowedArgs("codex", ["run", "pwned"], CODEX_ALLOWED_ARGS)).toThrow(
      CommandNotAllowedError,
    );
    expect(() => assertAllowedArgs("kimi", ["-e", "process.exit(0)"], KIMI_ALLOWED_ARGS)).toThrow(
      CommandNotAllowedError,
    );
    expect(() =>
      assertAllowedArgs("antigravity", ["sh", "-c", "rm -rf /"], ANTIGRAVITY_ALLOWED_ARGS),
    ).toThrow(CommandNotAllowedError);
    expect(() => assertAllowedArgs("cursor", ["-p", "report usage"], CURSOR_ALLOWED_ARGS)).toThrow(
      CommandNotAllowedError,
    );
    expect(() => assertAllowedArgs("opencode", ["run", "hello"], OPENCODE_ALLOWED_ARGS)).toThrow(
      CommandNotAllowedError,
    );
  });

  it("allows the documented argv sequences", () => {
    expect(() => assertAllowedArgs("codex", ["--version"], CODEX_ALLOWED_ARGS)).not.toThrow();
    expect(() =>
      assertAllowedArgs("codex", ["app-server", "--stdio"], CODEX_ALLOWED_ARGS),
    ).not.toThrow();
    expect(() => assertAllowedArgs("kimi", ["provider", "list"], KIMI_ALLOWED_ARGS)).not.toThrow();
    expect(() =>
      assertAllowedArgs("antigravity", ["models"], ANTIGRAVITY_ALLOWED_ARGS),
    ).not.toThrow();
    expect(() =>
      assertAllowedArgs("cursor", ["status", "--format", "json"], CURSOR_ALLOWED_ARGS),
    ).not.toThrow();
    expect(() =>
      assertAllowedArgs("opencode", ["auth", "list"], OPENCODE_ALLOWED_ARGS),
    ).not.toThrow();
  });

  it("does not invoke a shell when executable or args contain metacharacters", async () => {
    await expect(
      runProcess({
        executable: "echo; rm -rf /",
        args: [],
        timeoutMs: 2_000,
      }),
    ).rejects.toMatchObject({ name: "ProcessSpawnError" });

    const result = await runProcess({
      executable: node,
      args: [
        "-e",
        "process.stdout.write(process.argv.slice(1).join('|'))",
        "a && cat /etc/passwd",
        "$(whoami)",
        "x|y",
      ],
      timeoutMs: 5_000,
    });
    expect(result.stdout).toContain("a && cat /etc/passwd");
    expect(result.stdout).toContain("$(whoami)");
    expect(result.stdout).not.toContain("root:");
  });

  it("ignores extra command fields on refresh API bodies", () => {
    const parsed = refreshBodySchema.parse({
      providerId: "codex",
      force: true,
      command: "rm -rf /",
      args: ["-p", "tell me my quota"],
    });
    expect(parsed).toEqual({ providerId: "codex", force: true });
    expect("command" in parsed).toBe(false);
  });
});
