import type { DatabaseSync } from "node:sqlite";
import {
  type AmountUnit,
  type LimitCategory,
  type ProviderError,
  type ProviderSnapshot,
  parseProviderSnapshot,
  type UsageLimit,
} from "../../../core/domain/index.js";

interface SnapshotRow {
  id: number;
  provider_id: string;
  display_name: string;
  installed: number;
  auth_state: string;
  usage_capability: string;
  status: string;
  source: string;
  cli_version: string | null;
  plan_label: string | null;
  errors_json: string;
  fetch_started_at: string;
  fetched_at: string;
  is_last_good: number;
}

interface LimitRow {
  id: number;
  snapshot_id: number;
  limit_id: string;
  name: string | null;
  category: string;
  window_minutes: number | null;
  used_percent: number | null;
  remaining_percent: number | null;
  used_amount: number | null;
  limit_amount: number | null;
  remaining_amount: number | null;
  amount_unit: string | null;
  resets_at: string | null;
  reset_countdown_seconds: number | null;
  model_id: string | null;
}

export class SnapshotRepository {
  constructor(private readonly db: DatabaseSync) {}

  saveSnapshot(snapshot: ProviderSnapshot): number {
    const valid = parseProviderSnapshot(snapshot);

    const insertSnapshotStmt = this.db.prepare(`
      INSERT INTO provider_snapshots (
        provider_id, display_name, installed, auth_state, usage_capability,
        status, source, cli_version, plan_label, errors_json,
        fetch_started_at, fetched_at, is_last_good
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const clearLastGoodStmt = this.db.prepare(`
      UPDATE provider_snapshots SET is_last_good = 0 WHERE provider_id = ?
    `);

    const insertLimitStmt = this.db.prepare(`
      INSERT INTO usage_limits (
        snapshot_id, limit_id, name, category, window_minutes,
        used_percent, remaining_percent, used_amount, limit_amount,
        remaining_amount, amount_unit, resets_at, reset_countdown_seconds, model_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      clearLastGoodStmt.run(valid.id);

      const result = insertSnapshotStmt.run(
        valid.id,
        valid.display_name,
        valid.installed ? 1 : 0,
        valid.auth_state,
        valid.usage_capability,
        valid.status,
        valid.source,
        valid.cli_version ?? null,
        valid.plan_label ?? null,
        JSON.stringify(valid.errors),
        valid.fetch_started_at,
        valid.fetched_at,
      );

      const snapshotId = Number(result.lastInsertRowid);

      for (const limit of valid.limits) {
        insertLimitStmt.run(
          snapshotId,
          limit.id,
          limit.name ?? null,
          limit.category,
          limit.window_minutes ?? null,
          limit.used_percent ?? null,
          limit.remaining_percent ?? null,
          limit.used_amount ?? null,
          limit.limit_amount ?? null,
          limit.remaining_amount ?? null,
          limit.amount_unit ?? null,
          limit.resets_at ?? null,
          limit.reset_countdown_seconds ?? null,
          limit.model_id ?? null,
        );
      }

      this.db.exec("COMMIT");
      return snapshotId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getLastGoodSnapshot(providerId: string): ProviderSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT * FROM provider_snapshots
         WHERE provider_id = ? AND is_last_good = 1
         ORDER BY fetched_at DESC LIMIT 1`,
      )
      .get(providerId) as unknown as SnapshotRow | undefined;

    if (!row) {
      return null;
    }

    return this.hydrateSnapshot(row);
  }

  getHistory(
    providerId: string,
    options?: { sinceUtc?: string; untilUtc?: string; limit?: number },
  ): ProviderSnapshot[] {
    let query = "SELECT * FROM provider_snapshots WHERE provider_id = ?";
    const params: (string | number | bigint | null)[] = [providerId];

    if (options?.sinceUtc) {
      query += " AND fetched_at >= ?";
      params.push(options.sinceUtc);
    }
    if (options?.untilUtc) {
      query += " AND fetched_at <= ?";
      params.push(options.untilUtc);
    }

    query += " ORDER BY fetched_at DESC";

    if (options?.limit && options.limit > 0) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as unknown as SnapshotRow[];
    return rows.map((r) => this.hydrateSnapshot(r));
  }

  pruneOlderThan(cutoffUtc: string): { prunedSnapshots: number } {
    // Preserve the current is_last_good snapshot for each provider!
    const result = this.db
      .prepare(
        `DELETE FROM provider_snapshots
         WHERE fetched_at < ? AND is_last_good = 0`,
      )
      .run(cutoffUtc);

    return { prunedSnapshots: Number(result.changes) };
  }

  private hydrateSnapshot(row: SnapshotRow): ProviderSnapshot {
    const limitRows = this.db
      .prepare("SELECT * FROM usage_limits WHERE snapshot_id = ? ORDER BY id ASC")
      .all(row.id) as unknown as LimitRow[];

    const limits: UsageLimit[] = limitRows.map((lr) => ({
      id: lr.limit_id,
      ...(lr.name ? { name: lr.name } : {}),
      category: lr.category as LimitCategory,
      ...(lr.window_minutes !== null ? { window_minutes: lr.window_minutes } : {}),
      ...(lr.used_percent !== null ? { used_percent: lr.used_percent } : {}),
      ...(lr.remaining_percent !== null ? { remaining_percent: lr.remaining_percent } : {}),
      ...(lr.used_amount !== null ? { used_amount: lr.used_amount } : {}),
      ...(lr.limit_amount !== null ? { limit_amount: lr.limit_amount } : {}),
      ...(lr.remaining_amount !== null ? { remaining_amount: lr.remaining_amount } : {}),
      ...(lr.amount_unit ? { amount_unit: lr.amount_unit as AmountUnit } : {}),
      ...(lr.resets_at ? { resets_at: lr.resets_at } : {}),
      ...(lr.reset_countdown_seconds !== null
        ? { reset_countdown_seconds: lr.reset_countdown_seconds }
        : {}),
      ...(lr.model_id ? { model_id: lr.model_id } : {}),
    }));

    let errors: ProviderError[] = [];
    try {
      errors = JSON.parse(row.errors_json);
    } catch {
      errors = [];
    }

    return parseProviderSnapshot({
      id: row.provider_id,
      display_name: row.display_name,
      installed: row.installed === 1,
      auth_state: row.auth_state,
      usage_capability: row.usage_capability,
      status: row.status,
      source: row.source,
      ...(row.cli_version ? { cli_version: row.cli_version } : {}),
      fetched_at: row.fetched_at,
      fetch_started_at: row.fetch_started_at,
      stale: false,
      ...(row.plan_label ? { plan_label: row.plan_label } : {}),
      limits,
      errors,
    });
  }
}
