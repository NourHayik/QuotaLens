import { describe, expect, it } from "vitest";
import { createCliContext } from "../src/cli/context.js";
import {
  assertLoopbackHost,
  isLoopbackHost,
  NonLoopbackBindError,
  startServer,
} from "../src/server/index.js";

describe("Loopback security enforcement", () => {
  it("accepts valid loopback addresses", () => {
    expect(() => assertLoopbackHost("127.0.0.1")).not.toThrow();
    expect(() => assertLoopbackHost("::1")).not.toThrow();
    expect(() => assertLoopbackHost("localhost")).not.toThrow();
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
  });

  it("strictly rejects 0.0.0.0 and wildcard binds", () => {
    expect(() => assertLoopbackHost("0.0.0.0")).toThrow(NonLoopbackBindError);
    expect(() => assertLoopbackHost("::")).toThrow(NonLoopbackBindError);
    expect(() => assertLoopbackHost("*")).toThrow(NonLoopbackBindError);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
  });

  it("strictly rejects LAN, external IPs, and remote hostnames", () => {
    expect(() => assertLoopbackHost("192.168.1.100")).toThrow(NonLoopbackBindError);
    expect(() => assertLoopbackHost("10.0.0.1")).toThrow(NonLoopbackBindError);
    expect(() => assertLoopbackHost("example.com")).toThrow(NonLoopbackBindError);
    expect(() => assertLoopbackHost("my-server.local")).toThrow(NonLoopbackBindError);
  });

  it("refuses to start server if non-loopback host is configured", async () => {
    const ctx = createCliContext({ dbPath: ":memory:", demo: true });
    try {
      await expect(startServer(ctx, { host: "0.0.0.0", port: 3999 })).rejects.toThrow(
        NonLoopbackBindError,
      );

      await expect(startServer(ctx, { host: "192.168.1.5", port: 3999 })).rejects.toThrow(
        NonLoopbackBindError,
      );
    } finally {
      ctx.dispose();
    }
  });

  it("binds successfully to 127.0.0.1 loopback", async () => {
    const ctx = createCliContext({ dbPath: ":memory:", demo: true });
    let running: Awaited<ReturnType<typeof startServer>> | null = null;
    try {
      // Use port 0 to let OS assign an available ephemeral port
      running = await startServer(ctx, { host: "127.0.0.1", port: 0 });
      expect(running.url).toContain("http://127.0.0.1:");
      expect(running.port).toBeGreaterThan(0);

      const res = await fetch(`${running.url}/api/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { loopback_only: boolean; status: string };
      expect(data.loopback_only).toBe(true);
      expect(data.status).toBe("ok");
    } finally {
      if (running) {
        await running.close();
      }
      ctx.dispose();
    }
  });
});
