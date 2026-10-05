import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_PROJECT_ID = "fire-factory-si";

function isFirebaseAdminSdkJson(name: string): boolean {
  return (
    name.endsWith(".json") &&
    name.includes("firebase-adminsdk") &&
    !name.startsWith(".")
  );
}

/** Service-account JSON under scripts/, or GOOGLE_APPLICATION_CREDENTIALS. */
export function resolveCredentialsPath(): string | null {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const scriptsDir = path.resolve(__dirname, "..");
  try {
    const matches = fs
      .readdirSync(scriptsDir)
      .filter(isFirebaseAdminSdkJson)
      .map((name) => path.join(scriptsDir, name))
      .filter((full) => {
        try {
          return fs.statSync(full).isFile();
        } catch {
          return false;
        }
      })
      .sort();
    if (matches.length === 0) return null;
    return (
      matches.find((file) => path.basename(file).includes(resolveProjectId())) ??
      matches[0]
    );
  } catch {
    return null;
  }
}

export function resolveProjectId(): string {
  return (
    process.env.FB_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    DEFAULT_PROJECT_ID
  );
}

function emulatorMode(): boolean {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}

export function initFirebaseAdmin(): App {
  if (getApps().length > 0) return getApps()[0];

  const projectId = resolveProjectId();
  process.env.FB_PROJECT_ID ??= projectId;
  process.env.GOOGLE_CLOUD_PROJECT ??= projectId;
  process.env.GCLOUD_PROJECT ??= projectId;

  if (emulatorMode()) {
    // eslint-disable-next-line no-console
    console.log(`Firebase emulators, project ${projectId}`);
    return initializeApp({projectId});
  }

  const credPath = resolveCredentialsPath();
  let credential: Credential;
  if (credPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    credential = cert(credPath);
    // eslint-disable-next-line no-console
    console.log(`Using credentials: ${credPath}`);
  } else {
    credential = applicationDefault();
    // eslint-disable-next-line no-console
    console.log(
      "Using Application Default Credentials.\n" +
        "Or place a *firebase-adminsdk*.json under scripts/."
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Firebase project: ${projectId}`);
  return initializeApp({credential, projectId});
}
