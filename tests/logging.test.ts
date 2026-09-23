import { describe, expect, it } from "vitest";
import { createLogger, redactSecrets } from "../src/infra/logging/index.js";

function captureLogger() {
  const lines: string[] = [];
  const logger = createLogger({ level: "debug", write: (line) => lines.push(line) });
  return { logger, lines };
}

describe("structured logging", () => {
  it("emits JSON lines with level and timestamp", () => {
    const { logger, lines } = captureLogger();
    logger.info("hello", { provider: "fake" });
    const record = JSON.parse(lines[0] ?? "");
    expect(record.level).toBe("info");
    expect(record.msg).toBe("hello");
    expect(record.provider).toBe("fake");
    expect(typeof record.ts).toBe("string");
  });

  it("respects the minimum level", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "warn", write: (line) => lines.push(line) });
    logger.info("hidden");
    logger.warn("shown");
    expect(lines).toHaveLength(1);
  });

  it("redacts bearer tokens and authorization headers", () => {
    const { logger, lines } = captureLogger();
    logger.info("failed", { detail: "Authorization: Bearer sk-abcdef123456789" });
    expect(lines[0]).not.toContain("sk-abcdef123456789");
    expect(lines[0]).toContain("[REDACTED]");
  });

  it("redacts key=value secrets in messages", () => {
    expect(redactSecrets("OPENAI_API_KEY=sk-livekey123456")).not.toContain("sk-livekey123456");
    expect(redactSecrets("access_token: tok_12345")).not.toContain("tok_12345");
  });

  it("redacts sensitive context keys wholesale", () => {
    const { logger, lines } = captureLogger();
    logger.error("boom", { refresh_token: "secret-value", safe: "visible" });
    const record = JSON.parse(lines[0] ?? "");
    expect(record.refresh_token).toBe("[REDACTED]");
    expect(record.safe).toBe("visible");
  });

  it("redacts cookies", () => {
    expect(redactSecrets("Cookie: session=abc; other=def")).not.toContain("session=abc");
  });
});
