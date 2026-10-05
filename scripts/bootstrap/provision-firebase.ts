/**
 * Provision a Blaze Firebase project that already exists.
 *
 * Creates nothing until `gcloud` can see the project. Idempotent: existing
 * resources are left in place. Does not attach billing and does not create
 * the Google Cloud project.
 *
 *   npm run provision -- --project=your-id --region=us-central1
 *   npm run provision -- --project=your-id --yes --github-secret
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {spawnSync} from "node:child_process";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  input?: string | Buffer;
  inherit?: boolean;
}

export interface HttpRequest {
  method?: string;
  token: string;
  projectId: string;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export interface ProvisionDeps {
  run: (command: string, args: string[], options?: CommandOptions) => CommandResult;
  request: (url: string, init: HttpRequest) => Promise<HttpResponse>;
  readFile: (filePath: string) => string | null;
  writeFile: (filePath: string, content: string) => void;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
  warn: (message: string) => void;
}

export interface ProvisionOptions {
  projectId: string;
  projectName: string;
  region: string;
  repoRoot: string;
  interactive: boolean;
  githubSecret?: boolean;
}

export const REQUIRED_APIS = [
  "firebase.googleapis.com",
  "firestore.googleapis.com",
  "firebaserules.googleapis.com",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "identitytoolkit.googleapis.com",
  "cloudfunctions.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "run.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "compute.googleapis.com",
  "firebaseapphosting.googleapis.com",
  "developerconnect.googleapis.com",
  "secretmanager.googleapis.com",
];

/** Roles the GitHub Actions deployer needs for rules, indexes, and gen2 functions. */
export const DEPLOYER_ROLES = [
  "roles/firebase.admin",
  "roles/cloudfunctions.admin",
  "roles/run.admin",
  "roles/artifactregistry.writer",
  "roles/cloudbuild.builds.editor",
  "roles/iam.serviceAccountUser",
  "roles/firebaserules.admin",
  "roles/datastore.indexAdmin",
  "roles/storage.admin",
  "roles/serviceusage.serviceUsageConsumer",
];

/** New projects no longer grant these to the default build identities. */
export const COMPUTE_BUILD_ROLES = [
  "roles/cloudbuild.builds.builder",
  "roles/artifactregistry.writer",
  "roles/logging.logWriter",
  "roles/storage.objectViewer",
];

export const CLOUDBUILD_SA_ROLES = [
  "roles/cloudbuild.builds.builder",
  "roles/artifactregistry.writer",
  "roles/logging.logWriter",
  "roles/storage.objectAdmin",
];

