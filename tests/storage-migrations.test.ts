import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseManager } from "../src/infra/storage/index.js";

describe("DatabaseManager and Migrations", () => {
  let dbManager: DatabaseManager | undefined;
  let tempDiskDbPath: string | undefined;

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
      dbManager = undefined;
    }
    if (tempDiskDbPath) {
      try {
        rmSync(tempDiskDbPath, { force: true });
      } catch {
        // ignore cleanup error
      }
      tempDiskDbPath = undefined;
    }
  });

  it("runs initial migration on empty in-memory database", () => {
    dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    const tables = dbManager.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("_migrations");
    expect(tableNames).toContain("app_settings");
    expect(tableNames).toContain("provider_configs");
    expect(tableNames).toContain("provider_capabilities");
    expect(tableNames).toContain("provider_snapshots");
    expect(tableNames).toContain("usage_limits");
    expect(tableNames).toContain("provider_health_events");

    const migrations = dbManager.db.prepare("SELECT name FROM _migrations").all() as Array<{
      name: string;
    }>;
    expect(migrations).toEqual([{ name: "001_initial_schema" }]);
  });

  it("is idempotent when running migrations multiple times", () => {
    dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();
    // Run second time
    expect(() => dbManager?.runMigrations()).not.toThrow();

    const migrations = dbManager.db.prepare("SELECT name FROM _migrations").all() as Array<{
      name: string;
    }>;
    expect(migrations).toHaveLength(1);
  });

  it("enforces foreign key cascading deletes on usage_limits", () => {
    dbManager = DatabaseManager.createInMemory();
    dbManager.runMigrations();

    // Insert snapshot
    const snapResult = dbManager.db
      .prepare(
        `INSERT INTO provider_snapshots (
           provider_id, display_name, installed, auth_state, usage_capability,
           status, source, fetch_started_at, fetched_at, is_last_good
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        "test-provider",
        "Test Provider",
        1,
        "authenticated",
        "supported",
        "ok",
        "fixture",
        new Date().toISOString(),
        new Date().toISOString(),
      );

    const snapshotId = Number(snapResult.lastInsertRowid);

    // Insert usage limit
    dbManager.db
      .prepare(
        `INSERT INTO usage_limits (
           snapshot_id, limit_id, category, used_percent, remaining_percent
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(snapshotId, "primary", "rolling_window", 25, 75);

    expect(dbManager.db.prepare("SELECT COUNT(*) as count FROM usage_limits").get()).toEqual({
      count: 1,
    });

    // Delete snapshot -> cascading delete on usage_limits
    dbManager.db.prepare("DELETE FROM provider_snapshots WHERE id = ?").run(snapshotId);

    expect(dbManager.db.prepare("SELECT COUNT(*) as count FROM usage_limits").get()).toEqual({
      count: 0,
    });
  });

  it("creates directory and opens disk-based database safely", () => {
    tempDiskDbPath = join(
      tmpdir(),
      `ai-limits-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );

    dbManager = new DatabaseManager({ dbPath: tempDiskDbPath });
    dbManager.runMigrations();

    const check = dbManager.db.prepare("SELECT COUNT(*) as count FROM _migrations").get();
    expect(check).toEqual({ count: 1 });
  });
});
