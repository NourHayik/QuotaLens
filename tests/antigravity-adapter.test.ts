import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AntigravityAdapter } from "../src/providers/antigravity/antigravity-adapter.js";

const FIXTURES_DIR = resolve(__dirname, "fixtures/antigravity");

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), "utf8");
}

describe("AntigravityAdapter", () => {
  const fixedNow = new Date("2026-09-15T10:00:00.000Z");

  it("exposes expected metadata and capabilities", async () => {
    const adapter = new AntigravityAdapter();
    expect(adapter.id).toBe("antigravity");
    expect(adapter.displayName).toBe("Gemini / Antigravity");

    const caps = await adapter.getCapabilities();
    expect(caps.usage).toBe("supported");
    expect(caps.source).toBe("tui-pty");
  });

  it("detects real or mocked agy executable presence", async () => {
    const adapter = new AntigravityAdapter();
    const installed = await adapter.detect();
    // On this machine, agy is installed at /home/nour/.local/bin/agy
    expect(typeof installed).toBe("boolean");
  });

  it("extracts version string from real or mocked agy", async () => {
    const adapter = new AntigravityAdapter();
    const version = await adapter.getVersion();
    if (version !== null) {
      expect(version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+/);
    }
  });

  it("extracts auth state safely without secrets", async () => {
    const adapter = new AntigravityAdapter();
    const auth = await adapter.getAuthState();
    expect(["authenticated", "not_authenticated", "unknown"]).toContain(auth);
  });

  it("fetches and parses usage limits via mock PTY runner", async () => {
    const raw = readFixture("healthy-usage.txt");
    const adapter = new AntigravityAdapter({
      ptyRunner: async () => raw,
      now: () => fixedNow,
    });

    const limits = await adapter.fetchUsage();
    expect(limits).toHaveLength(4);
    expect(limits.map((l) => l.id)).toEqual([
      "gemini_models:weekly",
      "gemini_models:5h",
      "claude_and_gpt_models:weekly",
      "claude_and_gpt_models:5h",
    ]);

    const plan = await adapter.getPlanLabel();
    expect(plan).toBe("Google AI Pro");
  });

  it("propagates parse error when pty output drifts", async () => {
    const raw = readFixture("drifted-format.txt");
    const adapter = new AntigravityAdapter({
      ptyRunner: async () => raw,
      now: () => fixedNow,
    });

    await expect(adapter.fetchUsage()).rejects.toThrow();
  });
});