const ENV_KEYS: [keyof FirebaseWebConfig, string][] = [
  ["apiKey", "NEXT_PUBLIC_FIREBASE_API_KEY"],
  ["authDomain", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"],
  ["projectId", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"],
  ["storageBucket", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"],
  ["messagingSenderId", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"],
  ["appId", "NEXT_PUBLIC_FIREBASE_APP_ID"],
];

export function missingRoles(required: string[], granted: string[]): string[] {
  const have = new Set(granted.map((role) => role.trim()).filter(Boolean));
  return required.filter((role) => !have.has(role));
}

export function isBenignConflict(status: number, body: string): boolean {
  if (status === 409) return true;
  const text = body.toLowerCase();
  return (
    (status === 400 || status === 409) &&
    (text.includes("already exists") ||
      text.includes("already_exists") ||
      text.includes("already a firebaseproject"))
  );
}

export function firebaseOperationUrl(name: string): string {
  return `https://firebase.googleapis.com/v1beta1/${name.replace(/^\//, "")}`;
}

export function firestoreOperationUrl(name: string): string {
  const encoded = name
    .replace(/^\//, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://firestore.googleapis.com/v1/${encoded}`;
}

export function bucketNameFromDefault(body: string, projectId: string): string {
  try {
    const parsed = JSON.parse(body) as {bucket?: {name?: string}};
    const raw = parsed.bucket?.name?.trim() ?? "";
    const short = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
    if (short) return short;
  } catch {
    // fall through to the conventional name
  }
  return `${projectId}.firebasestorage.app`;
}

export function webAppsFromList(body: string): {appId: string; displayName?: string}[] {
  const parsed = JSON.parse(body || "{}") as {
    apps?: {appId?: string; displayName?: string}[];
  };
  return (parsed.apps ?? []).flatMap((app) =>
    app.appId ? [{appId: app.appId, displayName: app.displayName}] : []
  );
}

export function pickWebApp(
  apps: {appId: string; displayName?: string}[],
  displayName: string
): {appId: string; displayName?: string} | null {
  if (apps.length === 0) return null;
  return apps.find((app) => app.displayName === displayName) ?? apps[0];
}

export function webConfigFromApi(body: string, fallbackBucket: string): FirebaseWebConfig {
  const parsed = JSON.parse(body) as Partial<FirebaseWebConfig>;
  const config: FirebaseWebConfig = {
    apiKey: parsed.apiKey?.trim() ?? "",
    authDomain: parsed.authDomain?.trim() ?? "",
    projectId: parsed.projectId?.trim() ?? "",
    storageBucket: parsed.storageBucket?.trim() || fallbackBucket,
    messagingSenderId: parsed.messagingSenderId?.trim() ?? "",
    appId: parsed.appId?.trim() ?? "",
  };
  if (!config.apiKey || !config.appId || !config.projectId) {
    throw new Error("Web app config is missing apiKey, appId, or projectId");
  }
  return config;
}

function isLongRunningOperation(parsed: {name?: string; done?: boolean}): boolean {
  if (typeof parsed.done === "boolean") return true;
  return Boolean(parsed.name?.includes("/operations/"));
}

export async function settleOperation(
  initial: HttpResponse,
  poll: (name: string) => Promise<HttpResponse>,
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  if (isBenignConflict(initial.status, initial.body)) return;
  if (initial.status >= 300) {
    throw new Error(`HTTP ${initial.status}: ${initial.body.slice(0, 500)}`);
  }
  let parsed = JSON.parse(initial.body || "{}") as {
    name?: string;
    done?: boolean;
    error?: {message?: string};
  };
  if (!isLongRunningOperation(parsed)) return;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (parsed.error) {
      throw new Error(parsed.error.message || "Google operation failed");
    }
    if (parsed.done || !parsed.name) return;
    await sleep(2000);
    const next = await poll(parsed.name);
    if (next.status >= 300) {
      throw new Error(`HTTP ${next.status}: ${next.body.slice(0, 500)}`);
    }
    parsed = JSON.parse(next.body || "{}");
  }
  throw new Error("Timed out waiting for a Google operation");
}

export function applyWebConfigToEnv(content: string, config: FirebaseWebConfig): string {
  let updated = content;
  for (const [field, key] of ENV_KEYS) {
    const line = `${key}=${config[field]}`;
    const pattern = new RegExp(`^\\s*${key}=.*$`, "m");
    if (pattern.test(updated)) {
      updated = updated.replace(pattern, line);
    } else {
      updated = `${updated.replace(/\s*$/, "")}\n${line}\n`;
    }
  }
  return updated;
}

export function applyStorageBucket(content: string, bucket: string): string {
  if (/^\s*#?\s*FB_STORAGE_BUCKET=/m.test(content)) {
    return content.replace(/^\s*#?\s*FB_STORAGE_BUCKET=.*$/m, `FB_STORAGE_BUCKET=${bucket}`);
  }
  return `${content.replace(/\s*$/, "")}\nFB_STORAGE_BUCKET=${bucket}\n`;
}

export function readWebConfig(content: string): FirebaseWebConfig | null {
  const read = (key: string) => {
    const match = content.match(new RegExp(`^\\s*${key}=(.*)$`, "m"));
    return match?.[1]?.trim() ?? "";
  };
  const config: FirebaseWebConfig = {
    apiKey: read("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: read("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: read("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: read("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: read("NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
  if (!config.apiKey || !config.appId || !config.projectId) return null;
  return config;
}

export function upsertAppHostingVar(content: string, variable: string, value: string): string {
  if (/["\n\r]/.test(value)) {
    throw new Error(`Refusing to write ${variable}: the value has quotes or newlines`);
  }
  const pattern = new RegExp(
    `(variable:\\s*${variable}\\s*\\n\\s*value:\\s*")[^"]*(")`
  );
  if (pattern.test(content)) {
    return content.replace(pattern, `$1${value}$2`);
  }
  const block =
    `  - variable: ${variable}\n` +
    `    value: "${value}"\n` +
    "    availability:\n" +
    "      - BUILD\n" +
    "      - RUNTIME\n";
  if (content.includes("env:\n")) {
    return content.replace("env:\n", `env:\n${block}`);
  }
  return `${content.replace(/\s*$/, "")}\n\nenv:\n${block}`;
}

export function applyWebConfigToAppHosting(content: string, config: FirebaseWebConfig): string {
  const pairs: [string, string][] = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", config.apiKey],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", config.authDomain],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", config.projectId],
    ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", config.storageBucket],
    ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", config.messagingSenderId],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", config.appId],
  ];
  return pairs.reduce(
    (current, [variable, value]) => upsertAppHostingVar(current, variable, value),
    content
  );
}

function defaultRun(
  command: string,
  args: string[],
  options?: CommandOptions
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options?.cwd,
    input: options?.input,
    encoding: "utf8",
    stdio: options?.inherit ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

async function defaultRequest(url: string, init: HttpRequest): Promise<HttpResponse> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": init.projectId,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return {status: response.status, body: await response.text()};
}

function defaultDeps(): ProvisionDeps {
  return {
    run: defaultRun,
    request: defaultRequest,
    readFile: (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null),
    writeFile: (filePath, content) => {
      fs.mkdirSync(path.dirname(filePath), {recursive: true});
      fs.writeFileSync(filePath, content, "utf8");
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message) => {
      // eslint-disable-next-line no-console
      console.log(message);
    },
    warn: (message) => {
      // eslint-disable-next-line no-console
      console.warn(message);
    },
  };
}

function commandFailed(result: CommandResult, label: string): Error {
  const detail = (result.stderr || result.stdout).trim().slice(0, 500);
  return new Error(detail ? `${label}: ${detail}` : label);
}

async function runStep(
  failures: string[],
  log: (message: string) => void,
  warn: (message: string) => void,
  label: string,
  action: () => Promise<void>
): Promise<void> {
  try {
    await action();
    log(`✔ ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${label}: ${message}`);
    warn(`✖ ${label}: ${message}`);
  }
}

async function requestReady(
  deps: ProvisionDeps,
  url: string,
  init: HttpRequest
): Promise<HttpResponse> {
  let response = await deps.request(url, init);
  if (response.status === 403 && /SERVICE_DISABLED|has not been used/i.test(response.body)) {
    await deps.sleep(5000);
    response = await deps.request(url, init);
  }
  return response;
}

function ensureGcloudAccess(
  deps: ProvisionDeps,
  projectId: string,
  interactive: boolean
): void {
  const version = deps.run("gcloud", ["version"]);
  if (version.status !== 0) {
    throw new Error(
      "gcloud CLI is not installed. Install the Google Cloud SDK, then re-run this command."
    );
  }
  const describe = () =>
    deps.run("gcloud", ["projects", "describe", projectId, "--format=value(projectId)"]);
  let access = describe();
  if (access.status !== 0 && interactive) {
    deps.log(`\ngcloud cannot see ${projectId}. Starting 'gcloud auth login'...\n`);
    deps.run("gcloud", ["auth", "login"], {inherit: true});
    access = describe();
  }
  if (access.status !== 0) {
    throw new Error(
      `gcloud cannot access project ${projectId}. Run 'gcloud auth login' as an owner of that project.`
    );
  }
}

function accessToken(deps: ProvisionDeps): string {
  const result = deps.run("gcloud", ["auth", "print-access-token"]);
  const token = result.stdout.trim();
  if (result.status !== 0 || !token) {
    throw commandFailed(result, "Could not read a gcloud access token");
  }
  return token;
}

function grantedRoles(deps: ProvisionDeps, projectId: string, member: string): string[] {
  const result = deps.run("gcloud", [
    "projects",
    "get-iam-policy",
    projectId,
    "--flatten=bindings[].members",
    `--filter=bindings.members:${member}`,
    "--format=value(bindings.role)",
  ]);
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map((role) => role.trim()).filter(Boolean);
}

function grantProjectRoles(
  deps: ProvisionDeps,
  projectId: string,
  member: string,
  roles: string[]
): void {
  const missing = missingRoles(roles, grantedRoles(deps, projectId, member));
  for (const role of missing) {
    const result = deps.run("gcloud", [
      "projects",
      "add-iam-policy-binding",
      projectId,
      `--member=${member}`,
      `--role=${role}`,
      "--condition=None",
      "--quiet",
    ]);
    if (result.status !== 0) throw commandFailed(result, `Could not grant ${role} to ${member}`);
  }
}

function writeWebConfigFiles(
  deps: ProvisionDeps,
  repoRoot: string,
  config: FirebaseWebConfig
): void {
  const frontendLocal = path.join(repoRoot, "frontend/.env.local");
  const frontendExample = path.join(repoRoot, "frontend/.env.example");
  const current = deps.readFile(frontendLocal) ?? deps.readFile(frontendExample) ?? "";
  deps.writeFile(frontendLocal, applyWebConfigToEnv(current, config));

  const functionsEnv = path.join(repoRoot, "functions/.env");
  const functionsExample = path.join(repoRoot, "functions/.env.example");
  const functionsCurrent = deps.readFile(functionsEnv) ?? deps.readFile(functionsExample);
  if (functionsCurrent !== null) {
    deps.writeFile(functionsEnv, applyStorageBucket(functionsCurrent, config.storageBucket));
  }

  const appHosting = path.join(repoRoot, "frontend/apphosting.yaml");
  const hosting = deps.readFile(appHosting);
  if (hosting !== null) {
    deps.writeFile(appHosting, applyWebConfigToAppHosting(hosting, config));
  }
}

async function ensureEmailPassword(
  deps: ProvisionDeps,
  projectId: string,
  token: string
): Promise<void> {
  const url =
    `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config` +
    "?updateMask=signIn.email.enabled,signIn.email.passwordRequired";
  const response = await requestReady(deps, url, {
    method: "PATCH",
    token,
    projectId,
    body: {signIn: {email: {enabled: true, passwordRequired: true}}},
  });
  if (response.status >= 300 && !isBenignConflict(response.status, response.body)) {
    throw new Error(`HTTP ${response.status}: ${response.body.slice(0, 500)}`);
  }
}

async function ensureFirestore(
  deps: ProvisionDeps,
  projectId: string,
  region: string,
  token: string
): Promise<void> {
  const databaseUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/` +
    encodeURIComponent("(default)");
  const existing = await requestReady(deps, databaseUrl, {token, projectId});
  if (existing.status === 200) return;
  if (existing.status !== 404) {
    throw new Error(`HTTP ${existing.status}: ${existing.body.slice(0, 500)}`);
  }
  const createUrl =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases` +
    `?databaseId=${encodeURIComponent("(default)")}`;
  const body = {
    type: "FIRESTORE_NATIVE",
    locationId: region,
    databaseEdition: "STANDARD",
  };
  let created = await requestReady(deps, createUrl, {method: "POST", token, projectId, body});
  if (
    created.status === 400 &&
    /databaseEdition|unknown field/i.test(created.body)
  ) {
    created = await deps.request(createUrl, {
      method: "POST",
      token,
      projectId,
      body: {type: "FIRESTORE_NATIVE", locationId: region},
    });
  }
  await settleOperation(
    created,
    (name) => deps.request(firestoreOperationUrl(name), {token, projectId}),
    deps.sleep
  );
}

async function ensureStorage(
  deps: ProvisionDeps,
  projectId: string,
  region: string,
  token: string
): Promise<string> {
  const url = `https://firebasestorage.googleapis.com/v1alpha/projects/${projectId}/defaultBucket`;
  const existing = await requestReady(deps, url, {token, projectId});
  if (existing.status === 200) return bucketNameFromDefault(existing.body, projectId);
  if (existing.status !== 404) {
    throw new Error(`HTTP ${existing.status}: ${existing.body.slice(0, 500)}`);
  }
  const created = await requestReady(deps, url, {
    method: "POST",
    token,
    projectId,
    body: {location: region},
  });
  if (created.status >= 300 && !isBenignConflict(created.status, created.body)) {
    throw new Error(`HTTP ${created.status}: ${created.body.slice(0, 500)}`);
  }
  return bucketNameFromDefault(created.body, projectId);
}

async function ensureWebApp(
  deps: ProvisionDeps,
  projectId: string,
  projectName: string,
  token: string,
  fallbackBucket: string
): Promise<FirebaseWebConfig> {
  const listUrl = `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`;
  const listed = await requestReady(deps, listUrl, {token, projectId});
  if (listed.status >= 300) {
    throw new Error(`HTTP ${listed.status}: ${listed.body.slice(0, 500)}`);
  }
  let app = pickWebApp(webAppsFromList(listed.body), projectName);
  if (!app) {
    const created = await deps.request(listUrl, {
      method: "POST",
      token,
      projectId,
      body: {displayName: projectName},
    });
    await settleOperation(
      created,
      (name) => deps.request(firebaseOperationUrl(name), {token, projectId}),
      deps.sleep
    );
    const again = await deps.request(listUrl, {token, projectId});
    if (again.status >= 300) {
      throw new Error(`HTTP ${again.status}: ${again.body.slice(0, 500)}`);
    }
    app = pickWebApp(webAppsFromList(again.body), projectName);
  }
  if (!app) throw new Error("Firebase did not return a Web app id");
  const configUrl =
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/` +
    `${encodeURIComponent(app.appId)}/config`;
  const config = await deps.request(configUrl, {token, projectId});
  if (config.status >= 300) {
    throw new Error(`HTTP ${config.status}: ${config.body.slice(0, 500)}`);
  }
  return webConfigFromApi(config.body, fallbackBucket);
}

function ensureDeployer(deps: ProvisionDeps, projectId: string): string {
  const email = `github-deployer@${projectId}.iam.gserviceaccount.com`;
  const described = deps.run("gcloud", [
    "iam",
    "service-accounts",
    "describe",
    email,
    `--project=${projectId}`,
  ]);
  if (described.status !== 0) {
    const created = deps.run("gcloud", [
      "iam",
      "service-accounts",
      "create",
      "github-deployer",
      `--project=${projectId}`,
      "--display-name=GitHub deployer",
      "--quiet",
    ]);
    if (created.status !== 0) throw commandFailed(created, "Could not create github-deployer");
  }
  grantProjectRoles(deps, projectId, `serviceAccount:${email}`, DEPLOYER_ROLES);

  const number = deps.run("gcloud", [
    "projects",
    "describe",
    projectId,
    "--format=value(projectNumber)",
  ]);
  const projectNumber = number.stdout.trim();
  if (number.status !== 0 || !projectNumber) {
    throw commandFailed(number, "Could not read the project number");
  }
  const compute = `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`;
  const cloudBuild = `serviceAccount:${projectNumber}@cloudbuild.gserviceaccount.com`;
  grantProjectRoles(deps, projectId, compute, COMPUTE_BUILD_ROLES);
  grantProjectRoles(deps, projectId, cloudBuild, CLOUDBUILD_SA_ROLES);
  const actAs = deps.run("gcloud", [
    "iam",
    "service-accounts",
    "add-iam-policy-binding",
    `${projectNumber}-compute@developer.gserviceaccount.com`,
    `--member=serviceAccount:${email}`,
    "--role=roles/iam.serviceAccountUser",
    `--project=${projectId}`,
    "--quiet",
  ]);
  if (actAs.status !== 0) {
    throw commandFailed(actAs, "Could not let github-deployer act as the compute service account");
  }
  return email;
}

function ensureApplicationDefaultCredentials(
  deps: ProvisionDeps,
  projectId: string,
  interactive: boolean
): void {
  const probe = () =>
    deps.run("gcloud", ["auth", "application-default", "print-access-token"]);
  let current = probe();
  if (current.status !== 0 && interactive) {
    deps.log("\nStarting 'gcloud auth application-default login' for create-admin...\n");
    deps.run("gcloud", ["auth", "application-default", "login", `--project=${projectId}`], {
      inherit: true,
    });
    current = probe();
  }
  if (current.status !== 0) {
    throw new Error(
      "Application Default Credentials are missing. Run 'gcloud auth application-default login' before create-admin."
    );
  }
  deps.run("gcloud", ["auth", "application-default", "set-quota-project", projectId]);
}

export async function provisionFirebaseProject(
  options: ProvisionOptions,
  deps: ProvisionDeps = defaultDeps()
): Promise<FirebaseWebConfig> {
  const {projectId, projectName, region, repoRoot, interactive} = options;
  ensureGcloudAccess(deps, projectId, interactive);
  const token = accessToken(deps);
  const failures: string[] = [];
  let bucket = `${projectId}.firebasestorage.app`;
  let web: FirebaseWebConfig | null = null;

  deps.log(`\nProvisioning Firebase project ${projectId} in ${region}\n`);

  await runStep(failures, deps.log, deps.warn, "Firebase enabled on the project", async () => {
    const response = await requestReady(
      deps,
      `https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`,
      {method: "POST", token, projectId, body: {}}
    );
    await settleOperation(
      response,
      (name) => deps.request(firebaseOperationUrl(name), {token, projectId}),
      deps.sleep
    );
  });

  await runStep(failures, deps.log, deps.warn, "Required Google APIs enabled", async () => {
    const result = deps.run("gcloud", [
      "services",
      "enable",
      ...REQUIRED_APIS,
      `--project=${projectId}`,
      "--quiet",
    ]);
    if (result.status !== 0) throw commandFailed(result, "Could not enable APIs");
  });

  await runStep(failures, deps.log, deps.warn, "Firestore (default) database", () =>
    ensureFirestore(deps, projectId, region, token)
  );
  await runStep(failures, deps.log, deps.warn, "Default Storage bucket", async () => {
    bucket = await ensureStorage(deps, projectId, region, token);
  });
  await runStep(failures, deps.log, deps.warn, "Email/password Auth", () =>
    ensureEmailPassword(deps, projectId, token)
  );
  await runStep(failures, deps.log, deps.warn, "Web app config", async () => {
    web = await ensureWebApp(deps, projectId, projectName, token, bucket);
    writeWebConfigFiles(deps, repoRoot, web);
  });
  await runStep(failures, deps.log, deps.warn, "GitHub deployer IAM", async () => {
    ensureDeployer(deps, projectId);
  });
  try {
    ensureApplicationDefaultCredentials(deps, projectId, interactive);
    deps.log("✔ Application Default Credentials");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.warn(`✖ Application Default Credentials: ${message}`);
    deps.warn("Sign-in and deploy can continue. create-admin needs that login.");
  }

  if (options.githubSecret) {
    await runStep(failures, deps.log, deps.warn, "GitHub secret FIREBASE_SERVICE_ACCOUNT", () =>
      publishGithubDeployerSecret(
        {projectId, repoRoot, interactive},
        deps
      )
    );
  }

  if (failures.length > 0 || !web) {
    throw new Error(
      `Firebase provisioning failed:\n${failures.map((item) => `  · ${item}`).join("\n")}`
    );
  }
  return web;
}

export async function publishGithubDeployerSecret(
  options: {projectId: string; repoRoot: string; interactive: boolean},
  deps: ProvisionDeps = defaultDeps()
): Promise<void> {
  const listed = deps.run("gh", ["secret", "list"], {cwd: options.repoRoot});
  if (listed.status === 0 && listed.stdout.includes("FIREBASE_SERVICE_ACCOUNT")) {
    deps.log("✔ GitHub secret FIREBASE_SERVICE_ACCOUNT already set");
    return;
  }
  if (listed.status !== 0 && options.interactive) {
    deps.log("\nGitHub CLI is not ready. Starting 'gh auth login'...\n");
    deps.run("gh", ["auth", "login"], {cwd: options.repoRoot, inherit: true});
  }
  const email = `github-deployer@${options.projectId}.iam.gserviceaccount.com`;
  const keyPath = path.join(options.repoRoot, "github-key.json");
  const created = deps.run("gcloud", [
    "iam",
    "service-accounts",
    "keys",
    "create",
    keyPath,
    `--iam-account=${email}`,
    `--project=${options.projectId}`,
  ]);
  if (created.status !== 0) throw commandFailed(created, "Could not create a deployer key");
  const key = deps.readFile(keyPath);
  if (!key) throw new Error(`Deployer key file was not written at ${keyPath}`);
  let published = false;
  try {
    const secret = deps.run(
      "gh",
      ["secret", "set", "FIREBASE_SERVICE_ACCOUNT"],
      {cwd: options.repoRoot, input: key}
    );
    if (secret.status === 0) {
      published = true;
      deps.log("✔ GitHub secret FIREBASE_SERVICE_ACCOUNT set");
      return;
    }
    if (process.platform === "darwin") {
      const copied = deps.run("pbcopy", [], {input: key});
      if (copied.status === 0) {
        published = true;
        deps.log("✔ Deployer key copied to the clipboard. Paste it as FIREBASE_SERVICE_ACCOUNT.");
        return;
      }
    }
    throw commandFailed(
      secret,
      `Could not set the GitHub secret. The key is at ${keyPath}. Delete it after you paste it.`
    );
  } finally {
    if (published) {
      try {
        fs.rmSync(keyPath, {force: true});
      } catch {
        deps.warn(`Delete ${keyPath} after the secret is stored.`);
      }
    }
  }
}

function titleFromProjectId(projectId: string): string {
  return projectId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`) || (name === "yes" && process.argv.includes("-y"));
}

async function main(): Promise<void> {
  const projectId = (arg("project") ?? arg("id") ?? "").trim().toLowerCase();
  if (!projectId) throw new Error("Pass --project=<firebase-project-id>");
  const region = (arg("region") ?? "us-central1").trim().toLowerCase();
  const projectName = (arg("name") ?? "").trim() || titleFromProjectId(projectId);
  const repoRoot = path.resolve(__dirname, "../..");
  const interactive = !flag("yes") && Boolean(process.stdin.isTTY);
  if (flag("secret-only")) {
    await publishGithubDeployerSecret({projectId, repoRoot, interactive});
    return;
  }
  await provisionFirebaseProject({
    projectId,
    projectName,
    region,
    repoRoot,
    interactive,
    githubSecret: flag("github-secret"),
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
