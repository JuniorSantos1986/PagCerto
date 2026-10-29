import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  currentMonth,
  diffDays,
  dueDateForMonth,
  isDate,
  isMonth,
  monthRange,
  todayISO,
} from "./date.js";

const { Pool } = pg;

function nowISO() {
  return new Date().toISOString();
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function serializeExpense(row) {
  return {
    id: String(row.id),
    name: row.name,
    amountCents: Number(row.amount_cents),
    category: row.category,
    dueDate: row.due_date,
    month: row.month,
    paid: Boolean(row.paid),
    paidDate: row.paid_date ?? null,
    recurringId: row.recurring_id ?? null,
    isRecurring: Boolean(row.recurring_id),
  };
}

export function resolveSsl(connectionString) {
  if (process.env.DATABASE_SSL === "0") return false;
  if (process.env.DATABASE_SSL === "1") return { rejectUnauthorized: false };
  if (connectionString?.includes("sslmode=disable")) return false;
  if (
    /\/\/(?:[^@/]+@)?(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(
      connectionString ?? "",
    )
  ) {
    return false;
  }
  return { rejectUnauthorized: false };
}

function createPool(options) {
  if (options.pool) return options.pool;

  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }

  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX) || 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: options.ssl ?? resolveSsl(connectionString),
  });
}

export async function initPostgresSchema(poolOrOptions = {}) {
  const pool =
    poolOrOptions && typeof poolOrOptions.query === "function"
      ? poolOrOptions
      : createPool(poolOrOptions);
  const schemaPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "postgres-schema.sql",
  );
  const schema = readFileSync(schemaPath, "utf8");
  await pool.query(schema);
}

