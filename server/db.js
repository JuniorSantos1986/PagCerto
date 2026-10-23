import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "./categories.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPath = resolve(root, "data", "gestor.db");
const legacyPath = resolve(root, "data", "grana.db");

export { CATEGORIES };

function migrateLegacyDatabase(target) {
  if (target !== defaultPath) return;
  if (existsSync(target) || !existsSync(legacyPath)) return;

  renameSync(legacyPath, target);
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(`${legacyPath}${suffix}`)) {
      renameSync(`${legacyPath}${suffix}`, `${target}${suffix}`);
    }
  }
}

export function createDatabase(path = process.env.DATABASE_PATH || defaultPath) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
    migrateLegacyDatabase(path);
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category TEXT NOT NULL,
      due_date TEXT NOT NULL,
      month TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      paid_date TEXT,
      recurring_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses (month, due_date);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_month
      ON expenses (recurring_id, month)
      WHERE recurring_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category TEXT NOT NULL,
      due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
      start_month TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skipped_months (
      recurring_id TEXT NOT NULL,
      month TEXT NOT NULL,
      PRIMARY KEY (recurring_id, month)
    );

    CREATE TABLE IF NOT EXISTS share_links (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);

  return db;
}
