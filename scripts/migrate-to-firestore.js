import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath =
  process.env.DATABASE_PATH || resolve(root, "data", "gestor.db");

if (!existsSync(sourcePath)) {
  console.error(`Banco SQLite não encontrado em ${sourcePath}.`);
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
if (getApps().length === 0) {
  if (projectId) initializeApp({ projectId });
  else initializeApp();
}

const firestore = getFirestore();
const sqlite = new DatabaseSync(sourcePath, { readOnly: true });

const BATCH_LIMIT = 400;

function readRows(table) {
  try {
    return sqlite.prepare(`SELECT * FROM ${table}`).all();
  } catch {
    return [];
  }
}

async function writeBatch(entries) {
  for (let index = 0; index < entries.length; index += BATCH_LIMIT) {
    const batch = firestore.batch();
    for (const entry of entries.slice(index, index + BATCH_LIMIT)) {
      batch.set(firestore.collection(entry.collection).doc(entry.id), entry.data);
    }
    await batch.commit();
  }
}

const expenses = readRows("expenses").map((row) => ({
  collection: "expenses",
  id: String(row.id),
  data: {
    name: row.name,
    amountCents: Number(row.amount_cents),
    category: row.category,
    dueDate: row.due_date,
    month: row.month,
    paid: Boolean(row.paid),
    paidDate: row.paid_date ?? null,
    recurringId: row.recurring_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  },
}));

const recurring = readRows("recurring_expenses").map((row) => ({
  collection: "recurringExpenses",
  id: row.id,
  data: {
    name: row.name,
    amountCents: Number(row.amount_cents),
    category: row.category,
    dueDay: Number(row.due_day),
    startMonth: row.start_month,
    active: Boolean(row.active),
    createdAt: row.created_at,
  },
}));

const skipped = readRows("skipped_months").map((row) => ({
  collection: "skippedMonths",
  id: `${row.recurring_id}_${row.month}`,
  data: { recurringId: row.recurring_id, month: row.month },
}));

const shares = readRows("share_links").map((row) => ({
  collection: "shareLinks",
  id: row.token,
  data: { createdAt: row.created_at },
}));

const entries = [...expenses, ...recurring, ...skipped, ...shares];

if (entries.length === 0) {
  console.log("Nenhum registro encontrado no SQLite. Nada a migrar.");
  process.exit(0);
}

await writeBatch(entries);

console.log(
  `Migração concluída: ${expenses.length} despesas, ${recurring.length} recorrências, ${skipped.length} meses ignorados e ${shares.length} links.`,
);
