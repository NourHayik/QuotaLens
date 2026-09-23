#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distCandidates = [
  join(__dirname, "..", "dist", "cli", "index.js"),
  join(__dirname, "..", "dist", "src", "cli", "index.js"),
];
const distEntry = distCandidates.find((p) => existsSync(p));
const tsEntry = join(__dirname, "..", "src", "cli", "index.ts");

if (distEntry) {
  try {
    const { runCli, installFatalProcessCleanup } = await import(pathToFileURL(distEntry).href);
    if (typeof installFatalProcessCleanup === "function") {
      installFatalProcessCleanup();
    }
    const code = await runCli(process.argv);
    process.exit(code);
  } catch (error) {
    console.error("Failed to execute QuotaLens CLI:", error);
    process.exit(1);
  }
} else {
  // Development fallback: resolve tsx loader relative to this package so it works from ANY working directory
  const require = createRequire(import.meta.url);
  let tsxLoader;
  try {
    tsxLoader = pathToFileURL(require.resolve("tsx")).href;
  } catch {
    tsxLoader = "tsx";
  }

  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["--import", tsxLoader, tsEntry, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (result.error) {
    console.error("Failed to start QuotaLens CLI:", result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}
