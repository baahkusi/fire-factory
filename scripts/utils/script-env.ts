import * as dotenv from "dotenv";
import * as path from "node:path";

export type ScriptMode = "dev" | "emulator" | "prod";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PROJECT_ID = "fire-factory";

export function resolveScriptMode(argv = process.argv.slice(2)): ScriptMode {
  const explicitMode = argv.find((argument) => argument.startsWith("--mode="));
  const requestedMode = explicitMode?.split("=")[1];
  if (
    requestedMode === "dev" ||
    requestedMode === "emulator" ||
    requestedMode === "prod"
  ) {
    return requestedMode;
  }
  if (argv.includes("--emulator") || process.env.USE_EMULATOR === "true") {
    return "emulator";
  }
  if (argv.includes("--prod") || process.env.NODE_ENV === "production") {
    return "prod";
  }
  return "prod";
}

/** Load functions/.env, then mode-specific overrides. */
export function loadScriptEnv(mode = resolveScriptMode()): ScriptMode {
  dotenv.config({path: path.join(REPO_ROOT, "functions", ".env")});

  const environment = mode === "emulator" ? "dev" : mode;
  dotenv.config({
    path: path.join(REPO_ROOT, "functions", `.${environment}.env`),
  });

  if (!process.env.FB_PROJECT_ID?.trim()) {
    process.env.FB_PROJECT_ID = DEFAULT_PROJECT_ID;
  }
  process.env.GOOGLE_CLOUD_PROJECT =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.FB_PROJECT_ID;
  process.env.GCLOUD_PROJECT =
    process.env.GCLOUD_PROJECT || process.env.FB_PROJECT_ID;

  if (mode === "emulator") {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  }
  return mode;
}
