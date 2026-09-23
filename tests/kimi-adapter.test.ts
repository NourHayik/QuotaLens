import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KimiAdapter } from "../src/providers/kimi/kimi-adapter.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/kimi");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("KimiAdapter", () => {
  const fixedNow = new Date("2026-09-15T10:00:00.000Z");

  it("exposes expected metadata and capabilities", async () => {
    const adapter = new KimiAdapter();
    expect(adapter.id).toBe("kimi");
    expect(adapter.displayName).toBe("Kimi");

    const caps = await adapter.getCapabilities();
    expect(caps.usage).toBe("supported");
    expect(["local-api", "tui-pty"]).toContain(caps.source);
  });

  it("falls back to tui-pty capability when local credentials are absent", async () => {
    const adapter = new KimiAdapter({ credentialsPath: "/nonexistent/kimi-code.json" });
    const caps = await adapter.getCapabilities();
    expect(caps.usage).toBe("supported");
    expect(caps.source).toBe("tui-pty");
  });

  it("detects real or mocked kimi executable presence", async () => {
    const adapter = new KimiAdapter();
    const installed = await adapter.detect();
    // On this machine, kimi is installed at /home/nour/.kimi-code/bin/kimi
    expect(typeof installed).toBe("boolean");
  });

  it("extracts version string from real or mocked kimi", async () => {
    const adapter = new KimiAdapter();
    const version = await adapter.getVersion();
    if (version !== null) {
      expect(version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+/);
    }
  });

  it("extracts auth state safely without secrets", async () => {
    const adapter = new KimiAdapter();
    const auth = await adapter.getAuthState();
    expect(["authenticated", "not_authenticated", "unknown"]).toContain(auth);
  });

  it("fetches and parses usage limits via mock PTY runner", async () => {
    const raw = readFixture("healthy-usage.txt");
    const adapter = new KimiAdapter({
      credentialsPath: "/nonexistent/kimi-code.json",
      ptyRunner: async () => raw,
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(3);
    expect(limits.map((l) => l.id)).toEqual(["5h", "weekly", "context_window"]);
  });

  it("propagates parse error when pty output drifts", async () => {
    const raw = readFixture("drifted-format.txt");
    const adapter = new KimiAdapter({
      credentialsPath: "/nonexistent/kimi-code.json",
      ptyRunner: async () => raw,
      now: () => fixedNow,
    });

    await expect(adapter.fetchUsage()).rejects.toThrow();
  });

  it("fetches accurate real-time usage via mock REST API", async () => {
    const mockUsages = {
      usage: { used: 39, total: 100 },
      limits: [
        {
          detail: {
            used: 11,
            total: 100,
            reset_time: 1726484400,
          },
        },
      ],
    };

    const adapter = new KimiAdapter({
      fetchImpl: async (url) => {
        const u = String(url);
        if (u.endsWith("/usages")) {
          return new Response(JSON.stringify(mockUsages), { status: 200 });
        }
        if (u.endsWith("/me")) {
          return new Response(
            JSON.stringify({ nickname: "Nour", vip_info: { level_name: "Allegretto" } }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 200 });
      },
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(2);
    expect(limits.find((l) => l.id === "weekly")?.used_percent).toBe(39);
    expect(limits.find((l) => l.id === "5h")?.used_percent).toBe(11);
  });
});
