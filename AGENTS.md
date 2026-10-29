# AGENTS.md

Gestor: Brazilian Portuguese expense manager. React SPA + Express API, with Firestore, Postgres/Supabase (Vercel) or SQLite (local default). No framework beyond React/Vite.

## Commands

- Node >= 24 is required (`node:sqlite`); install with `npm install`.
- `npm run dev` — API on `:3001`, Vite on `:5180` with `/api` proxied. Use `:5180` in the browser; if `dist/` exists, `:3001` serves the stale build. Defaults to SQLite.
- Firestore local: `USE_FIRESTORE=1 FIREBASE_PROJECT_ID=... GOOGLE_APPLICATION_CREDENTIALS=... npm run dev`, or point `FIRESTORE_EMULATOR_HOST` at the emulator.
- Postgres local: comente `USE_FIRESTORE` e rode `DATABASE_URL=postgresql://... npm run dev`; use `DATABASE_SSL=0` para Postgres sem SSL.
- `npm test` — Node test runner; the API suite runs against in-memory SQLite, an in-memory Firestore fake (`tests/fake-firestore.js`) and Postgres via PGlite. Com `TEST_DATABASE_URL` definida, o backend Postgres usa o banco real (as tabelas são truncadas a cada teste).
- Single test: `node --test --test-name-pattern="recorr" tests/api.test.js` (also works for a single file).
- `npm run typecheck` / `npm run build` — `tsc` only covers `src/` and `vite.config.ts`; the server is plain JS and is not typechecked.
- Production (single host): `npm run build && npm start` (serves `dist/` on `:3001`).
- Firebase: `npm run deploy` builds and deploys only `hosting` + `firestore` rules/indexes (Spark plan, no Blaze). `npm run migrate:firestore` copies the SQLite DB to Firestore. `npm run migrate:postgres` copies SQLite to Postgres/Supabase (preserva IDs de despesas).
- Vercel: `api/index.js` exporta o app Express como uma única Function; `vercel.json` serve `dist/` e reescreve `/api/*` para `/api`. Configure `DATABASE_URL` (Transaction pooler, porta 6543) no projeto. Sem `VITE_API_URL`, o frontend chama `/api` na mesma origem.
- API host (Render/Railway/Fly): deploy the `server/` directory with `npm start` and `USE_FIRESTORE=1`; set `FIREBASE_SERVICE_ACCOUNT` (JSON) or `GOOGLE_APPLICATION_CREDENTIALS`. `render.yaml` is a ready example.
- Frontend API URL: `VITE_API_URL` (build-time) must point to the external API when using Hosting; without it the frontend calls same-origin `/api`. Deploy with `VITE_API_URL=https://sua-api npm run deploy`. The external API must allow the Hosting domain via `CORS_ORIGINS`.
- No lint or format script exists; do not invent one.

## Layout and wiring

- `server/index.js` picks the store (Firestore when configured, then Postgres when `DATABASE_URL` exists, otherwise SQLite) and calls `createApp(store)` (`server/app.js`). `server/app.js` is HTTP only and awaits the store.
- Stores: `server/sqlite-store.js` wraps the existing SQLite logic in `server/expenses.js` (schema in `server/db.js`); `server/firestore-store.js` and `server/postgres-store.js` implement the same interface on Firestore and Postgres. Date helpers in `server/date.js`; shared categories in `server/categories.js`. `server/postgres-store.js` uses `pg` and expects the schema in `server/postgres-schema.sql` applied manually.
- `server/package.json` is also a standalone API manifest (`npm start` -> `node index.js`), used to deploy `server/` to Render/Railway/Fly. `server/function.js` is an optional Cloud Functions entry (not wired in `firebase.json`; requires Blaze plus a function rewrite if used).
- `firebase.json` deploys static Hosting only: SPA fallback to `/index.html`; there is no `/api` rewrite. `firestore.rules` denies all client SDK access; the external API uses the Admin SDK.
- Frontend: `src/main.tsx` -> `src/App.tsx`. There is no router: `/share/:token` is matched manually via `window.location.pathname`. Express SPA fallback only activates when `dist/` exists (single-host deployment).
- Dashboard state/actions live in `src/pages/Dashboard.tsx`; all HTTP goes through `src/lib/api.ts`, which turns non-2xx `{error}` responses into `ApiError`.
- Styling is plain CSS in `src/styles.css`; icons come from `lucide-react`. No CSS framework.

## Domain gotchas

- Money is integer cents (`amountCents`); dates are `YYYY-MM-DD`, months `YYYY-MM`. Keep server-side validation intact.
- Recurring expenses are materialized lazily: `listExpenses`/`getSummary` call `ensureRecurringUntil`, so reads write new rows. Deleting one instance adds `skipped_months`; `?scope=series` deactivates the template and deletes current/future instances.
- Expense IDs are strings in the API/UI (Firestore document IDs). SQLite/Postgres numeric IDs are serialized as strings; `parseId` only rejects empty/oversized IDs with `/`.
- Categories are defined in `server/categories.js` (`CATEGORIES`), `src/types.ts` (`CategoryId`), and `src/lib/categories.ts`. Update all three together.
- API validation errors return `{ error, errors: string[] }`. For 409 conflicts, throw an `Error` with `.status = 409`; the error middleware maps it.
- SQLite DB defaults to `data/gestor.db` (gitignored, auto-created); a legacy `data/grana.db` is renamed on startup if the new file is absent. Override with `DATABASE_PATH`; tests use `:memory:`. WAL and foreign keys are enabled. Firestore is opt-in locally via `USE_FIRESTORE=1` (or credentials/project env), and is used by the Cloud Function.
- Firestore collections: `expenses`, `recurringExpenses`, `skippedMonths`, `shareLinks` (camelCase fields). Recurring instances use deterministic IDs `rec_<recurringId>_<month>`, and skipped months `<recurringId>_<month>`. Reads still materialize recurrences lazily, so concurrent reads may write the same doc.
- Firestore queries avoid composite indexes (filter/sort in memory); keep `firestore.indexes.json` empty unless a new composite query is added.
- Postgres/Supabase: tabelas `expenses`, `recurring_expenses`, `skipped_months`, `share_links`; RLS habilitado sem policies (a API usa conexão direta/owner). Use a Transaction pooler (`6543`) em serverless, `PG_POOL_MAX` baixo e `ON CONFLICT DO NOTHING` para concorrência de recorrências. Não use prepared statements nomeados com o pooler.
- CORS is read from `CORS_ORIGINS` at app creation. In production an empty list denies cross-origin browser calls; dev defaults to allowing all. `src/lib/api.ts` prefixes requests with `VITE_API_URL` when set.
- All user-facing copy is pt-BR; match it. `PORT` overrides the default `3001`.
