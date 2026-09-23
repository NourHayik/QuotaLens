import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");

/** Dependency direction rules: folder -> forbidden import path prefixes. */
const RULES: ReadonlyArray<{ folder: string; forbidden: string[] }> = [
  {
    folder: "core/domain",
    forbidden: ["core/application", "providers", "infra", "cli", "server", "web"],
  },
  {
    folder: "core/application",
    forbidden: ["providers", "cli", "server", "web"],
  },
  {
    folder: "infra",
    forbidden: ["core/application", "providers", "cli", "server", "web"],
  },
  {
    folder: "providers",
    forbidden: ["cli", "server", "web"],
  },
];

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

function importSpecifiers(file: string): string[] {
  const content = readFileSync(file, "utf8");
  const matches = content.matchAll(/(?:import|export)\s[^"']*from\s+["']([^"']+)["']/g);
  return [...matches].map((m) => m[1] ?? "");
}

describe("module dependency direction", () => {
  for (const rule of RULES) {
    it(`${rule.folder} does not import forbidden modules`, () => {
      const dir = join(SRC, rule.folder);
      const violations: string[] = [];
      for (const file of listTsFiles(dir)) {
        for (const spec of importSpecifiers(file)) {
          if (!spec.startsWith(".")) continue;
          const resolved = relative(SRC, join(join(file, ".."), spec)).replaceAll("\\", "/");
          for (const forbidden of rule.forbidden) {
            if (resolved === forbidden || resolved.startsWith(`${forbidden}/`)) {
              violations.push(`${relative(SRC, file)} -> ${spec}`);
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
