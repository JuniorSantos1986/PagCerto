import { createApp } from "../server/app.js";
import { createPostgresStore } from "../server/postgres-store.js";

const store = createPostgresStore();

export default createApp(store, { serveStatic: false });
