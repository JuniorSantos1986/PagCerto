import { randomBytes, randomUUID } from "node:crypto";
import {
  currentMonth,
  diffDays,
  dueDateForMonth,
  isDate,
  monthRange,
  todayISO,
} from "./date.js";

const EXPENSES = "expenses";
const RECURRING = "recurringExpenses";
const SKIPPED = "skippedMonths";
const SHARES = "shareLinks";

const BATCH_LIMIT = 400;

function nowISO() {
  return new Date().toISOString();
}

function recurringInstanceId(recurringId, month) {
  return `rec_${recurringId}_${month}`;
}

function skippedId(recurringId, month) {
  return `${recurringId}_${month}`;
}

function serializeExpense(id, data) {
  return {
    id,
    name: data.name,
    amountCents: Number(data.amountCents),
    category: data.category,
    dueDate: data.dueDate,
    month: data.month,
    paid: Boolean(data.paid),
    paidDate: data.paidDate ?? null,
    recurringId: data.recurringId ?? null,
    isRecurring: Boolean(data.recurringId),
  };
}

function sortExpenses(a, b) {
  const byDate = a.dueDate.localeCompare(b.dueDate);
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

async function ignoreNotFound(promise) {
  try {
    await promise;
  } catch (error) {
    if (error?.code !== 5) throw error;
  }
}

async function deleteRefs(db, refs) {
  for (let index = 0; index < refs.length; index += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(index, index + BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

async function resolveDatabase(database) {
  if (database) return database;

  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  if (getApps().length === 0) {
    const projectId =
      process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
    const credentials =
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

    if (credentials) {
      const serviceAccount = JSON.parse(credentials);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: projectId || serviceAccount.project_id,
      });
    } else if (projectId) {
      initializeApp({ projectId });
    } else {
      initializeApp();
    }
  }

  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore();
}

export async function createFirestoreStore(database) {
  const db = await resolveDatabase(database);

  async function ensureRecurringUntil(month) {
    const templates = await db
      .collection(RECURRING)
      .where("active", "==", true)
      .get();

    for (const template of templates.docs) {
      const data = template.data();
      if (!data.startMonth || data.startMonth > month) continue;

      const [skipped, instances] = await Promise.all([
        db.collection(SKIPPED).where("recurringId", "==", template.id).get(),
        db
          .collection(EXPENSES)
          .where("recurringId", "==", template.id)
          .select("month")
          .get(),
      ]);

      const skippedMonths = new Set(
        skipped.docs.map((doc) => doc.data().month),
      );
      const existingMonths = new Set(
        instances.docs.map((doc) => doc.data().month),
      );

      let batch = db.batch();
      let pending = 0;
      const flush = async () => {
        if (pending === 0) return;
        await batch.commit();
        batch = db.batch();
        pending = 0;
      };

      for (const cursor of monthRange(data.startMonth, month)) {
        if (skippedMonths.has(cursor) || existingMonths.has(cursor)) continue;
        const timestamp = nowISO();
        batch.set(
          db
            .collection(EXPENSES)
            .doc(recurringInstanceId(template.id, cursor)),
          {
            name: data.name,
            amountCents: Number(data.amountCents),
            category: data.category,
            dueDate: dueDateForMonth(cursor, Number(data.dueDay)),
            month: cursor,
            paid: false,
            paidDate: null,
            recurringId: template.id,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          { merge: true },
        );
        pending += 1;
        if (pending >= BATCH_LIMIT) await flush();
      }
      await flush();
    }
  }

  async function getExpense(id) {
    const snap = await db.collection(EXPENSES).doc(String(id)).get();
    return snap.exists ? serializeExpense(snap.id, snap.data()) : null;
  }

  async function getShareToken() {
    const snap = await db.collection(SHARES).get();
    if (snap.empty) return null;
    const latest = snap.docs
      .slice()
      .sort((a, b) =>
        String(a.data().createdAt ?? "").localeCompare(
          String(b.data().createdAt ?? ""),
        ),
      )
      .at(-1);
    return latest ? latest.id : null;
  }

  return {
    async getExpense(id) {
      return getExpense(id);
    },

    async listExpenses(month) {
      await ensureRecurringUntil(month);
      const snap = await db
        .collection(EXPENSES)
        .where("month", "==", month)
        .get();
      return snap.docs
        .map((doc) => serializeExpense(doc.id, doc.data()))
        .sort(sortExpenses);
    },

    async getSummary(month) {
      await ensureRecurringUntil(month);
      const snap = await db
        .collection(EXPENSES)
        .where("month", "==", month)
        .get();

      const summary = {
        month,
        totalCount: 0,
        totalCents: 0,
        paidCents: 0,
        pendingCents: 0,
        paidCount: 0,
        pendingCount: 0,
      };

      for (const doc of snap.docs) {
        const data = doc.data();
        const amount = Number(data.amountCents) || 0;
        summary.totalCount += 1;
        summary.totalCents += amount;
        if (data.paid) {
          summary.paidCount += 1;
          summary.paidCents += amount;
        } else {
          summary.pendingCount += 1;
          summary.pendingCents += amount;
        }
      }

      return summary;
    },

    async getUpcoming(days = 5) {
      const today = todayISO();
      const limitDate = shiftDate(today, days);
      const snap = await db
        .collection(EXPENSES)
        .where("paid", "==", false)
        .get();

      return snap.docs
        .map((doc) => serializeExpense(doc.id, doc.data()))
        .filter((expense) => expense.dueDate <= limitDate)
        .sort(sortExpenses)
        .slice(0, 20)
        .map((expense) => ({
          ...expense,
          daysUntil: diffDays(today, expense.dueDate),
        }));
    },

    async createExpense(input) {
      const timestamp = nowISO();
      const recurringId = input.recurring ? randomUUID() : null;
      const data = {
        name: input.name,
        amountCents: input.amountCents,
        category: input.category,
        dueDate: input.dueDate,
        month: input.month,
        paid: false,
        paidDate: null,
        recurringId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      if (!recurringId) {
        const ref = await db.collection(EXPENSES).add(data);
        return serializeExpense(ref.id, data);
      }

      const batch = db.batch();
      batch.set(db.collection(RECURRING).doc(recurringId), {
        name: input.name,
        amountCents: input.amountCents,
        category: input.category,
        dueDay: Number(input.dueDate.slice(8, 10)),
        startMonth: input.month,
        active: true,
        createdAt: timestamp,
      });
      const expenseId = recurringInstanceId(recurringId, input.month);
      batch.set(db.collection(EXPENSES).doc(expenseId), data);
      await batch.commit();

      return serializeExpense(expenseId, data);
    },

    async updateExpense(id, input) {
      const docId = String(id);
      const ref = db.collection(EXPENSES).doc(docId);
      const snap = await ref.get();
      if (!snap.exists) return null;

      const existing = snap.data();
      const recurringId = existing.recurringId ?? null;
      const targetId = recurringId
        ? recurringInstanceId(recurringId, input.month)
        : docId;

      if (recurringId && targetId !== docId) {
        const conflict = await db.collection(EXPENSES).doc(targetId).get();
        if (conflict.exists) {
          const error = new Error(
            "Já existe uma cobrança desta recorrência no mês de destino.",
          );
          error.status = 409;
          throw error;
        }
      }

      const data = {
        name: input.name,
        amountCents: input.amountCents,
        category: input.category,
        dueDate: input.dueDate,
        month: input.month,
        paid: Boolean(existing.paid),
        paidDate: existing.paidDate ?? null,
        recurringId,
        createdAt: existing.createdAt ?? nowISO(),
        updatedAt: nowISO(),
      };

      if (recurringId) {
        await ignoreNotFound(
          db
            .collection(RECURRING)
            .doc(recurringId)
            .update({
              name: input.name,
              amountCents: input.amountCents,
              category: input.category,
              dueDay: Number(input.dueDate.slice(8, 10)),
            }),
        );
      }

      if (targetId !== docId) {
        const batch = db.batch();
        batch.delete(ref);
        batch.set(db.collection(EXPENSES).doc(targetId), data);
        await batch.commit();
        return serializeExpense(targetId, data);
      }

      await ref.update({
        name: data.name,
        amountCents: data.amountCents,
        category: data.category,
        dueDate: data.dueDate,
        month: data.month,
        updatedAt: data.updatedAt,
      });
      return serializeExpense(docId, data);
    },

    async setPaid(id, paid, paidDate) {
      const ref = db.collection(EXPENSES).doc(String(id));
      const snap = await ref.get();
      if (!snap.exists) return null;

      const value = Boolean(paid);
      const data = {
        ...snap.data(),
        paid: value,
        paidDate: value ? (isDate(paidDate) ? paidDate : todayISO()) : null,
        updatedAt: nowISO(),
      };

      await ref.update({
        paid: data.paid,
        paidDate: data.paidDate,
        updatedAt: data.updatedAt,
      });
      return serializeExpense(snap.id, data);
    },

    async deleteExpense(id, scope = "single") {
      const docId = String(id);
      const ref = db.collection(EXPENSES).doc(docId);
      const snap = await ref.get();
      if (!snap.exists) return null;

      const existing = snap.data();
      const recurringId = existing.recurringId ?? null;

      if (scope === "series" && recurringId) {
        await ignoreNotFound(
          db
            .collection(RECURRING)
            .doc(recurringId)
            .update({ active: false }),
        );

        const [instances, skipped] = await Promise.all([
          db.collection(EXPENSES).where("recurringId", "==", recurringId).get(),
          db.collection(SKIPPED).where("recurringId", "==", recurringId).get(),
        ]);

        await deleteRefs(
          db,
          instances.docs
            .filter((doc) => doc.data().month >= existing.month)
            .map((doc) => doc.ref),
        );
        await deleteRefs(
          db,
          skipped.docs.map((doc) => doc.ref),
        );

        return { scope: "series", recurringId };
      }

      if (recurringId) {
        await db
          .collection(SKIPPED)
          .doc(skippedId(recurringId, existing.month))
          .set({ recurringId, month: existing.month });
      }
      await ref.delete();
      return { scope: "single", id: docId };
    },

    async getShareToken() {
      return getShareToken();
    },

    async createShareToken() {
      const existing = await getShareToken();
      if (existing) return existing;
      const token = randomBytes(24).toString("base64url");
      await db.collection(SHARES).doc(token).set({ createdAt: nowISO() });
      return token;
    },

    async revokeShareTokens() {
      const snap = await db.collection(SHARES).get();
      await deleteRefs(
        db,
        snap.docs.map((doc) => doc.ref),
      );
    },

    async isValidShareToken(token) {
      if (typeof token !== "string" || token.length < 16) return false;
      const snap = await db.collection(SHARES).doc(token).get();
      return snap.exists;
    },

    async getMonthList() {
      const snap = await db.collection(EXPENSES).select("month").get();
      const months = new Set(snap.docs.map((doc) => doc.data().month));
      const current = currentMonth();
      months.add(current);
      return [...months].filter(Boolean).sort();
    },
  };
}
