import { z } from "zod";
import { redactSecrets } from "../../infra/logging/redact.js";
import {
  type EnvironmentInfo,
  findExecutableOnPath,
  probeEnvironment,
  sanitizeUserPath,
} from "../../infra/process/environment.js";
import type { DatabaseManager } from "../../infra/storage/database.js";
import {
  type AuthState,
  acquisitionSourceSchema,
  authStateSchema,
  type UsageCapability,
  usageCapabilitySchema,
} from "../domain/index.js";
import type { ProviderAdapter, ProviderCapabilities } from "./provider-adapter.js";
import type { ProviderRegistry } from "./provider-registry.js";

export const PROVIDER_EXECUTABLE_NAMES: Readonly<Record<string, string>> = {
  codex: "codex",
  kimi: "kimi",
  antigravity: "agy",
  cursor: "cursor-agent",
  opencode: "opencode",
};

export const PROVIDER_LOGIN_HINTS: Readonly<Record<string, string>> = {
  codex: "codex login",
  kimi: "kimi login",
  antigravity: "agy auth",
  cursor: "cursor-agent login",
  opencode: "opencode auth login",
};

export const doctorProviderReportSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  installed: z.boolean(),
  executable_name: z.string().min(1),
  executable_path: z.string().min(1).optional(),
  path_found: z.boolean(),
  version: z.string().min(1).nullable(),
  auth_state: authStateSchema,
  usage_capability: usageCapabilitySchema,
  source: acquisitionSourceSchema,
  reason: z.string().min(1).optional(),
  remediation: z.array(z.string()),
});
export type DoctorProviderReport = z.infer<typeof doctorProviderReportSchema>;

export const doctorEnvironmentSchema = z.object({
  runtime: z.enum(["linux", "wsl", "win32", "darwin", "other"]),
  os: z.string().min(1),
  arch: z.string().min(1),
  wsl: z.object({
    detected: z.boolean(),
    distro: z.string().min(1).optional(),
  }),
  notes: z.array(z.string()),
});
export type DoctorEnvironment = z.infer<typeof doctorEnvironmentSchema>;

export const doctorReportSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  healthy: z.boolean(),
  node: z.object({
    version: z.string().min(1),
    compatible: z.boolean(),
    requiredMajor: z.number().int(),
  }),
  environment: doctorEnvironmentSchema,
  database: z.object({
    path: z.string().min(1),
    isInMemory: z.boolean(),
    accessible: z.boolean(),
    migrationsApplied: z.number().int(),
  }),
  providers: z.array(doctorProviderReportSchema),
  demoMode: z.boolean(),
});
export type DoctorReport = z.infer<typeof doctorReportSchema>;

export interface DoctorServiceOptions {
  registry: ProviderRegistry;
  dbManager: DatabaseManager;
  isDemo?: boolean;
  environment?: EnvironmentInfo;
  findExecutable?: (name: string) => string | null;
  now?: Date;
  signal?: AbortSignal;
}

function remediationFor(input: {
  id: string;
  executableName: string;
  installed: boolean;
  authState: AuthState;
  usage: UsageCapability;
  demoMode: boolean;
}): string[] {
  const hints: string[] = [];
  if (!input.installed) {
    hints.push(
      `Install the "${input.executableName}" CLI in this same environment and ensure it is on PATH. Windows host binaries are not assumed visible inside WSL, and WSL binaries are not assumed visible on Windows.`,
    );
    if (!input.demoMode) {
      return hints;
    }
  }
  if (input.authState === "not_authenticated") {
    const login = PROVIDER_LOGIN_HINTS[input.id] ?? `${input.executableName} login`;
    hints.push(
      `Log in with the provider's own CLI (for example \`${login}\`). ai-limits never stores credentials.`,
    );
  }
  if (input.installed && input.usage === "unsupported") {
    hints.push(
      "Installation and authentication can succeed while live quota remains unsupported. This CLI version does not expose a deterministic local usage surface.",
    );
  }
  if (input.demoMode && input.installed) {
    hints.push("Demo mode is using fixtures; PATH may not contain the real provider CLI.");
  }
  return hints;
}

