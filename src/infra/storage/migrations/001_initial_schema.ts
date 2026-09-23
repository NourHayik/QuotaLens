import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  readonly name: string;
  up(db: DatabaseSync): void;
}

export const initialSchemaMigration: Migration = {
  name: "001_initial_schema",
  up(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_configs (
        provider_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        display_name_override TEXT,
        timeout_ms_override INTEGER,
        cooldown_seconds INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_capabilities (
        provider_id TEXT PRIMARY KEY,
        installed INTEGER NOT NULL,
        cli_version TEXT,
        auth_state TEXT NOT NULL,
        usage_capability TEXT NOT NULL,
        source TEXT NOT NULL,
        reason TEXT,
        probed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        installed INTEGER NOT NULL,
        auth_state TEXT NOT NULL,
        usage_capability TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        cli_version TEXT,
        plan_label TEXT,
        errors_json TEXT NOT NULL DEFAULT '[]',
        fetch_started_at TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        is_last_good INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_provider_last_good
        ON provider_snapshots (provider_id, is_last_good);

      CREATE INDEX IF NOT EXISTS idx_snapshots_provider_fetched_at
        ON provider_snapshots (provider_id, fetched_at DESC);

      CREATE TABLE IF NOT EXISTS usage_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES provider_snapshots(id) ON DELETE CASCADE,
        limit_id TEXT NOT NULL,
        name TEXT,
        category TEXT NOT NULL,
        window_minutes INTEGER,
        used_percent REAL,
        remaining_percent REAL,
        used_amount REAL,
        limit_amount REAL,
        remaining_amount REAL,
        amount_unit TEXT,
        resets_at TEXT,
        reset_countdown_seconds INTEGER,
        model_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_usage_limits_snapshot_id
        ON usage_limits (snapshot_id);

      CREATE TABLE IF NOT EXISTS provider_health_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        duration_ms INTEGER NOT NULL,
        occurred_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_health_events_provider_occurred_at
        ON provider_health_events (provider_id, occurred_at DESC);
    `);
  },
};

export const ALL_MIGRATIONS: ReadonlyArray<Migration> = [initialSchemaMigration];
