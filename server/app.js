import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "./categories.js";
import { currentMonth, isMonth } from "./date.js";
import { validateExpenseInput } from "./expenses.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = resolve(root, "dist");

function parseMonth(value, fallback = currentMonth()) {
  if (value === undefined || value === "") return fallback;
  return isMonth(value) ? value : null;
}

function parseId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    return null;
  }
  return value.includes("/") ? null : value;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function corsMiddleware(allowedOrigins) {
  const allowAll =
    allowedOrigins.includes("*") ||
    (allowedOrigins.length === 0 && process.env.NODE_ENV !== "production");

  return (req, res, next) => {
    const origin = req.headers.origin;
    const allowed =
      allowAll || (origin && allowedOrigins.includes(origin));

    if (origin && allowed) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        allowAll ? "*" : origin,
      );
      if (!allowAll) res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      if (allowed) {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "86400");
      }
      return res.sendStatus(204);
    }

    next();
  };
}

export function createApp(store, options = {}) {
  const { serveStatic = true } = options;
  const app = express();
  app.disable("x-powered-by");
  app.use(corsMiddleware(parseOrigins(process.env.CORS_ORIGINS)));
  app.use(express.json({ limit: "64kb" }));

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/meta", (_req, res) => {
    res.json({ categories: CATEGORIES, currentMonth: currentMonth() });
  });

  app.get(
    "/api/months",
    asyncHandler(async (_req, res) => {
      res.json({ months: await store.getMonthList() });
    }),
  );

  app.get(
    "/api/expenses",
    asyncHandler(async (req, res) => {
      const month = parseMonth(req.query.month);
      if (!month) return res.status(400).json({ error: "Mês inválido." });
      res.json({ month, expenses: await store.listExpenses(month) });
    }),
  );

  app.get(
    "/api/summary",
    asyncHandler(async (req, res) => {
      const month = parseMonth(req.query.month);
      if (!month) return res.status(400).json({ error: "Mês inválido." });
      res.json(await store.getSummary(month));
    }),
  );

  app.get(
    "/api/upcoming",
    asyncHandler(async (req, res) => {
      const days = Number(req.query.days);
      const window = Number.isFinite(days) && days >= 0 && days <= 60 ? days : 5;
      res.json({ days: window, expenses: await store.getUpcoming(window) });
    }),
  );

  app.post(
    "/api/expenses",
    asyncHandler(async (req, res) => {
      const parsed = validateExpenseInput(req.body);
      if (parsed.errors) {
        return res
          .status(400)
          .json({ error: parsed.errors[0], errors: parsed.errors });
      }
      res.status(201).json({ expense: await store.createExpense(parsed.value) });
    }),
  );

  app.put(
    "/api/expenses/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Despesa inválida." });

      const parsed = validateExpenseInput(req.body);
      if (parsed.errors) {
        return res
          .status(400)
          .json({ error: parsed.errors[0], errors: parsed.errors });
      }

      const expense = await store.updateExpense(id, parsed.value);
      if (!expense) {
        return res.status(404).json({ error: "Despesa não encontrada." });
      }
      res.json({ expense });
    }),
  );

  app.patch(
    "/api/expenses/:id/pay",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Despesa inválida." });

      const paid = Boolean(req.body?.paid);
      const expense = await store.setPaid(id, paid, req.body?.paidDate);
      if (!expense) {
        return res.status(404).json({ error: "Despesa não encontrada." });
      }
      res.json({ expense });
    }),
  );

  app.delete(
    "/api/expenses/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Despesa inválida." });

      const scope = req.query.scope === "series" ? "series" : "single";
      const result = await store.deleteExpense(id, scope);
      if (!result) {
        return res.status(404).json({ error: "Despesa não encontrada." });
      }
      res.json({ deleted: result });
    }),
  );

  app.get(
    "/api/share",
    asyncHandler(async (_req, res) => {
      res.json({ token: await store.getShareToken() });
    }),
  );

  app.post(
    "/api/share",
    asyncHandler(async (_req, res) => {
      res.status(201).json({ token: await store.createShareToken() });
    }),
  );

  app.delete(
    "/api/share",
    asyncHandler(async (_req, res) => {
      await store.revokeShareTokens();
      res.json({ ok: true });
    }),
  );

  const requireShare = asyncHandler(async (req, res, next) => {
    if (!(await store.isValidShareToken(req.params.token))) {
      return res.status(404).json({ error: "Link inválido ou expirado." });
    }
    next();
  });

  app.get(
    "/api/shared/:token/expenses",
    requireShare,
    asyncHandler(async (req, res) => {
      const month = parseMonth(req.query.month);
      if (!month) return res.status(400).json({ error: "Mês inválido." });
      res.json({ month, expenses: await store.listExpenses(month) });
    }),
  );

  app.get(
    "/api/shared/:token/summary",
    requireShare,
    asyncHandler(async (req, res) => {
      const month = parseMonth(req.query.month);
      if (!month) return res.status(400).json({ error: "Mês inválido." });
      res.json(await store.getSummary(month));
    }),
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });

  if (serveStatic && existsSync(distPath)) {
    app.use(express.static(distPath, { index: false }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(resolve(distPath, "index.html"));
    });
  }

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Corpo da requisição inválido." });
    }
    if (err?.status === 409) {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  return app;
}
