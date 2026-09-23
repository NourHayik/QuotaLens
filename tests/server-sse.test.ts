import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CliContext, createCliContext } from "../src/cli/context.js";
import { type RunningServer, startServer } from "../src/server/index.js";

describe("Server-Sent Events (SSE) Stream", () => {
  let ctx: CliContext;
  let running: RunningServer;

  beforeAll(async () => {
    ctx = createCliContext({ dbPath: ":memory:", demo: true });
    running = await startServer(ctx, { host: "127.0.0.1", port: 0 });
  });

  afterAll(async () => {
    await running.close();
    ctx.dispose();
  });

  it("connects to /api/events and receives connected handshake", async () => {
    const events: Array<{ event: string; data: string }> = [];

    const req = http.get(`${running.url}/api/events`, (res) => {
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");

      res.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split("\n");
        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.substring(6).trim();
          } else if (line === "" && currentEvent) {
            events.push({ event: currentEvent, data: currentData });
            currentEvent = "";
            currentData = "";
          }
        }
      });
    });

    // Wait for connection event
    await new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        const connected = events.find((e) => e.event === "connected");
        if (connected) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Timeout waiting for connected event"));
      }, 3000);
    });

    const connectedEvt = events.find((e) => e.event === "connected");
    expect(connectedEvt).toBeDefined();
    const data = JSON.parse(connectedEvt?.data ?? "{}");
    expect(data.clientId).toBeDefined();

    expect(running.broadcaster.clientCount).toBeGreaterThan(0);

    // Abort request and verify cleanup
    req.destroy();

    // Give small grace period for close event
    await new Promise((r) => setTimeout(r, 100));
  });

  it("broadcasts provider update event when single provider is refreshed", async () => {
    const receivedEvents: Array<{ event: string; data: string }> = [];

    const req = http.get(`${running.url}/api/events`, (res) => {
      res.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split("\n");
        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.substring(6).trim();
          } else if (line === "" && currentEvent) {
            receivedEvents.push({ event: currentEvent, data: currentData });
            currentEvent = "";
            currentData = "";
          }
        }
      });
    });

    // Wait for connected
    await new Promise((r) => setTimeout(r, 150));

    // Trigger single provider refresh
    await fetch(`${running.url}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "codex", force: true }),
    });

    // Wait for provider:updated event
    await new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        const updated = receivedEvents.find((e) => e.event === "provider:updated");
        if (updated) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error("Timeout waiting for provider:updated SSE event"));
      }, 3000);
    });

    const updatedEvt = receivedEvents.find((e) => e.event === "provider:updated");
    expect(updatedEvt).toBeDefined();
    const parsed = JSON.parse(updatedEvt?.data ?? "{}");
    expect(parsed.provider_id).toBe("codex");
    expect(parsed.snapshot).toBeDefined();

    req.destroy();
  });
});
