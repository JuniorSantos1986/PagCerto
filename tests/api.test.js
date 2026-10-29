import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import request from "supertest";
import { createApp } from "../server/app.js";
import { createDatabase } from "../server/db.js";
import { todayISO } from "../server/date.js";
import { createFirestoreStore } from "../server/firestore-store.js";
import {
  createPostgresStore,
  resolveSsl,
} from "../server/postgres-store.js";
import { createSqliteStore } from "../server/sqlite-store.js";
import { FakeFirestore } from "./fake-firestore.js";

const backends = [
  {
    name: "SQLite",
    create: () => createApp(createSqliteStore(createDatabase(":memory:"))),
  },
  {
    name: "Firestore",
    create: async () => createApp(await createFirestoreStore(new FakeFirestore())),
  },
];

const postgresUrl = process.env.TEST_DATABASE_URL;
const schema = readFileSync(
  new URL("../server/postgres-schema.sql", import.meta.url),
  "utf8",
);

let postgresPool;
let postgresBackendName;

if (postgresUrl) {
  postgresPool = new pg.Pool({
    connectionString: postgresUrl,
    max: 2,
    ssl: resolveSsl(postgresUrl),
  });
  await postgresPool.query(schema);
  postgresBackendName = "PostgreSQL";
} else {
  const pglite = new PGlite();
  await pglite.exec(schema);
  postgresPool = {
    query: (sql, params) => pglite.query(sql, params),
    async connect() {
      return {
        query: (sql, params) => pglite.query(sql, params),
        release() {},
      };
    },
    async end() {
      await pglite.close();
    },
  };
  postgresBackendName = "PostgreSQL (PGlite)";
}

backends.push({
  name: postgresBackendName,
  create: async () => {
    await postgresPool.query(
      "TRUNCATE expenses, recurring_expenses, skipped_months, share_links RESTART IDENTITY",
    );
    return createApp(createPostgresStore({ pool: postgresPool }));
  },
});

after(async () => {
  await postgresPool.end();
});

function validExpense(overrides = {}) {
  return {
    name: "Aluguel",
    amountCents: 185000,
    category: "moradia",
    dueDate: "2030-01-10",
    ...overrides,
  };
}

it("libera CORS apenas para as origens configuradas", async () => {
  const previous = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://app.example";

  try {
    const app = createApp(createSqliteStore(createDatabase(":memory:")));

    const preflight = await request(app)
      .options("/api/expenses")
      .set("Origin", "https://app.example")
      .expect(204);
    assert.equal(
      preflight.headers["access-control-allow-origin"],
      "https://app.example",
    );

    const allowed = await request(app)
      .get("/api/health")
      .set("Origin", "https://app.example")
      .expect(200);
    assert.equal(
      allowed.headers["access-control-allow-origin"],
      "https://app.example",
    );

    const denied = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example")
      .expect(200);
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previous;
  }
});

