import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ALL_MIGRATIONS, type Migration } from "./migrations/001_initial_schema.js";

export interface DatabaseManagerOptions {
  /** Path to the SQLite database file or ":memory:". */
  dbPath?: string;
  /** Optional custom migrations array for testing or extension. */
  migrations?: ReadonlyArray<Migration>;
}

export function getDefaultDatabasePath(): string {
  if (process.env.AI_LIMITS_DB_PATH) {
    return process.env.AI_LIMITS_DB_PATH;
  }
  return join(homedir(), ".ai-limits", "ai-limits.db");
}

export class DatabaseManager {
  readonly db: DatabaseSync;
  readonly isInMemory: boolean;
  readonly dbPath: string;
  private readonly migrations: ReadonlyArray<Migration>;

  constructor(options?: DatabaseManagerOptions) {
    const rawPath = options?.dbPath ?? getDefaultDatabasePath();
    this.dbPath = rawPath;
    this.isInMemory = rawPath === ":memory:";
    this.migrations = options?.migrations ?? ALL_MIGRATIONS;

    if (!this.isInMemory) {
      mkdirSync(dirname(rawPath), { recursive: true });
    }

    this.db = new DatabaseSync(rawPath);
    this.configurePragmas();
  }

  static createInMemory(migrations?: ReadonlyArray<Migration>): DatabaseManager {
    return new DatabaseManager({
      dbPath: ":memory:",
      ...(migrations ? { migrations } : {}),
    });
  }

  private configurePragmas(): void {
    this.db.exec("PRAGMA foreign_keys = ON;");
    if (!this.isInMemory) {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
  }

  runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedRows = this.db.prepare("SELECT name FROM _migrations").all() as Array<{
      name: string;
    }>;
    const appliedSet = new Set(appliedRows.map((r) => r.name));

    for (const migration of this.migrations) {
      if (!appliedSet.has(migration.name)) {
        this.transaction(() => {
          migration.up(this.db);
          this.db
            .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
            .run(migration.name, new Date().toISOString());
        });
        appliedSet.add(migration.name);
      }
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
