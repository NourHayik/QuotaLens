import type { DatabaseSync } from "node:sqlite";
import {
  type ProviderCapabilityRecord,
  providerCapabilityRecordSchema,
} from "../../../core/domain/index.js";

export class CapabilityRepository {
  constructor(private readonly db: DatabaseSync) {}

  saveCapability(record: ProviderCapabilityRecord): void {
    const valid = providerCapabilityRecordSchema.parse(record);

    this.db
      .prepare(
        `INSERT INTO provider_capabilities (
           provider_id, installed, cli_version, auth_state, usage_capability, source, reason, probed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_id) DO UPDATE SET
           installed = excluded.installed,
           cli_version = excluded.cli_version,
           auth_state = excluded.auth_state,
           usage_capability = excluded.usage_capability,
           source = excluded.source,
           reason = excluded.reason,
           probed_at = excluded.probed_at`,
      )
      .run(
        valid.provider_id,
        valid.installed ? 1 : 0,
        valid.cli_version ?? null,
        valid.auth_state,
        valid.usage_capability,
        valid.source,
        valid.reason ?? null,
        valid.probed_at,
      );
  }

  getCapability(providerId: string): ProviderCapabilityRecord | null {
    const row = this.db
      .prepare(
        `SELECT provider_id, installed, cli_version, auth_state, usage_capability, source, reason, probed_at
         FROM provider_capabilities WHERE provider_id = ?`,
      )
      .get(providerId) as
      | {
          provider_id: string;
          installed: number;
          cli_version: string | null;
          auth_state: string;
          usage_capability: string;
          source: string;
          reason: string | null;
          probed_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return providerCapabilityRecordSchema.parse({
      provider_id: row.provider_id,
      installed: row.installed === 1,
      ...(row.cli_version ? { cli_version: row.cli_version } : {}),
      auth_state: row.auth_state,
      usage_capability: row.usage_capability,
      source: row.source,
      ...(row.reason ? { reason: row.reason } : {}),
      probed_at: row.probed_at,
    });
  }
}
