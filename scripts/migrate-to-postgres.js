import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { resolveSsl } from "../server/postgres-store.js";

function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(path);
      return;
    } catch {}
  }
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {}
}

loadEnvFile();

const { Client } = pg;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(
  resolve(root, "server", "postgres-schema.sql"),
  "utf8",
);

function readRows(sqlite, table) {
  try {
    return sqlite.prepare(`SELECT * FROM ${table}`).all();
  } catch (error) {
    if (String(error?.message).includes("no such table")) return [];
    throw error;
  }
}

export async function migrateToPostgres({ sqlite, client, log = console.log }) {
  if (typeof client.exec === "function") {
    await client.exec(schema);
  } else {
    await client.query(schema);
  }

  const recurring = readRows(sqlite, "recurring_expenses");
  const expenses = readRows(sqlite, "expenses");
  const skipped = readRows(sqlite, "skipped_months");
  const shares = readRows(sqlite, "share_links");
  const counts = {
    expenses: expenses.length,
    recurring: recurring.length,
    skipped: skipped.length,
    shares: shares.length,
  };

  if (!expenses.length && !recurring.length && !skipped.length && !shares.length) {
    log("Nenhum registro encontrado no SQLite. Nada a migrar.");
    return counts;
  }

  await client.query("BEGIN");

  try {
    for (const row of recurring) {
      await client.query(
        `INSERT INTO recurring_expenses
          (id, name, amount_cents, category, due_day, start_month, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [
          String(row.id),
          row.name,
          Number(row.amount_cents),
          row.category,
          Number(row.due_day),
          row.start_month,
          Boolean(row.active),
          row.created_at,
        ],
      );
    }

    for (const row of expenses) {
      await client.query(
        `INSERT INTO expenses
          (id, name, amount_cents, category, due_date, month, paid, paid_date,
           recurring_id, created_at, updated_at)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT DO NOTHING`,
        [
          Number(row.id),
          row.name,
          Number(row.amount_cents),
          row.category,
          row.due_date,
          row.month,
          Boolean(row.paid),
          row.paid_date ?? null,
          row.recurring_id == null ? null : String(row.recurring_id),
          row.created_at,
          row.updated_at,
        ],
      );
    }

    for (const row of skipped) {
      await client.query(
        `INSERT INTO skipped_months (recurring_id, month)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [String(row.recurring_id), row.month],
      );
    }

    for (const row of shares) {
      await client.query(
        `INSERT INTO share_links (token, created_at)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [row.token, row.created_at],
      );
    }

    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('expenses', 'id'),
         COALESCE((SELECT MAX(id) FROM expenses), 1),
         (SELECT MAX(id) FROM expenses) IS NOT NULL
       )`,
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  log(
    `Migração concluída: ${counts.expenses} despesas, ${counts.recurring} recorrências, ${counts.skipped} meses ignorados e ${counts.shares} links.`,
  );

  return counts;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("Defina DATABASE_URL com a connection string do Postgres.");
    process.exitCode = 1;
    return;
  }

  const sourcePath =
    process.env.DATABASE_PATH || resolve(root, "data", "gestor.db");

  if (!existsSync(sourcePath)) {
    console.error(`Banco SQLite não encontrado em ${sourcePath}.`);
    process.exitCode = 1;
    return;
  }

  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  const client = new Client({
    connectionString,
    ssl: resolveSsl(connectionString),
  });

  try {
    await client.connect();
    await migrateToPostgres({ sqlite, client });
  } finally {
    sqlite.close();
    await client.end().catch(() => {});
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
