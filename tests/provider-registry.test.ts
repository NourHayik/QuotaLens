import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../src/core/application/index.js";
import { createFakeProvider } from "../src/providers/fake/index.js";

describe("ProviderRegistry", () => {
  it("registers adapters and preserves insertion order", () => {
    const registry = new ProviderRegistry();
    const p1 = createFakeProvider({ id: "p1", displayName: "Provider 1", mode: "healthy" });
    const p2 = createFakeProvider({ id: "p2", displayName: "Provider 2", mode: "healthy" });
    const p3 = createFakeProvider({ id: "p3", displayName: "Provider 3", mode: "healthy" });

    registry.register(p1);
    registry.register(p2);
    registry.register(p3);

    expect(registry.getIds()).toEqual(["p1", "p2", "p3"]);
    expect(registry.getAll().map((a) => a.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("throws when registering a duplicate provider ID", () => {
    const registry = new ProviderRegistry();
    const p1 = createFakeProvider({ id: "dup", displayName: "Provider 1", mode: "healthy" });
    const p2 = createFakeProvider({ id: "dup", displayName: "Provider 2", mode: "healthy" });

    registry.register(p1);
    expect(() => registry.register(p2)).toThrow(/already registered/);
  });

  it("supports get, has, unregister, and clear", () => {
    const registry = new ProviderRegistry();
    const p = createFakeProvider({ id: "my-id", displayName: "My Provider", mode: "healthy" });

    expect(registry.has("my-id")).toBe(false);
    expect(registry.get("my-id")).toBeUndefined();

    registry.register(p);
    expect(registry.has("my-id")).toBe(true);
    expect(registry.get("my-id")).toBe(p);

    expect(registry.unregister("my-id")).toBe(true);
    expect(registry.has("my-id")).toBe(false);

    registry.register(p);
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});