async function probeAdapter(
  adapter: ProviderAdapter,
  options: {
    findExecutable: (name: string) => string | null;
    demoMode: boolean;
    signal?: AbortSignal;
  },
): Promise<DoctorProviderReport> {
  const executableName = PROVIDER_EXECUTABLE_NAMES[adapter.id] ?? adapter.id;
  const resolved = options.findExecutable(executableName);
  const pathFound = resolved !== null;
  const executablePath = resolved ? sanitizeUserPath(resolved) : undefined;

  let installed = false;
  let version: string | null = null;
  let authState: AuthState = "unknown";
  let capabilities: ProviderCapabilities = {
    usage: "unknown",
    source: "none",
  };

  try {
    installed = await adapter.detect(options.signal);
  } catch {
    installed = false;
  }

  if (installed) {
    try {
      version = await adapter.getVersion(options.signal);
    } catch {
      version = null;
    }
    try {
      authState = await adapter.getAuthState(options.signal);
    } catch {
      authState = "unknown";
    }
    try {
      capabilities = await adapter.getCapabilities(options.signal);
    } catch {
      capabilities = { usage: "unknown", source: "none" };
    }
  }

  const report: DoctorProviderReport = {
    id: adapter.id,
    display_name: adapter.displayName,
    installed,
    executable_name: executableName,
    path_found: pathFound,
    version: version ? redactSecrets(version) : null,
    auth_state: authState,
    usage_capability: capabilities.usage,
    source: capabilities.source,
    remediation: remediationFor({
      id: adapter.id,
      executableName,
      installed,
      authState,
      usage: capabilities.usage,
      demoMode: options.demoMode,
    }),
  };

  return doctorProviderReportSchema.parse({
    ...report,
    ...(executablePath ? { executable_path: executablePath } : {}),
    ...(capabilities.reason ? { reason: redactSecrets(capabilities.reason) } : {}),
  });
}

/**
 * Collects environment, storage, and per-provider capability diagnostics.
 * Never calls fetchUsage (no PTY /usage, no model prompts).
 */
export class DoctorService {
  private readonly registry: ProviderRegistry;
  private readonly dbManager: DatabaseManager;
  private readonly isDemo: boolean;
  private readonly environment: EnvironmentInfo;
  private readonly findExecutable: (name: string) => string | null;
  private readonly now: Date;
  private readonly signal: AbortSignal | undefined;

  constructor(options: DoctorServiceOptions) {
    this.registry = options.registry;
    this.dbManager = options.dbManager;
    this.isDemo = options.isDemo === true;
    this.environment = options.environment ?? probeEnvironment();
    this.findExecutable = options.findExecutable ?? findExecutableOnPath;
    this.now = options.now ?? new Date();
    this.signal = options.signal;
  }

  async run(): Promise<DoctorReport> {
    let migrationsCount = 0;
    let dbAccessible = false;
    try {
      const rows = this.dbManager.db.prepare("SELECT COUNT(*) as cnt FROM _migrations").get() as
        | { cnt: number }
        | undefined;
      migrationsCount = rows?.cnt ?? 0;
      dbAccessible = true;
    } catch {
      dbAccessible = false;
    }

    const providers: DoctorProviderReport[] = [];
    for (const adapter of this.registry.getAll()) {
      try {
        providers.push(
          await probeAdapter(adapter, {
            findExecutable: this.findExecutable,
            demoMode: this.isDemo,
            ...(this.signal ? { signal: this.signal } : {}),
          }),
        );
      } catch (error) {
        const executableName = PROVIDER_EXECUTABLE_NAMES[adapter.id] ?? adapter.id;
        providers.push(
          doctorProviderReportSchema.parse({
            id: adapter.id,
            display_name: adapter.displayName,
            installed: false,
            executable_name: executableName,
            path_found: this.findExecutable(executableName) !== null,
            version: null,
            auth_state: "unknown",
            usage_capability: "unknown",
            source: "none",
            reason: error instanceof Error ? redactSecrets(error.message) : "Doctor probe failed",
            remediation: remediationFor({
              id: adapter.id,
              executableName,
              installed: false,
              authState: "unknown",
              usage: "unknown",
              demoMode: this.isDemo,
            }),
          }),
        );
      }
    }

    const healthy = this.environment.node.compatible && dbAccessible;
    const dbPath = this.dbManager.isInMemory ? ":memory:" : sanitizeUserPath(this.dbManager.dbPath);

    return doctorReportSchema.parse({
      timestamp: this.now.toISOString(),
      healthy,
      node: this.environment.node,
      environment: {
        runtime: this.environment.runtime,
        os: this.environment.os,
        arch: this.environment.arch,
        wsl: this.environment.wsl,
        notes: this.environment.notes,
      },
      database: {
        path: dbPath,
        isInMemory: this.dbManager.isInMemory,
        accessible: dbAccessible,
        migrationsApplied: migrationsCount,
      },
      providers,
      demoMode: this.isDemo,
    });
  }
}
