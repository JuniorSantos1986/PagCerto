import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { migrateToPostgres } from "../scripts/migrate-to-postgres.js";

const sourceSchema = `
  create table recurring_expenses (
    id integer primary key autoincrement,
    name text not null,
    amount_cents integer not null,
    category text not null,
    due_day integer not null,
    start_month text not null,
    active integer not null default 1,
    created_at text not null
  );

  create table expenses (
    id integer primary key autoincrement,
    name text not null,
    amount_cents integer not null,
    category text not null,
    due_date text not null,
    month text not null,
    paid integer not null default 0,
    paid_date text,
    recurring_id integer,
    created_at text not null,
    updated_at text not null
  );

  create table skipped_months (
    recurring_id integer not null,
    month text not null,
    primary key (recurring_id, month)
  );

  create table share_links (
    token text primary key,
    created_at text not null
  );
`;

function createSource({ seed = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gestor-migrate-"));
  const sqlite = new DatabaseSync(join(dir, "gestor.db"));

  sqlite.exec(sourceSchema);

  if (seed) {
    sqlite.exec(`
      insert into recurring_expenses
        (id, name, amount_cents, category, due_day, start_month, active, created_at)
      values (7, 'Internet', 9990, 'moradia', 10, '2026-01', 1, '2026-01-02T10:00:00.000Z');

      insert into expenses
        (id, name, amount_cents, category, due_date, month, paid, paid_date,
         recurring_id, created_at, updated_at)
      values
        (1, 'Mercado', 15000, 'alimentacao', '2026-10-05', '2026-10', 1,
         '2026-10-05', null, '2026-10-01T10:00:00.000Z', '2026-10-05T10:00:00.000Z'),
        (2, 'Internet', 9990, 'moradia', '2026-10-10', '2026-10', 0,
         null, 7, '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z');

      insert into skipped_months (recurring_id, month) values (7, '2026-11');
      insert into share_links (token, created_at)
        values ('token-abc', '2026-10-01T10:00:00.000Z');
    `);
  }

  return {
    sqlite,
    cleanup() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function createTarget() {
  const db = new PGlite();

  return {
    db,
    client: {
      exec: (sql) => db.exec(sql),
      query: (sql, params) => db.query(sql, params),
    },
    async cleanup() {
      await db.close();
    },
  };
}

describe("migração SQLite -> Postgres", () => {
  it("copia os dados preservando IDs e ajusta a sequence", async () => {
    const source = createSource();
    const target = await createTarget();

    try {
      const counts = await migrateToPostgres({
        sqlite: source.sqlite,
        client: target.client,
        log: () => {},
      });

      assert.deepEqual(counts, {
        expenses: 2,
        recurring: 1,
        skipped: 1,
        shares: 1,
      });

      const recurring = await target.db.query(
        "select id, name from recurring_expenses",
      );
      assert.deepEqual(recurring.rows, [{ id: "7", name: "Internet" }]);

      const expenses = await target.db.query(
        "select id, name, paid, recurring_id from expenses order by id",
      );
      assert.deepEqual(expenses.rows, [
        { id: 1, name: "Mercado", paid: true, recurring_id: null },
        { id: 2, name: "Internet", paid: false, recurring_id: "7" },
      ]);

      const skipped = await target.db.query(
        "select recurring_id, month from skipped_months",
      );
      assert.deepEqual(skipped.rows, [
        { recurring_id: "7", month: "2026-11" },
      ]);

      const shares = await target.db.query("select token from share_links");
      assert.deepEqual(shares.rows, [{ token: "token-abc" }]);

      const next = await target.db.query(
        "select nextval(pg_get_serial_sequence('expenses', 'id')) as id",
      );
      assert.equal(Number(next.rows[0].id), 3);
    } finally {
      await target.cleanup();
      source.cleanup();
    }
  });

  it("é idempotente ao rodar novamente", async () => {
    const source = createSource();
    const target = await createTarget();

    try {
      await migrateToPostgres({
        sqlite: source.sqlite,
        client: target.client,
        log: () => {},
      });
      const counts = await migrateToPostgres({
        sqlite: source.sqlite,
        client: target.client,
        log: () => {},
      });

      assert.deepEqual(counts, {
        expenses: 2,
        recurring: 1,
        skipped: 1,
        shares: 1,
      });

      const totals = await target.db.query(`
        select
          (select count(*) from expenses) as expenses,
          (select count(*) from recurring_expenses) as recurring,
          (select count(*) from skipped_months) as skipped,
          (select count(*) from share_links) as shares
      `);
      assert.deepEqual(totals.rows, [
        {
          expenses: 2,
          recurring: 1,
          skipped: 1,
          shares: 1,
        },
      ]);
    } finally {
      await target.cleanup();
      source.cleanup();
    }
  });

  it("cria o schema mesmo quando o SQLite está vazio", async () => {
    const source = createSource({ seed: false });
    const target = await createTarget();

    try {
      const counts = await migrateToPostgres({
        sqlite: source.sqlite,
        client: target.client,
        log: () => {},
      });

      assert.deepEqual(counts, {
        expenses: 0,
        recurring: 0,
        skipped: 0,
        shares: 0,
      });

      const tables = await target.db.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' order by table_name`,
      );
      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        ["expenses", "recurring_expenses", "share_links", "skipped_months"],
      );
    } finally {
      await target.cleanup();
      source.cleanup();
    }
  });
});
