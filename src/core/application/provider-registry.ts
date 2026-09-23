import type { ProviderAdapter } from "./provider-adapter.js";

/**
 * Registry of available provider adapters.
 * Manages adapter lifecycle and lookup while preserving deterministic ordering.
 */
export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Provider with id "${adapter.id}" is already registered`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  unregister(id: string): boolean {
    return this.adapters.delete(id);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  getIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  clear(): void {
    this.adapters.clear();
  }
}
