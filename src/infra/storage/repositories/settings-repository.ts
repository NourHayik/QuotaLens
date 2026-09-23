import type { DatabaseSync } from "node:sqlite";
import {
  type AppSettings,
  appSettingsSchema,
  DEFAULT_APP_SETTINGS,
  type ProviderConfig,
  providerConfigSchema,
} from "../../../core/domain/index.js";

export class SettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  getSettings(): AppSettings {
    const rows = this.db.prepare("SELECT key, value FROM app_settings").all() as Array<{
      key: string;
      value: string;
    }>;

    if (rows.length === 0) {
      return { ...DEFAULT_APP_SETTINGS };
    }

    const map = new Map(rows.map((r) => [r.key, r.value]));

    const getInt = (key: string, fallback: number): number => {
      const val = map.get(key);
      if (val !== undefined) {
        const num = Number.parseInt(val, 10);
        if (!Number.isNaN(num)) return num;
      }
      return fallback;
    };

    const getBool = (key: string, fallback: boolean): boolean => {
      const val = map.get(key);
      if (val !== undefined) {
        return val === "true" || val === "1";
      }
      return fallback;
    };

    const parsed = {
      auto_refresh_enabled: getBool(
        "auto_refresh_enabled",
        DEFAULT_APP_SETTINGS.auto_refresh_enabled,
      ),
      refresh_interval_seconds: getInt(
        "refresh_interval_seconds",
        DEFAULT_APP_SETTINGS.refresh_interval_seconds,
      ),
      retention_days: getInt("retention_days", DEFAULT_APP_SETTINGS.retention_days),
      max_concurrency: getInt("max_concurrency", DEFAULT_APP_SETTINGS.max_concurrency),
      default_timeout_ms: getInt("default_timeout_ms", DEFAULT_APP_SETTINGS.default_timeout_ms),
      stagger_interval_ms: getInt("stagger_interval_ms", DEFAULT_APP_SETTINGS.stagger_interval_ms),
    };

    return appSettingsSchema.parse(parsed);
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = appSettingsSchema.parse({ ...current, ...partial });
    const now = new Date().toISOString();

    const upsertStmt = this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);

    for (const [key, value] of Object.entries(updated)) {
      upsertStmt.run(key, String(value), now);
    }

    return updated;
  }

  getProviderConfig(providerId: string): ProviderConfig | null {
    const row = this.db
      .prepare(
        `SELECT provider_id, enabled, display_name_override, timeout_ms_override, cooldown_seconds
         FROM provider_configs WHERE provider_id = ?`,
      )
      .get(providerId) as
      | {
          provider_id: string;
          enabled: number;
          display_name_override: string | null;
          timeout_ms_override: number | null;
          cooldown_seconds: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return providerConfigSchema.parse({
      provider_id: row.provider_id,
      enabled: row.enabled === 1,
      ...(row.display_name_override ? { display_name_override: row.display_name_override } : {}),
      ...(row.timeout_ms_override ? { timeout_ms_override: row.timeout_ms_override } : {}),
      cooldown_seconds: row.cooldown_seconds,
    });
  }

  getAllProviderConfigs(): ProviderConfig[] {
    const rows = this.db
      .prepare(
        `SELECT provider_id, enabled, display_name_override, timeout_ms_override, cooldown_seconds
         FROM provider_configs ORDER BY provider_id ASC`,
      )
      .all() as Array<{
      provider_id: string;
      enabled: number;
      display_name_override: string | null;
      timeout_ms_override: number | null;
      cooldown_seconds: number;
    }>;

    return rows.map((r) =>
      providerConfigSchema.parse({
        provider_id: r.provider_id,
        enabled: r.enabled === 1,
        ...(r.display_name_override ? { display_name_override: r.display_name_override } : {}),
        ...(r.timeout_ms_override ? { timeout_ms_override: r.timeout_ms_override } : {}),
        cooldown_seconds: r.cooldown_seconds,
      }),
    );
  }

  saveProviderConfig(config: ProviderConfig): void {
    const valid = providerConfigSchema.parse(config);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO provider_configs (provider_id, enabled, display_name_override, timeout_ms_override, cooldown_seconds, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_id) DO UPDATE SET
           enabled = excluded.enabled,
           display_name_override = excluded.display_name_override,
           timeout_ms_override = excluded.timeout_ms_override,
           cooldown_seconds = excluded.cooldown_seconds,
           updated_at = excluded.updated_at`,
      )
      .run(
        valid.provider_id,
        valid.enabled ? 1 : 0,
        valid.display_name_override ?? null,
        valid.timeout_ms_override ?? null,
        valid.cooldown_seconds,
        now,
      );
  }
}
