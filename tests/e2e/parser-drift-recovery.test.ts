import { describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import { ProviderRegistry } from "../../src/core/application/index.js";
import { createDemoProvider } from "../../src/providers/demo/index.js";
import { createMutableDemoProvider } from "./helpers.js";

describe("E2E: parser drift produces stale last-good then recovers", () => {
  it("preserves last-good limits on parse_error and recovers on the next refresh", async () => {
    let mode: "healthy" | "parse_error" = "healthy";
    const registry = new ProviderRegistry();
    registry.register(
      createMutableDemoProvider(
        { id: "kimi", displayName: "Kimi Code", cliVersion: "1.2.0" },
        () => mode,
      ),
    );
    registry.register(createDemoProvider({ id: "codex", displayName: "Codex", mode: "healthy" }));

    const context = createCliContext({ dbPath: ":memory:", registry });
    context.settingsRepo.updateSettings({ stagger_interval_ms: 0 });

    try {
      const t0 = new Date("2026-09-15T08:00:00.000Z");
      const first = await context.refreshService.refreshAll({ now: t0, force: true });
      const kimi1 = first.providers.find((p) => p.id === "kimi");
      expect(kimi1?.status).toBe("ok");
      expect(kimi1?.stale).toBe(false);
      expect(kimi1?.limits.length).toBeGreaterThan(0);
      const lastGoodCount = kimi1?.limits.length ?? 0;
      const lastGoodIds = (kimi1?.limits ?? []).map((l) => l.id);

      mode = "parse_error";
      const t1 = new Date("2026-09-15T08:10:00.000Z");
      const second = await context.refreshService.refreshAll({ now: t1, force: true });
      const kimi2 = second.providers.find((p) => p.id === "kimi");
      expect(kimi2?.status).toBe("parse_error");
      expect(kimi2?.stale).toBe(true);
      expect(kimi2?.errors[0]?.code).toBe("parse_error");
      expect(kimi2?.limits).toHaveLength(lastGoodCount);
      expect(kimi2?.limits.map((l) => l.id)).toEqual(lastGoodIds);

      const dbLastGood = context.snapshotRepo.getLastGoodSnapshot("kimi");
      expect(dbLastGood?.status).toBe("ok");

      mode = "healthy";
      const t2 = new Date("2026-09-15T08:20:00.000Z");
      const third = await context.refreshService.refreshAll({ now: t2, force: true });
      const kimi3 = third.providers.find((p) => p.id === "kimi");
      expect(kimi3?.status).toBe("ok");
      expect(kimi3?.stale).toBe(false);
      expect(kimi3?.limits.length).toBeGreaterThan(0);
      expect(kimi3?.errors).toEqual([]);
    } finally {
      context.dispose();
    }
  });
});
