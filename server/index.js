import { existsSync, readFileSync } from "node:fs";
import { createApp } from "./app.js";

function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(path);
      return;
    } catch {
      // continua para o parser de fallback
    }
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

const port = Number(process.env.PORT) || 3001;
const flags = [process.env.USE_FIRESTORE, process.env.FIREBASE_PROJECT_ID];
const useFirestore =
  flags.some((flag) => ["1", "true"].includes(String(flag).toLowerCase())) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
  Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) ||
  Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const usePostgres = !useFirestore && Boolean(process.env.DATABASE_URL);

if (!useFirestore && !usePostgres && process.env.SUPABASE_URL) {
  console.warn(
    "\n⚠️  Aviso: SUPABASE_URL foi detectada no .env, mas DATABASE_URL não está configurada!\n" +
      "   O Gestor conecta ao PostgreSQL do Supabase através da variável DATABASE_URL.\n" +
      "   Defina DATABASE_URL no seu arquivo .env com a string de conexão do Supabase.\n" +
      "   Iniciando com SQLite local por enquanto...\n",
  );
}

let store;

if (useFirestore) {
  const { createFirestoreStore } = await import("./firestore-store.js");
  store = await createFirestoreStore();
} else if (usePostgres) {
  const { createPostgresStore, initPostgresSchema } = await import(
    "./postgres-store.js"
  );
  const pgStore = createPostgresStore();
  try {
    await initPostgresSchema(pgStore.pool);
  } catch (error) {
    console.error(
      "Aviso: Não foi possível aplicar o schema inicial no PostgreSQL:",
      error.message,
    );
  }
  store = pgStore;
} else {
  const { createDatabase } = await import("./db.js");
  const { createSqliteStore } = await import("./sqlite-store.js");
  store = createSqliteStore(createDatabase());
}

const app = createApp(store);

app.listen(port, () => {
  const backend = useFirestore
    ? "Firestore"
    : usePostgres
      ? "PostgreSQL (Supabase)"
      : "SQLite";
  console.log(`Gestor rodando em http://localhost:${port} (${backend})`);
});
