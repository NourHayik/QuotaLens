import { describe, expect, it } from "vitest";
import {
  getProviderCompatibilityMatrix,
  providerCompatibilitySchema,
  STATIC_PROVIDER_COMPATIBILITY_MATRIX,
} from "../src/core/domain/compatibility.js";
import type { ProviderCapabilityRecord } from "../src/core/domain/settings.js";

describe("Provider Compatibility Matrix", () => {
  it("contains all 5 priority providers in the static matrix", () => {
    const ids = STATIC_PROVIDER_COMPATIBILITY_MATRIX.map((e) => e.provider_id);
    expect(ids).toEqual(["codex", "kimi", "antigravity", "cursor", "opencode"]);
  });

  it("every static entry passes providerCompatibilitySchema validation", () => {
    for (const entry of STATIC_PROVIDER_COMPATIBILITY_MATRIX) {
      const parsed = providerCompatibilitySchema.parse(entry);
      expect(parsed.provider_id).toBe(entry.provider_id);
      expect(parsed.tested_version.length).toBeGreaterThan(0);
      expect(parsed.status_notes.length).toBeGreaterThan(0);
    }
  });

  it("accurately reflects supported and unsupported providers as documented", () => {
    const supported = STATIC_PROVIDER_COMPATIBILITY_MATRIX.filter(
      (e) => e.usage_capability === "supported",
    );
    const unsupported = STATIC_PROVIDER_COMPATIBILITY_MATRIX.filter(
      (e) => e.usage_capability === "unsupported",
    );

    expect(supported.map((e) => e.provider_id)).toEqual(["codex", "kimi", "antigravity"]);
    expect(unsupported.map((e) => e.provider_id)).toEqual(["cursor", "opencode"]);
  });

  it("merges dynamic probe records into matrix", () => {
    const mockProbes: ProviderCapabilityRecord[] = [
      {
        provider_id: "cursor",
        installed: true,
        cli_version: "2026.09.15-test",
        auth_state: "authenticated",
        usage_capability: "unsupported",
        source: "none",
        probed_at: "2026-09-15T10:30:00.000Z",
      },
      {
        provider_id: "opencode",
        installed: true,
        cli_version: "1.19.0",
        auth_state: "authenticated",
        usage_capability: "unsupported",
        source: "none",
        probed_at: "2026-09-15T10:35:00.000Z",
      },
    ];

    const matrix = getProviderCompatibilityMatrix(mockProbes);
    const cursor = matrix.find((e) => e.provider_id === "cursor");
    const opencode = matrix.find((e) => e.provider_id === "opencode");
    const codex = matrix.find((e) => e.provider_id === "codex");

    expect(cursor?.last_probe).toBe("2026-09-15T10:30:00.000Z");
    expect(cursor?.tested_version).toBe("2026.09.15-test");

    expect(opencode?.last_probe).toBe("2026-09-15T10:35:00.000Z");
    expect(opencode?.tested_version).toBe("1.19.0");

    // Provider without dynamic probe keeps static baseline and has no last_probe
    expect(codex?.last_probe).toBeUndefined();
    expect(codex?.tested_version).toBe("0.154.0");
  });
});
