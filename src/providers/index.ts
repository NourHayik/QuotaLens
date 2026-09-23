import type { ProviderRegistry } from "../core/application/index.js";
import { AntigravityAdapter } from "./antigravity/index.js";
import { CodexAdapter } from "./codex/index.js";
import { CursorAdapter } from "./cursor/index.js";
import { KimiAdapter } from "./kimi/index.js";
import { OpenCodeAdapter } from "./opencode/index.js";

export * from "./antigravity/index.js";
export * from "./codex/index.js";
export * from "./cursor/index.js";
export * from "./demo/index.js";
export * from "./fake/index.js";
export * from "./kimi/index.js";
export * from "./opencode/index.js";

/**
 * Registers all production provider adapters into the registry.
 * Phase 4: OpenAI Codex.
 * Phase 5: Kimi Code, Google Antigravity.
 * Phase 6: Cursor, OpenCode Go.
 */
export function registerDefaultProviders(registry: ProviderRegistry): void {
  registry.register(new CodexAdapter());
  registry.register(new KimiAdapter());
  registry.register(new AntigravityAdapter());
  registry.register(new CursorAdapter());
  registry.register(new OpenCodeAdapter());
}
