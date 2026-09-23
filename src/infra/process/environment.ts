import { accessSync, constants, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export type RuntimeKind = "linux" | "wsl" | "win32" | "darwin" | "other";

export interface WslInfo {
  detected: boolean;
  distro?: string;
}

export interface NodeCompatibility {
  version: string;
  compatible: boolean;
  requiredMajor: number;
}

export interface EnvironmentInfo {
  runtime: RuntimeKind;
  os: string;
  arch: string;
  node: NodeCompatibility;
  wsl: WslInfo;
  notes: string[];
}

export interface ProbeEnvironmentOptions {
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  procVersion?: string | null;
  nodeVersion?: string;
  requiredNodeMajor?: number;
}

export interface FindExecutableOptions {
  pathEnv?: string;
  pathDelimiter?: string;
  pathExt?: string;
  platform?: NodeJS.Platform;
}

export const REQUIRED_NODE_MAJOR = 24;

function readProcVersion(): string | null {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return null;
  }
}

function isWslHost(env: NodeJS.ProcessEnv, procVersion: string | null): boolean {
  if (typeof env.WSL_DISTRO_NAME === "string" && env.WSL_DISTRO_NAME.length > 0) {
    return true;
  }
  if (typeof env.WSL_INTEROP === "string" && env.WSL_INTEROP.length > 0) {
    return true;
  }
  return Boolean(procVersion && /microsoft|wsl/i.test(procVersion));
}

function runtimeKind(platform: NodeJS.Platform, wslDetected: boolean): RuntimeKind {
  if (platform === "win32") return "win32";
  if (platform === "darwin") return "darwin";
  if (platform === "linux") return wslDetected ? "wsl" : "linux";
  return "other";
}

function environmentNotes(runtime: RuntimeKind, distro: string | undefined): string[] {
  const notes: string[] = [];
  switch (runtime) {
    case "wsl":
      notes.push(
        distro
          ? `Running inside WSL distro "${distro}". Windows-installed provider CLIs are not automatically visible here.`
          : "Running inside WSL. Windows-installed provider CLIs are not automatically visible here.",
      );
      notes.push("Install and authenticate each provider CLI inside this WSL environment.");
      break;
    case "win32":
      notes.push(
        "Running on Windows. Provider CLIs installed only inside WSL are not automatically visible here.",
      );
      notes.push("Install and authenticate each provider CLI in this Windows environment.");
      break;
    case "linux":
      notes.push(
        "Running on native Linux (not WSL). PATH discovery is limited to this environment.",
      );
      break;
    case "darwin":
      notes.push("Running on macOS. PATH discovery is limited to this environment.");
      break;
    case "other":
      notes.push("Unrecognized OS. Provider CLI discovery uses this process PATH only.");
      break;
    default: {
      const _exhaustive: never = runtime;
      return _exhaustive;
    }
  }
  return notes;
}

/**
 * Detects OS/runtime (including WSL vs native Linux) without dumping PATH or env secrets.
 */
export function probeEnvironment(options: ProbeEnvironmentOptions = {}): EnvironmentInfo {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const procVersion =
    options.procVersion !== undefined
      ? options.procVersion
      : platform === "linux"
        ? readProcVersion()
        : null;
  const wslDetected = platform === "linux" && isWslHost(env, procVersion);
  const distro =
    wslDetected && typeof env.WSL_DISTRO_NAME === "string" && env.WSL_DISTRO_NAME.length > 0
      ? env.WSL_DISTRO_NAME
      : undefined;
  const runtime = runtimeKind(platform, wslDetected);
  const nodeVersion = options.nodeVersion ?? process.version;
  const requiredMajor = options.requiredNodeMajor ?? REQUIRED_NODE_MAJOR;
  const nodeMajor = Number.parseInt(nodeVersion.replace(/^v/, "").split(".")[0] ?? "0", 10);

  const wsl: WslInfo = distro ? { detected: wslDetected, distro } : { detected: wslDetected };

  return {
    runtime,
    os: platform,
    arch: options.arch ?? process.arch,
    node: {
      version: nodeVersion.startsWith("v") ? nodeVersion : `v${nodeVersion}`,
      compatible: nodeMajor >= requiredMajor,
      requiredMajor,
    },
    wsl,
    notes: environmentNotes(runtime, distro),
  };
}

/**
 * Resolves an executable on PATH without spawning a shell.
 */
export function findExecutableOnPath(
  name: string,
  options: FindExecutableOptions = {},
): string | null {
  if (name.includes("/") || name.includes("\\")) {
    try {
      accessSync(name, constants.X_OK);
      return name;
    } catch {
      try {
        accessSync(name, constants.F_OK);
        return name;
      } catch {
        return null;
      }
    }
  }

  const platform = options.platform ?? process.platform;
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const pathDelim = options.pathDelimiter ?? delimiter;
  const extensions =
    platform === "win32"
      ? (options.pathExt ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter((ext) => ext.length > 0)
      : [""];

  for (const dir of pathEnv.split(pathDelim)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const suffix = name.toLowerCase().endsWith(ext.toLowerCase()) ? "" : ext;
      const candidate = join(dir, `${name}${suffix}`);
      try {
        accessSync(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Try next candidate.
      }
    }
  }
  return null;
}

/** Replace the user home prefix with `~` so doctor output is not a filesystem dump. */
export function sanitizeUserPath(filePath: string, home: string = homedir()): string {
  if (filePath === ":memory:") return filePath;
  if (
    home &&
    (filePath === home || filePath.startsWith(`${home}/`) || filePath.startsWith(`${home}\\`))
  ) {
    return `~${filePath.slice(home.length)}`;
  }
  return filePath;
}
