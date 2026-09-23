import { describe, expect, it } from "vitest";
import { getProviderSnapshot } from "../src/core/application/index.js";
import { providerSnapshotSchema } from "../src/core/domain/index.js";
import { createFakeProvider } from "../src/providers/fake/index.js";

describe("fake provider through the application service", () => {
  it("returns a schema-valid normalized snapshot", async () => {
    const adapter = createFakeProvider({ mode: "healthy" });
    const snapshot = await getProviderSnapshot(adapter, { timeoutMs: 5_000 });

    expect(() => providerSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.id).toBe("fake");
    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("fixture");
    expect(snapshot.installed).toBe(true);
    expect(snapshot.auth_state).toBe("authenticated");
    expect(snapshot.limits.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.errors).toEqual([]);
  });

  it("maps a hung acquisition to status timeout with empty limits", async () => {
    const adapter = createFakeProvider({ mode: "hang" });
    const started = Date.now();
    const snapshot = await getProviderSnapshot(adapter, { timeoutMs: 500 });

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(snapshot.status).toBe("timeout");
    expect(snapshot.limits).toEqual([]);
    expect(snapshot.errors[0]?.code).toBe("timeout");
    expect(() => providerSnapshotSchema.parse(snapshot)).not.toThrow();
  });
});
