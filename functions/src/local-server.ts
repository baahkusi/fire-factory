/**
 * Local Express API. `npm run dev` forces the memory store.
 * Point FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST here to use
 * the emulator instead: `npm run dev:api --workspace=functions`.
 */
import "./env-bootstrap";
import app from "./app";
import {useMemoryStore} from "./stores/memory";

const port = Number(process.env.PORT ?? 5001);

app.listen(port, () => {
  const store = useMemoryStore() ? "memory" : "firestore";
  // eslint-disable-next-line no-console
  console.log(`Fire Factory API listening on http://127.0.0.1:${port} (${store})`);
  // eslint-disable-next-line no-console
  console.log(`Health: http://127.0.0.1:${port}/health`);
});
