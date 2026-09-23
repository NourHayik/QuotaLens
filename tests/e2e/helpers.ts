import type { ProviderAdapter } from "../../src/core/application/index.js";
import {
  createDemoProvider,
  type DemoProviderMode,
  type DemoProviderOptions,
} from "../../src/providers/demo/index.js";

export function createMutableDemoProvider(
  options: Omit<DemoProviderOptions, "mode">,
  getMode: () => DemoProviderMode,
): ProviderAdapter {
  const current = (): ProviderAdapter => createDemoProvider({ ...options, mode: getMode() });
  return {
    id: options.id,
    displayName: options.displayName,
    detect: (signal) => current().detect(signal),
    getVersion: (signal) => current().getVersion(signal),
    getAuthState: (signal) => current().getAuthState(signal),
    getCapabilities: (signal) => current().getCapabilities(signal),
    fetchUsage: (signal) => current().fetchUsage(signal),
  };
}
