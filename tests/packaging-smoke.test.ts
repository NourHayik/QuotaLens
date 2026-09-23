import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(root, "bin", "ai-limits.js");

describe("local package install surface", () => {
  it("declares a bin entry and ships required files", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      bin: Record<string, string>;
      files: string[];
      dependencies: Record<string, string>;
    };
    expect(pkg.bin["ai-limits"]).toBe("./bin/ai-limits.js");
    expect(pkg.bin.quotalens).toBe("./bin/quotalens.js");
    expect(pkg.files).toEqual(expect.arrayContaining(["bin", "src", "dist/web"]));
    expect(pkg.dependencies.tsx).toBeDefined();
  });

  it("runs doctor --json --demo through the published bin wrapper", () => {
    const result = spawnSync(
      process.execPath,
      [binPath, "--demo", "--db", ":memory:", "doctor", "--json"],
      {
        encoding: "utf8",
        cwd: root,
        timeout: 20_000,
        env: { ...process.env, AI_LIMITS_DEMO: "1" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      healthy: boolean;
      demoMode: boolean;
      providers: unknown[];
      environment: { runtime: string };
    };
    expect(report.healthy).toBe(true);
    expect(report.demoMode).toBe(true);
    expect(report.providers.length).toBe(5);
    expect(report.environment.runtime).toBeTruthy();
  });

  it("runs quotalens status --demo --json from outside the project directory (e.g. /tmp)", () => {
    const quotalensBin = join(root, "bin", "quotalens.js");
    const { tmpdir } = require("node:os");
    const result = spawnSync(
      process.execPath,
      [quotalensBin, "status", "--demo", "--json", "--db", ":memory:"],
      {
        encoding: "utf8",
        cwd: tmpdir(),
        timeout: 20_000,
        env: { ...process.env, AI_LIMITS_DEMO: "1" },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.providers.length).toBe(5);
  });
});