for (const backend of backends) {
  describe(backend.name, () => {
    it("cria, lista, edita, paga e exclui uma despesa", async () => {
      const app = await backend.create();

      const created = await request(app)
        .post("/api/expenses")
        .send(validExpense())
        .expect(201);

      assert.equal(created.body.expense.name, "Aluguel");
      assert.equal(created.body.expense.amountCents, 185000);
      assert.equal(created.body.expense.paid, false);
      assert.equal(created.body.expense.month, "2030-01");

      const list = await request(app)
        .get("/api/expenses?month=2030-01")
        .expect(200);
      assert.equal(list.body.expenses.length, 1);

      const id = created.body.expense.id;
      const updated = await request(app)
        .put(`/api/expenses/${id}`)
        .send(validExpense({ name: "Aluguel atualizado", amountCents: 190000 }))
        .expect(200);

      assert.equal(updated.body.expense.name, "Aluguel atualizado");
      assert.equal(updated.body.expense.amountCents, 190000);

      const paid = await request(app)
        .patch(`/api/expenses/${id}/pay`)
        .send({ paid: true, paidDate: "2030-01-08" })
        .expect(200);

      assert.equal(paid.body.expense.paid, true);
      assert.equal(paid.body.expense.paidDate, "2030-01-08");

      const unpaid = await request(app)
        .patch(`/api/expenses/${id}/pay`)
        .send({ paid: false })
        .expect(200);

      assert.equal(unpaid.body.expense.paid, false);
      assert.equal(unpaid.body.expense.paidDate, null);

      await request(app).delete(`/api/expenses/${id}`).expect(200);

      const after = await request(app)
        .get("/api/expenses?month=2030-01")
        .expect(200);
      assert.equal(after.body.expenses.length, 0);
    });

    it("valida dados de entrada", async () => {
      const app = await backend.create();

      const response = await request(app)
        .post("/api/expenses")
        .send({
          name: "",
          amountCents: 0,
          category: "inexistente",
          dueDate: "2030-02-31",
        })
        .expect(400);

      assert.equal(response.body.errors.length, 4);
    });

    it("calcula o resumo do mês", async () => {
      const app = await backend.create();

      const first = await request(app)
        .post("/api/expenses")
        .send(validExpense({ amountCents: 10000 }))
        .expect(201);
      await request(app)
        .post("/api/expenses")
        .send(
          validExpense({
            name: "Internet",
            category: "contas",
            amountCents: 5000,
            dueDate: "2030-01-20",
          }),
        )
        .expect(201);

      await request(app)
        .patch(`/api/expenses/${first.body.expense.id}/pay`)
        .send({ paid: true, paidDate: "2030-01-09" })
        .expect(200);

      const summary = await request(app)
        .get("/api/summary?month=2030-01")
        .expect(200);
      assert.deepEqual(summary.body, {
        month: "2030-01",
        totalCount: 2,
        totalCents: 15000,
        paidCents: 10000,
        pendingCents: 5000,
        paidCount: 1,
        pendingCount: 1,
      });
    });

    it("gera recorrências, respeita exclusão mensal e encerra a série", async () => {
      const app = await backend.create();

      const created = await request(app)
        .post("/api/expenses")
        .send(validExpense({ dueDate: "2030-01-31", recurring: true }))
        .expect(201);
      assert.equal(created.body.expense.isRecurring, true);

      const february = await request(app)
        .get("/api/expenses?month=2030-02")
        .expect(200);
      assert.equal(february.body.expenses.length, 1);
      assert.equal(february.body.expenses[0].dueDate, "2030-02-28");

      const februaryId = february.body.expenses[0].id;

      await request(app)
        .put(`/api/expenses/${februaryId}`)
        .send(validExpense({ dueDate: "2030-01-15" }))
        .expect(409);

      await request(app)
        .delete(`/api/expenses/${februaryId}?scope=single`)
        .expect(200);

      const februaryAgain = await request(app)
        .get("/api/expenses?month=2030-02")
        .expect(200);
      assert.equal(februaryAgain.body.expenses.length, 0);

      const march = await request(app)
        .get("/api/expenses?month=2030-03")
        .expect(200);
      assert.equal(march.body.expenses.length, 1);
      assert.equal(march.body.expenses[0].dueDate, "2030-03-31");

      await request(app)
        .delete(`/api/expenses/${march.body.expenses[0].id}?scope=series`)
        .expect(200);

      const april = await request(app)
        .get("/api/expenses?month=2030-04")
        .expect(200);
      assert.equal(april.body.expenses.length, 0);
    });

    it("compartilha somente leitura e revoga o link", async () => {
      const app = await backend.create();
      await request(app)
        .post("/api/expenses")
        .send(validExpense())
        .expect(201);

      const empty = await request(app).get("/api/share").expect(200);
      assert.equal(empty.body.token, null);

      const created = await request(app).post("/api/share").expect(201);
      const token = created.body.token;
      assert.ok(token.length >= 16);

      const shared = await request(app)
        .get(`/api/shared/${token}/summary?month=2030-01`)
        .expect(200);
      assert.equal(shared.body.totalCents, 185000);

      const sharedExpenses = await request(app)
        .get(`/api/shared/${token}/expenses?month=2030-01`)
        .expect(200);
      assert.equal(sharedExpenses.body.expenses.length, 1);

      await request(app).delete("/api/share").expect(200);

      await request(app)
        .get(`/api/shared/${token}/summary?month=2030-01`)
        .expect(404);
    });

    it("lista vencimentos pendentes dentro da janela de alerta", async () => {
      const app = await backend.create();
      const today = todayISO();
      const [year, month, day] = today.split("-").map(Number);

      function shift(days) {
        const date = new Date(Date.UTC(year, month - 1, day + days));
        return date.toISOString().slice(0, 10);
      }

      await request(app)
        .post("/api/expenses")
        .send(validExpense({ name: "Atrasada", dueDate: shift(-2) }))
        .expect(201);
      await request(app)
        .post("/api/expenses")
        .send(validExpense({ name: "Hoje", dueDate: shift(0) }))
        .expect(201);
      await request(app)
        .post("/api/expenses")
        .send(validExpense({ name: "Longe", dueDate: shift(20) }))
        .expect(201);

      const upcoming = await request(app)
        .get("/api/upcoming?days=5")
        .expect(200);
      const names = upcoming.body.expenses.map((expense) => expense.name);
      assert.deepEqual(names.sort(), ["Atrasada", "Hoje"]);
      assert.ok(upcoming.body.expenses.every((expense) => expense.daysUntil <= 5));
    });
  });
}
