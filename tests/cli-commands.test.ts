import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CliContext, createCliContext } from "../src/cli/context.js";
import { runCli } from "../src/cli/index.js";

describe("CLI secondary commands (providers, doctor, dashboard)", () => {
  let context: CliContext;
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let origStdoutWrite: typeof process.stdout.write;
  let origStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    origStdoutWrite = process.stdout.write;
    origStderrWrite = process.stderr.write;

    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stdout.write;

    process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
      stderrChunks.push(chunk.toString());
      return true;
    }) as unknown as typeof process.stderr.write;

    context = createCliContext({
      dbPath: ":memory:",
      demo: true,
    });
  });

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    context.dispose();
  });

  describe("providers command", () => {
    it("lists configured providers in table format", async () => {
      const exitCode = await runCli(["node", "ai-limits", "providers"], context);
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      expect(stdout).toContain("Configured AI Limits Providers");
      expect(stdout).toContain("codex");
      expect(stdout).toContain("kimi");
      expect(stdout).toContain("antigravity");
      expect(stdout).toContain("cursor");
      expect(stdout).toContain("opencode");
    });

    it("lists configured providers as JSON array on 'providers --json'", async () => {
      const exitCode = await runCli(["node", "ai-limits", "providers", "--json"], context);
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(5);
      expect(parsed[0]).toHaveProperty("id");
      expect(parsed[0]).toHaveProperty("displayName");
      expect(parsed[0]).toHaveProperty("enabled");
    });
  });

  describe("doctor command", () => {
    it("outputs diagnostic checks in text format", async () => {
      const exitCode = await runCli(["node", "ai-limits", "doctor"], context);
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      expect(stdout).toContain("AI Limits Diagnostic Doctor");
      expect(stdout).toContain("Node.js");
      expect(stdout).toContain("SQLite Database: accessible");
      expect(stdout).toContain("Overall Status: HEALTHY");
    });

    it("outputs structured report on 'doctor --json'", async () => {
      const exitCode = await runCli(["node", "ai-limits", "doctor", "--json"], context);
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      const report = JSON.parse(stdout);

      expect(report.healthy).toBe(true);
      expect(report.node.compatible).toBe(true);
      expect(report.database.accessible).toBe(true);
      expect(report.database.migrationsApplied).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(report.providers)).toBe(true);
      expect(report.providers).toHaveLength(5);
      expect(report.environment.runtime).toBeTruthy();
      expect(report.providers[0]).toHaveProperty("auth_state");
      expect(report.providers[0]).toHaveProperty("usage_capability");
      expect(report.providers[0]).toHaveProperty("remediation");
    });
  });

  describe("dashboard command", () => {
    it("launches local dashboard server and shuts down cleanly on SIGINT", async () => {
      const cliPromise = runCli(
        ["node", "ai-limits", "dashboard", "--port", "3829", "--no-open"],
        context,
      );

      // Wait a moment for server to start, then emit SIGINT
      await new Promise((r) => setTimeout(r, 250));
      process.emit("SIGINT");

      const exitCode = await cliPromise;
      expect(exitCode).toBe(0);

      const stdout = stdoutChunks.join("");
      expect(stdout).toContain("AI Limits Dashboard is running at");
      expect(stdout).toContain("127.0.0.1:3829");
      expect(stdout).toContain("Shutting down AI Limits Dashboard");
    });
  });
});
