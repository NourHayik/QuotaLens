import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderSnapshot } from "../src/core/domain/index.js";
import { DatabaseManager, SnapshotRepository } from "../src/infra/storage/index.js";

const snapshot: ProviderSnapshot = {
  id: "codex",
  display_name: "Codex",
  installed: true,
  auth_state: "authenticated",
  usage_capability: "supported",
  status: "ok",
  source: "app-server",
  cli_version: "0.42.0",
  fetched_at: "2026-09-15T08:00:00.000Z",
  fetch_started_at: "2026-09-15T07:59:58.000Z",
  stale: false,
  plan_label: "Plus",
  limits: [
    {
      id: "primary",
      name: "5-hour window",
      category: "rolling_window",
      window_minutes: 300,
      used_percent: 12,
      remaining_percent: 88,
      resets_at: "2026-09-15T10:00:00.000Z",
      reset_countdown_seconds: 7200,
    },
  ],
  errors: [],
};

describe("SQLite backup and restore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("round-trips last-good snapshots after a file copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "ai-limits-backup-"));
    dirs.push(dir);
    const sourcePath = join(dir, "ai-limits.db");
    const restorePath = join(dir, "restore.db");

    const source = new DatabaseManager({ dbPath: sourcePath });
    source.runMigrations();
    const sourceRepo = new SnapshotRepository(source.db);
    sourceRepo.saveSnapshot(snapshot);
    source.close();

    copyFileSync(sourcePath, restorePath);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(`${sourcePath}${suffix}`)) {
        copyFileSync(`${sourcePath}${suffix}`, `${restorePath}${suffix}`);
      }
    }

    const restored = new DatabaseManager({ dbPath: restorePath });
    restored.runMigrations();
    const restoredRepo = new SnapshotRepository(restored.db);
    const lastGood = restoredRepo.getLastGoodSnapshot("codex");
    restored.close();

    expect(lastGood?.id).toBe("codex");
    expect(lastGood?.plan_label).toBe("Plus");
    expect(lastGood?.limits[0]?.used_percent).toBe(12);
    expect(lastGood?.cli_version).toBe("0.42.0");
  });
});
