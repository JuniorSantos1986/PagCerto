import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3001;
const flags = [process.env.USE_FIRESTORE, process.env.FIREBASE_PROJECT_ID];
const useFirestore =
  flags.some((flag) => ["1", "true"].includes(String(flag).toLowerCase())) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
  Boolean(process.env.FIREBASE_SERVICE_ACCOUNT) ||
  Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let store;

if (useFirestore) {
  const { createFirestoreStore } = await import("./firestore-store.js");
  store = await createFirestoreStore();
} else {
  const { createDatabase } = await import("./db.js");
  const { createSqliteStore } = await import("./sqlite-store.js");
  store = createSqliteStore(createDatabase());
}

const app = createApp(store);

app.listen(port, () => {
  const backend = useFirestore ? "Firestore" : "SQLite";
  console.log(`Gestor rodando em http://localhost:${port} (${backend})`);
});
