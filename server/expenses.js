import { randomBytes, randomUUID } from "node:crypto";
import { CATEGORIES } from "./categories.js";
import {
  currentMonth,
  diffDays,
  dueDateForMonth,
  isDate,
  isMonth,
  monthOf,
  monthRange,
  todayISO,
} from "./date.js";

const MAX_NAME = 80;
const MAX_AMOUNT_CENTS = 99_999_999_999;

function nowISO() {
  return new Date().toISOString();
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
    paidDate: row.paid_date,
    recurringId: row.recurring_id,
    isRecurring: Boolean(row.recurring_id),
  };
}

function serializeRecurring(row) {
  return {
    id: row.id,
    name: row.name,
    amountCents: Number(row.amount_cents),
    category: row.category,
    dueDay: Number(row.due_day),
    startMonth: row.start_month,
    active: Boolean(row.active),
  };
}

export function validateExpenseInput(body) {
  const errors = [];
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const amountCents = body?.amountCents;
  const category = body?.category;
  const dueDate = body?.dueDate;

  if (name.length < 1 || name.length > MAX_NAME) {
    errors.push(`O nome deve ter entre 1 e ${MAX_NAME} caracteres.`);
  }
  if (
    !Number.isInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    errors.push("Informe um valor válido maior que zero.");
  }
  if (!CATEGORIES.includes(category)) {
    errors.push("Categoria inválida.");
  }
  if (!isDate(dueDate)) {
    errors.push("Informe uma data de vencimento válida.");
  }

  if (errors.length > 0) return { errors };

  return {
    value: {
      name,
      amountCents,
      category,
      dueDate,
      month: monthOf(dueDate),
      recurring: Boolean(body?.recurring),
    },
  };
}

export function ensureRecurringForMonth(db, month) {
  if (!isMonth(month)) return;
  const templates = db
    .prepare(
      "SELECT * FROM recurring_expenses WHERE active = 1 AND start_month <= ?",
    )
    .all(month);

  const hasSkipped = db.prepare(
    "SELECT 1 FROM skipped_months WHERE recurring_id = ? AND month = ?",
  );
  const hasInstance = db.prepare(
    "SELECT 1 FROM expenses WHERE recurring_id = ? AND month = ?",
  );
  const insert = db.prepare(`
    INSERT INTO expenses
      (name, amount_cents, category, due_date, month, paid, paid_date, recurring_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
  `);

  for (const template of templates) {
    if (hasSkipped.get(template.id, month)) continue;
    if (hasInstance.get(template.id, month)) continue;
    const timestamp = nowISO();
    insert.run(
      template.name,
      Number(template.amount_cents),
      template.category,
      dueDateForMonth(month, Number(template.due_day)),
      month,
      template.id,
      timestamp,
      timestamp,
    );
  }
}

function ensureRecurringUntil(db, month) {
  const templates = db
    .prepare(
      "SELECT start_month FROM recurring_expenses WHERE active = 1 AND start_month <= ?",
    )
    .all(month);
  for (const template of templates) {
    for (const cursor of monthRange(template.start_month, month)) {
      ensureRecurringForMonth(db, cursor);
    }
  }
}

export function listExpenses(db, month) {
  ensureRecurringUntil(db, month);
  const rows = db
    .prepare(
      "SELECT * FROM expenses WHERE month = ? ORDER BY due_date ASC, id ASC",
    )
    .all(month);
  return rows.map(serializeExpense);
}

export function getExpense(db, id) {
  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  return row ? serializeExpense(row) : null;
}

