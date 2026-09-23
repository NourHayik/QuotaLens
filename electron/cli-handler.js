import { join } from "node:path";
import { pathToFileURL } from "node:url";

const KNOWN_COMMANDS = new Set(["status", "providers", "doctor", "dashboard", "help"]);

const KNOWN_FLAGS = new Set([
  "-V",
  "--version",
  "-h",
  "--help",
  "--demo",
  "--db",
  "--no-color",
  "-j",
  "--json",
  "-f",
  "--fresh",
  "-c",
  "--cached",
  "-p",
  "--provider",
  "--install-cli",
]);

export function getCliArgs(argv, isPackaged) {
  // In development: argv is [electron, appDir, ...args]
  // In packaged app: argv is [appExe, ...args]
  const rawArgs = argv.slice(isPackaged ? 1 : 2);

  // Filter out Electron / Chromium runtime flags
  const cliArgs = [];
  for (const arg of rawArgs) {
    if (
      arg.startsWith("--enable-") ||
      arg.startsWith("--disable-") ||
      arg.startsWith("--ozone-") ||
      arg.startsWith("--user-data-dir") ||
      arg.startsWith("--inspect") ||
      arg.startsWith("--remote-debugging-port") ||
      arg === "--no-sandbox" ||
      arg === "--appimage-extract-and-run" ||
      arg.startsWith("--appimage-")
    ) {
      continue;
    }
    cliArgs.push(arg);
  }
  return cliArgs;
}

export function isCliInvocation(cliArgs) {
  if (!cliArgs || cliArgs.length === 0) return false;
  return cliArgs.some((arg) => KNOWN_COMMANDS.has(arg) || KNOWN_FLAGS.has(arg));
}

export async function runCliFromMain(cliArgs, dirname, app) {
  if (cliArgs.includes("--install-cli")) {
    const { installCliIntegration } = await import("./cli-installer.js");
    const res = await installCliIntegration({ silent: false });
    process.stdout.write(`${res.message}\n`);
    app.exit(res.success ? 0 : 1);
    return;
  }

  const cliPath = join(dirname, "..", "dist", "cli", "index.js");
  const { runCli } = await import(pathToFileURL(cliPath).href);

  // Format argv matching commander expectation: [node, script, ...args]
  const fakeArgv = [process.argv[0], "quotalens", ...cliArgs];
  const exitCode = await runCli(fakeArgv);
  app.exit(exitCode);
}
