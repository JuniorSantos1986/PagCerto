import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./app.js";
import { createFirestoreStore } from "./firestore-store.js";

const store = await createFirestoreStore();
const app = createApp(store, { serveStatic: false });

export const api = onRequest(
  { region: "southamerica-east1" },
  app,
);