export function getSummary(db, month) {
  ensureRecurringUntil(db, month);
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total_count,
         COALESCE(SUM(amount_cents), 0) AS total_cents,
         COALESCE(SUM(CASE WHEN paid = 1 THEN amount_cents ELSE 0 END), 0) AS paid_cents,
         COALESCE(SUM(CASE WHEN paid = 0 THEN amount_cents ELSE 0 END), 0) AS pending_cents,
         COALESCE(SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END), 0) AS paid_count,
         COALESCE(SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END), 0) AS pending_count
       FROM expenses WHERE month = ?`,
    )
    .get(month);

  return {
    month,
    totalCount: Number(row.total_count),
    totalCents: Number(row.total_cents),
    paidCents: Number(row.paid_cents),
    pendingCents: Number(row.pending_cents),
    paidCount: Number(row.paid_count),
    pendingCount: Number(row.pending_count),
  };
}

export function createExpense(db, input) {
  const timestamp = nowISO();
  const recurringId = input.recurring ? randomUUID() : null;

  if (input.recurring) {
    db.prepare(
      `INSERT INTO recurring_expenses
        (id, name, amount_cents, category, due_day, start_month, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      recurringId,
      input.name,
      input.amountCents,
      input.category,
      Number(input.dueDate.slice(8, 10)),
      input.month,
      timestamp,
    );
  }

  const result = db
    .prepare(
      `INSERT INTO expenses
        (name, amount_cents, category, due_date, month, paid, paid_date, recurring_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.amountCents,
      input.category,
      input.dueDate,
      input.month,
      recurringId,
      timestamp,
      timestamp,
    );

  return getExpense(db, Number(result.lastInsertRowid));
}

export function updateExpense(db, id, input) {
  const existing = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  if (!existing) return null;

  if (existing.recurring_id) {
    const conflict = db
      .prepare(
        "SELECT 1 FROM expenses WHERE recurring_id = ? AND month = ? AND id <> ?",
      )
      .get(existing.recurring_id, input.month, id);
    if (conflict) {
      const error = new Error(
        "Já existe uma cobrança desta recorrência no mês de destino.",
      );
      error.status = 409;
      throw error;
    }
  }

  db.prepare(
    `UPDATE expenses
     SET name = ?, amount_cents = ?, category = ?, due_date = ?, month = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name,
    input.amountCents,
    input.category,
    input.dueDate,
    input.month,
    nowISO(),
    id,
  );

  if (existing.recurring_id) {
    db.prepare(
      `UPDATE recurring_expenses
       SET name = ?, amount_cents = ?, category = ?, due_day = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.amountCents,
      input.category,
      Number(input.dueDate.slice(8, 10)),
      existing.recurring_id,
    );
  }

  return getExpense(db, id);
}

export function setPaid(db, id, paid, paidDate) {
  const existing = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  if (!existing) return null;

  if (paid) {
    const date = isDate(paidDate) ? paidDate : todayISO();
    db.prepare(
      "UPDATE expenses SET paid = 1, paid_date = ?, updated_at = ? WHERE id = ?",
    ).run(date, nowISO(), id);
  } else {
    db.prepare(
      "UPDATE expenses SET paid = 0, paid_date = NULL, updated_at = ? WHERE id = ?",
    ).run(nowISO(), id);
  }

  return getExpense(db, id);
}

export function deleteExpense(db, id, scope = "single") {
  const existing = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  if (!existing) return null;

  if (scope === "series" && existing.recurring_id) {
    db.prepare(
      "UPDATE recurring_expenses SET active = 0 WHERE id = ?",
    ).run(existing.recurring_id);
    db.prepare(
      "DELETE FROM expenses WHERE recurring_id = ? AND month >= ?",
    ).run(existing.recurring_id, existing.month);
    db.prepare("DELETE FROM skipped_months WHERE recurring_id = ?").run(
      existing.recurring_id,
    );
    return { scope: "series", recurringId: existing.recurring_id };
  }

  if (existing.recurring_id) {
    db.prepare(
      "INSERT OR IGNORE INTO skipped_months (recurring_id, month) VALUES (?, ?)",
    ).run(existing.recurring_id, existing.month);
  }
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return { scope: "single", id: String(id) };
}

export function getUpcoming(db, days = 5) {
  const today = todayISO();
  const limitDate = shiftDate(today, days);
  const rows = db
    .prepare(
      `SELECT * FROM expenses
       WHERE paid = 0 AND due_date <= ?
       ORDER BY due_date ASC, id ASC
       LIMIT 20`,
    )
    .all(limitDate);

  return rows.map((row) => ({
    ...serializeExpense(row),
    daysUntil: diffDays(today, row.due_date),
  }));
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function listRecurring(db) {
  const rows = db
    .prepare("SELECT * FROM recurring_expenses ORDER BY created_at DESC")
    .all();
  return rows.map(serializeRecurring);
}

export function getShareToken(db) {
  const row = db
    .prepare("SELECT * FROM share_links ORDER BY created_at DESC LIMIT 1")
    .get();
  return row ? row.token : null;
}

export function createShareToken(db) {
  const existing = getShareToken(db);
  if (existing) return existing;
  const token = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO share_links (token, created_at) VALUES (?, ?)").run(
    token,
    nowISO(),
  );
  return token;
}

export function revokeShareTokens(db) {
  db.prepare("DELETE FROM share_links").run();
}

export function isValidShareToken(db, token) {
  if (typeof token !== "string" || token.length < 16) return false;
  return Boolean(
    db.prepare("SELECT 1 FROM share_links WHERE token = ?").get(token),
  );
}

export function getMonthList(db) {
  const rows = db
    .prepare("SELECT DISTINCT month FROM expenses ORDER BY month ASC")
    .all();
  const months = rows.map((row) => row.month);
  const current = currentMonth();
  if (!months.includes(current)) months.push(current);
  return months.sort();
}
