import { describe, expect, it } from "vitest";
import { createCliContext } from "../src/cli/context.js";
import { getProviderSnapshot } from "../src/core/application/index.js";
import { ProviderRegistry } from "../src/core/application/provider-registry.js";
import { redactSecrets } from "../src/infra/logging/redact.js";
import { CursorAdapter } from "../src/providers/cursor/cursor-adapter.js";
import { createFakeProvider } from "../src/providers/fake/fake-provider.js";
import { OpenCodeAdapter } from "../src/providers/opencode/opencode-adapter.js";

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/,
  /Bearer\s+[a-zA-Z0-9._-]+/,
  /token=[a-zA-Z0-9._-]+/,
  /password=[^\s&]+/,
  /api[_-]?key[=:\s]+[a-zA-Z0-9._-]+/i,
];

function containsSecret(str: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(str));
}

describe("Secret leakage and fake executable verification", () => {
  it("prevents Cursor authentication secrets and tokens from leaking into snapshot", async () => {
    const fakeSecretOutput = JSON.stringify({
      status: "authenticated",
      isAuthenticated: true,
      hasAccessToken: true,
      hasRefreshToken: true,
      accessToken: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive_payload",
      refreshToken: "refresh_token=secret_refresh_token_9876543210",
      apiKey: "sk-proj-super-secret-cursor-api-key-value",
      userInfo: {
        email: "test@example.com",
        userId: 99999,
      },
    });

    const adapter = new CursorAdapter({
      stateDbPath: "/nonexistent/state.vscdb",
      commandRunner: async (args) => {
        if (args.includes("status")) {
          return {
            stdout: fakeSecretOutput,
            stderr: "Warning: token=secret_in_stderr_should_not_leak",
            exitCode: 0,
          };
        }
        if (args.includes("--version")) {
          return { stdout: "2026.09.10\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const snapshot = await getProviderSnapshot(adapter, { timeoutMs: 3000 });
    const serialized = JSON.stringify(snapshot);

    expect(containsSecret(serialized)).toBe(false);
    expect(serialized).not.toContain("super-secret-cursor-api-key");
    expect(serialized).not.toContain("secret_refresh_token");
    expect(serialized).not.toContain("sensitive_payload");
    expect(snapshot.auth_state).toBe("authenticated");
    expect(snapshot.status).toBe("unsupported");
  });

  it("prevents OpenCode credentials and auth secrets from leaking into snapshot", async () => {
    const fakeAuthListOutput = `
┌  Credentials ~/.local/share/opencode/auth.json
│
●  OpenCode Go api token=sk-opencode-secret-bearer-token-12345
│
●  OpenCode Zen api key=sk-zen-secret-key-999999999
│
└  2 credentials
`;

    const adapter = new OpenCodeAdapter({
      authPath: "/nonexistent/auth.json",
      commandRunner: async (args) => {
        if (args.includes("auth")) {
          return {
            stdout: fakeAuthListOutput,
            stderr: "api_key: sk-proj-do-not-leak-into-errors",
            exitCode: 0,
          };
        }
        if (args.includes("--version")) {
          return { stdout: "1.18.27\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const snapshot = await getProviderSnapshot(adapter, { timeoutMs: 3000 });
    const serialized = JSON.stringify(snapshot);

    expect(containsSecret(serialized)).toBe(false);
    expect(serialized).not.toContain("sk-opencode-secret");
    expect(serialized).not.toContain("sk-zen-secret");
    expect(snapshot.auth_state).toBe("authenticated");
    expect(snapshot.status).toBe("unsupported");
  });

  it("handles hung/timeout mock processes gracefully without throwing", async () => {
    const hungRunner = async (_args: string[], signal?: AbortSignal) => {
      return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ stdout: "", stderr: "", exitCode: 0 });
          }, 10_000);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("Process timed out");
            err.name = "ProcessTimeoutError";
            reject(err);
          });
        },
      );
    };

    const cursorAdapter = new CursorAdapter({
      executable: "fake-cursor-hung",
      commandRunner: hungRunner,
    });

    const snapshot = await getProviderSnapshot(cursorAdapter, { timeoutMs: 100 });
    expect(snapshot.status).toBe("timeout");
    expect(snapshot.errors[0]?.code).toBe("timeout");
  });

  it("handles non-installed fake executables cleanly", async () => {
    const nonInstalledRunner = async () => {
      const err = new Error("ENOENT: no such file or directory");
      throw err;
    };

    const opencodeAdapter = new OpenCodeAdapter({
      executable: "non-existent-opencode-binary",
      commandRunner: nonInstalledRunner,
    });

    const snapshot = await getProviderSnapshot(opencodeAdapter, { timeoutMs: 1000 });
    expect(snapshot.installed).toBe(false);
    expect(snapshot.status).toBe("not_installed");
    expect(snapshot.errors[0]?.code).toBe("not_installed");
  });

  it("verifies live host executables do not leak secrets in CLI context", async () => {
    const context = createCliContext({
      dbPath: ":memory:",
      demo: false,
    });

    try {
      const snapshot = await context.refreshService.refreshAll({ force: true });
      const serialized = JSON.stringify(snapshot);

      expect(containsSecret(serialized)).toBe(false);

      const cursor = snapshot.providers.find((p) => p.id === "cursor");
      const opencode = snapshot.providers.find((p) => p.id === "opencode");

      expect(cursor).toBeDefined();
      expect(opencode).toBeDefined();

      // Both should report valid usage capabilities and never leak secrets
      expect(["supported", "unsupported"]).toContain(cursor?.usage_capability);
      expect(["supported", "unsupported"]).toContain(opencode?.usage_capability);
    } finally {
      context.dispose();
    }
  });

  it("does not persist provider secrets in health events or snapshot JSON", async () => {
    const registry = new ProviderRegistry();
    registry.register(
      createFakeProvider({
        id: "leaky",
        displayName: "Leaky",
        mode: "error",
        errorMessage: "refresh failed token=sk-db-secret-should-not-persist",
      }),
    );
    const context = createCliContext({
      dbPath: ":memory:",
      registry,
    });

    try {
      const snapshot = await context.refreshService.refreshAll({ force: true });
      const serialized = JSON.stringify(snapshot);
      expect(serialized).not.toContain("sk-db-secret-should-not-persist");

      const health = context.healthRepo.getLatest("leaky");
      expect(health?.error_message).toBeDefined();
      expect(health?.error_message).not.toContain("sk-db-secret-should-not-persist");
      expect(JSON.stringify(health)).toContain("[REDACTED]");
    } finally {
      context.dispose();
    }
  });

  it("redacts JWTs and API error messages", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signaturepayload";
    expect(redactSecrets(`Authorization ${jwt}`)).not.toContain("signaturepayload");
    expect(redactSecrets("Bearer sk-abcdef123456789")).toContain("[REDACTED]");
  });
});
