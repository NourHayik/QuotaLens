import type { DatabaseSync } from "node:sqlite";
import {
  type ProviderHealthEvent,
  type ProviderStatus,
  providerHealthEventSchema,
} from "../../../core/domain/index.js";

interface HealthEventRow {
  id: number;
  provider_id: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number;
  occurred_at: string;
}

export class HealthEventRepository {
  constructor(private readonly db: DatabaseSync) {}

  record(event: ProviderHealthEvent): number {
    const valid = providerHealthEventSchema.parse(event);

    const result = this.db
      .prepare(
        `INSERT INTO provider_health_events (
           provider_id, status, error_code, error_message, duration_ms, occurred_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        valid.provider_id,
        valid.status,
        valid.error_code ?? null,
        valid.error_message ?? null,
        valid.duration_ms,
        valid.occurred_at,
      );

    return Number(result.lastInsertRowid);
  }

  getRecent(providerId: string, limit = 50): ProviderHealthEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider_id, status, error_code, error_message, duration_ms, occurred_at
         FROM provider_health_events
         WHERE provider_id = ?
         ORDER BY occurred_at DESC
         LIMIT ?`,
      )
      .all(providerId, limit) as unknown as HealthEventRow[];

    return rows.map((r) =>
      providerHealthEventSchema.parse({
        id: r.id,
        provider_id: r.provider_id,
        status: r.status as ProviderStatus,
        ...(r.error_code ? { error_code: r.error_code } : {}),
        ...(r.error_message ? { error_message: r.error_message } : {}),
        duration_ms: r.duration_ms,
        occurred_at: r.occurred_at,
      }),
    );
  }

  getLatest(providerId: string): ProviderHealthEvent | null {
    const row = this.db
      .prepare(
        `SELECT id, provider_id, status, error_code, error_message, duration_ms, occurred_at
         FROM provider_health_events
         WHERE provider_id = ?
         ORDER BY occurred_at DESC
         LIMIT 1`,
      )
      .get(providerId) as unknown as HealthEventRow | undefined;

    if (!row) {
      return null;
    }

    return providerHealthEventSchema.parse({
      id: row.id,
      provider_id: row.provider_id,
      status: row.status as ProviderStatus,
      ...(row.error_code ? { error_code: row.error_code } : {}),
      ...(row.error_message ? { error_message: row.error_message } : {}),
      duration_ms: row.duration_ms,
      occurred_at: row.occurred_at,
    });
  }

  pruneOlderThan(cutoffUtc: string): number {
    const result = this.db
      .prepare("DELETE FROM provider_health_events WHERE occurred_at < ?")
      .run(cutoffUtc);

    return Number(result.changes);
  }
}
