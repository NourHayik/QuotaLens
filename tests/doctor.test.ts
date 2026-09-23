import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DoctorService, doctorReportSchema } from "../src/core/application/doctor-service.js";
import { ProviderRegistry } from "../src/core/application/provider-registry.js";
import type { UsageLimit } from "../src/core/domain/index.js";
import type { EnvironmentInfo } from "../src/infra/process/environment.js";
import { DatabaseManager } from "../src/infra/storage/database.js";
import { createFakeProvider } from "../src/providers/fake/fake-provider.js";

const linuxEnv: EnvironmentInfo = {
  runtime: "linux",
  os: "linux",
  arch: "x64",
  node: { version: "v24.0.0", compatible: true, requiredMajor: 24 },
  wsl: { detected: false },
  notes: ["Running on native Linux (not WSL). PATH discovery is limited to this environment."],
};

const wslEnv: EnvironmentInfo = {
  runtime: "wsl",
  os: "linux",
  arch: "x64",
  node: { version: "v24.0.0", compatible: true, requiredMajor: 24 },
  wsl: { detected: true, distro: "Ubuntu" },
  notes: [
    'Running inside WSL distro "Ubuntu". Windows-installed provider CLIs are not automatically visible here.',
    "Install and authenticate each provider CLI inside this WSL environment.",
  ],
};

describe("DoctorService", () => {
  it("probes detect/version/auth/capability without calling fetchUsage", async () => {
    let fetchUsageCalls = 0;
    const base = createFakeProvider({
      id: "codex",
      displayName: "Codex",
      mode: "healthy",
      cliVersion: "1.2.3",
    });
    const adapter = {
      ...base,
      fetchUsage: async (signal?: AbortSignal): Promise<UsageLimit[]> => {
        fetchUsageCalls += 1;
        return base.fetchUsage(signal);
      },
    };

    const registry = new ProviderRegistry();
    registry.register(adapter);
    const dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    const report = await new DoctorService({
      registry,
      dbManager,
      environment: linuxEnv,
      findExecutable: () => join(homedir(), "bin", "codex"),
      now: new Date("2026-09-15T09:00:00.000Z"),
    }).run();

    doctorReportSchema.parse(report);
    expect(fetchUsageCalls).toBe(0);
    expect(report.healthy).toBe(true);
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0]?.installed).toBe(true);
    expect(report.providers[0]?.version).toBe("1.2.3");
    expect(report.providers[0]?.auth_state).toBe("authenticated");
    expect(report.providers[0]?.usage_capability).toBe("supported");
    expect(report.providers[0]?.executable_path).toBe("~/bin/codex");
    dbManager.close();
  });

  it("reports missing, unauthenticated, and unsupported providers with remediation", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      createFakeProvider({ id: "kimi", displayName: "Kimi", mode: "not_installed" }),
    );
    registry.register(
      createFakeProvider({
        id: "cursor",
        displayName: "Cursor",
        mode: "not_authenticated",
        cliVersion: "2026.09.10",
      }),
    );
    registry.register(
      createFakeProvider({
        id: "opencode",
        displayName: "OpenCode Go",
        mode: "unsupported",
        cliVersion: "1.18.27",
      }),
    );

    const dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();
    const report = await new DoctorService({
      registry,
      dbManager,
      environment: wslEnv,
      findExecutable: () => null,
    }).run();

    const kimi = report.providers.find((p) => p.id === "kimi");
    const cursor = report.providers.find((p) => p.id === "cursor");
    const opencode = report.providers.find((p) => p.id === "opencode");

    expect(kimi?.installed).toBe(false);
    expect(kimi?.remediation.some((h) => h.includes("Install the"))).toBe(true);
    expect(cursor?.auth_state).toBe("not_authenticated");
    expect(cursor?.remediation.some((h) => h.includes("never stores credentials"))).toBe(true);
    expect(opencode?.usage_capability).toBe("unsupported");
    expect(opencode?.remediation.some((h) => h.includes("live quota remains unsupported"))).toBe(
      true,
    );
    expect(report.environment.runtime).toBe("wsl");
    expect(report.environment.wsl.distro).toBe("Ubuntu");
    dbManager.close();
  });

  it("redacts secrets from doctor JSON fields", async () => {
    const base = createFakeProvider({ id: "codex", displayName: "Codex", mode: "healthy" });
    const adapter = {
      ...base,
      getVersion: async () => "sk-super-secret-doctor-version",
      getCapabilities: async () => ({
        usage: "unsupported" as const,
        source: "none" as const,
        reason: "token=sk-leaked-reason-value auth.json contents",
      }),
    };
    const registry = new ProviderRegistry();
    registry.register(adapter);
    const dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    const report = await new DoctorService({
      registry,
      dbManager,
      environment: linuxEnv,
      findExecutable: () => null,
    }).run();

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("sk-super-secret-doctor-version");
    expect(serialized).not.toContain("sk-leaked-reason-value");
    expect(serialized).toContain("[REDACTED]");
    dbManager.close();
  });
});

describe("environment probe fixtures", () => {
  it("classifies WSL vs Windows vs native Linux without requiring a real WSL host", async () => {
    const { probeEnvironment } = await import("../src/infra/process/environment.js");

    const wsl = probeEnvironment({
      platform: "linux",
      env: { WSL_DISTRO_NAME: "Ubuntu-24.04" },
      procVersion: "Linux version 5.15.0-microsoft-standard-WSL2",
      nodeVersion: "v24.1.0",
    });
    expect(wsl.runtime).toBe("wsl");
    expect(wsl.wsl.detected).toBe(true);
    expect(wsl.wsl.distro).toBe("Ubuntu-24.04");
    expect(wsl.notes.some((n) => n.includes("Windows-installed"))).toBe(true);

    const win = probeEnvironment({
      platform: "win32",
      env: {},
      procVersion: null,
      nodeVersion: "v24.1.0",
    });
    expect(win.runtime).toBe("win32");
    expect(win.notes.some((n) => n.includes("WSL"))).toBe(true);

    const linux = probeEnvironment({
      platform: "linux",
      env: {},
      procVersion: "Linux version 6.8.0-generic",
      nodeVersion: "v24.1.0",
    });
    expect(linux.runtime).toBe("linux");
    expect(linux.wsl.detected).toBe(false);
  });
});