export function createPostgresStore(options = {}) {
  const pool = createPool(options);

  async function ensureRecurringForMonth(month) {
    if (!isMonth(month)) return;

    const { rows: templates } = await pool.query(
      `SELECT r.* FROM recurring_expenses r
       WHERE r.active = true AND r.start_month <= $1
         AND NOT EXISTS (
           SELECT 1 FROM skipped_months s
           WHERE s.recurring_id = r.id AND s.month = $1
         )
         AND NOT EXISTS (
           SELECT 1 FROM expenses e
           WHERE e.recurring_id = r.id AND e.month = $1
         )`,
      [month],
    );

    for (const template of templates) {
      const timestamp = nowISO();
      await pool.query(
        `INSERT INTO expenses
          (name, amount_cents, category, due_date, month, paid, paid_date,
           recurring_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, false, null, $6, $7, $7)
         ON CONFLICT DO NOTHING`,
        [
          template.name,
          template.amount_cents,
          template.category,
          dueDateForMonth(month, Number(template.due_day)),
          month,
          template.id,
          timestamp,
        ],
      );
    }
  }

  async function ensureRecurringUntil(month) {
    if (!isMonth(month)) return;

    const { rows } = await pool.query(
      `SELECT start_month FROM recurring_expenses
       WHERE active = true AND start_month <= $1`,
      [month],
    );

    for (const template of rows) {
      for (const cursor of monthRange(template.start_month, month)) {
        await ensureRecurringForMonth(cursor);
      }
    }
  }

  async function getExpense(id) {
    const { rows } = await pool.query(
      "SELECT * FROM expenses WHERE id::text = $1",
      [String(id)],
    );
    return rows[0] ? serializeExpense(rows[0]) : null;
  }

  async function getShareToken() {
    const { rows } = await pool.query(
      "SELECT token FROM share_links ORDER BY created_at DESC LIMIT 1",
    );
    return rows[0]?.token ?? null;
  }

  return {
    async getExpense(id) {
      return getExpense(id);
    },

    async listExpenses(month) {
      await ensureRecurringUntil(month);
      const { rows } = await pool.query(
        `SELECT * FROM expenses
         WHERE month = $1
         ORDER BY due_date ASC, id ASC`,
        [month],
      );
      return rows.map(serializeExpense);
    },

    async getSummary(month) {
      await ensureRecurringUntil(month);
      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int AS total_count,
           COALESCE(SUM(amount_cents), 0)::bigint AS total_cents,
           COALESCE(SUM(amount_cents) FILTER (WHERE paid), 0)::bigint AS paid_cents,
           COALESCE(SUM(amount_cents) FILTER (WHERE NOT paid), 0)::bigint AS pending_cents,
           COUNT(*) FILTER (WHERE paid)::int AS paid_count,
           COUNT(*) FILTER (WHERE NOT paid)::int AS pending_count
         FROM expenses WHERE month = $1`,
        [month],
      );

      const row = rows[0];
      return {
        month,
        totalCount: Number(row.total_count),
        totalCents: Number(row.total_cents),
        paidCents: Number(row.paid_cents),
        pendingCents: Number(row.pending_cents),
        paidCount: Number(row.paid_count),
        pendingCount: Number(row.pending_count),
      };
    },

    async getUpcoming(days = 5) {
      const today = todayISO();
      const limitDate = shiftDate(today, days);

      const { rows } = await pool.query(
        `SELECT * FROM expenses
         WHERE paid = false AND due_date <= $1
         ORDER BY due_date ASC, id ASC
         LIMIT 20`,
        [limitDate],
      );

      return rows.map((row) => ({
        ...serializeExpense(row),
        daysUntil: diffDays(today, row.due_date),
      }));
    },

    async createExpense(input) {
      const timestamp = nowISO();
      const recurringId = input.recurring ? randomUUID() : null;
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        if (recurringId) {
          await client.query(
            `INSERT INTO recurring_expenses
              (id, name, amount_cents, category, due_day, start_month, active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
            [
              recurringId,
              input.name,
              input.amountCents,
              input.category,
              Number(input.dueDate.slice(8, 10)),
              input.month,
              timestamp,
            ],
          );
        }

        const { rows } = await client.query(
          `INSERT INTO expenses
            (name, amount_cents, category, due_date, month, paid, paid_date,
             recurring_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, false, null, $6, $7, $7)
           RETURNING *`,
          [
            input.name,
            input.amountCents,
            input.category,
            input.dueDate,
            input.month,
            recurringId,
            timestamp,
          ],
        );

        await client.query("COMMIT");
        return serializeExpense(rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateExpense(id, input) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const { rows: existingRows } = await client.query(
          "SELECT * FROM expenses WHERE id::text = $1 FOR UPDATE",
          [String(id)],
        );
        const existing = existingRows[0];
        if (!existing) {
          await client.query("ROLLBACK");
          return null;
        }

        if (existing.recurring_id) {
          const { rows: conflicts } = await client.query(
            `SELECT 1 FROM expenses
             WHERE recurring_id = $1 AND month = $2 AND id::text <> $3`,
            [existing.recurring_id, input.month, String(id)],
          );
          if (conflicts.length > 0) {
            const error = new Error(
              "Já existe uma cobrança desta recorrência no mês de destino.",
            );
            error.status = 409;
            throw error;
          }
        }

        const { rows } = await client.query(
          `UPDATE expenses
           SET name = $1, amount_cents = $2, category = $3,
               due_date = $4, month = $5, updated_at = $6
           WHERE id::text = $7
           RETURNING *`,
          [
            input.name,
            input.amountCents,
            input.category,
            input.dueDate,
            input.month,
            nowISO(),
            String(id),
          ],
        );

        if (existing.recurring_id) {
          await client.query(
            `UPDATE recurring_expenses
             SET name = $1, amount_cents = $2, category = $3, due_day = $4
             WHERE id = $5`,
            [
              input.name,
              input.amountCents,
              input.category,
              Number(input.dueDate.slice(8, 10)),
              existing.recurring_id,
            ],
          );
        }

        await client.query("COMMIT");
        return serializeExpense(rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async setPaid(id, paid, paidDate) {
      const value = Boolean(paid);
      const date = value ? (isDate(paidDate) ? paidDate : todayISO()) : null;
      const { rows } = await pool.query(
        `UPDATE expenses
         SET paid = $1, paid_date = $2, updated_at = $3
         WHERE id::text = $4
         RETURNING *`,
        [value, date, nowISO(), String(id)],
      );
      return rows[0] ? serializeExpense(rows[0]) : null;
    },

    async deleteExpense(id, scope = "single") {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const { rows: existingRows } = await client.query(
          "SELECT * FROM expenses WHERE id::text = $1 FOR UPDATE",
          [String(id)],
        );
        const existing = existingRows[0];
        if (!existing) {
          await client.query("ROLLBACK");
          return null;
        }

        if (scope === "series" && existing.recurring_id) {
          await client.query(
            "UPDATE recurring_expenses SET active = false WHERE id = $1",
            [existing.recurring_id],
          );
          await client.query(
            "DELETE FROM expenses WHERE recurring_id = $1 AND month >= $2",
            [existing.recurring_id, existing.month],
          );
          await client.query(
            "DELETE FROM skipped_months WHERE recurring_id = $1",
            [existing.recurring_id],
          );
          await client.query("COMMIT");
          return { scope: "series", recurringId: existing.recurring_id };
        }

        if (existing.recurring_id) {
          await client.query(
            `INSERT INTO skipped_months (recurring_id, month)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [existing.recurring_id, existing.month],
          );
        }

        await client.query("DELETE FROM expenses WHERE id::text = $1", [
          String(id),
        ]);
        await client.query("COMMIT");
        return { scope: "single", id: String(id) };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getShareToken() {
      return getShareToken();
    },

    async createShareToken() {
      const existing = await getShareToken();
      if (existing) return existing;

      const token = randomBytes(24).toString("base64url");
      await pool.query(
        "INSERT INTO share_links (token, created_at) VALUES ($1, $2)",
        [token, nowISO()],
      );
      return token;
    },

    async revokeShareTokens() {
      await pool.query("DELETE FROM share_links");
    },

    async isValidShareToken(token) {
      if (typeof token !== "string" || token.length < 16) return false;
      const { rows } = await pool.query(
        "SELECT 1 FROM share_links WHERE token = $1",
        [token],
      );
      return rows.length > 0;
    },

    async getMonthList() {
      const { rows } = await pool.query(
        "SELECT DISTINCT month FROM expenses ORDER BY month ASC",
      );
      const months = rows.map((row) => row.month);
      const current = currentMonth();
      if (!months.includes(current)) months.push(current);
      return months.sort();
    },

    pool,
  };
}
