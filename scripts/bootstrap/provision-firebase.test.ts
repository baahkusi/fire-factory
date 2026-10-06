import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPLOYER_ROLES,
  applyStorageBucket,
  applyWebConfigToAppHosting,
  applyWebConfigToEnv,
  bucketNameFromDefault,
  isBenignConflict,
  missingRoles,
  pickWebApp,
  provisionFirebaseProject,
  readWebConfig,
  settleOperation,
  type CommandResult,
  type HttpRequest,
  type HttpResponse,
  type ProvisionDeps,
} from "./provision-firebase";
import {generateAppHostingYaml} from "./setup-github";

const web = {
  apiKey: "key-1",
  authDomain: "demo-app.firebaseapp.com",
  projectId: "demo-app",
  storageBucket: "demo-app.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
};

test("env and App Hosting files receive the web config", () => {
  const env = applyWebConfigToEnv("NEXT_PUBLIC_FIREBASE_API_KEY=\nNEXT_PUBLIC_FIREBASE_APP_ID=\n", web);
  assert.equal(readWebConfig(env)?.apiKey, "key-1");
  assert.equal(readWebConfig(env)?.appId, "1:123:web:abc");
  assert.match(applyStorageBucket("# FB_STORAGE_BUCKET=old\n", web.storageBucket), /^FB_STORAGE_BUCKET=demo-app/);
  const hosted = applyWebConfigToAppHosting("env:\n  - variable: NEXT_PUBLIC_API_BASE_URL\n    value: \"x\"\n", web);
  assert.match(hosted, /NEXT_PUBLIC_FIREBASE_API_KEY/);
  assert.match(hosted, /1:123:web:abc/);
  assert.match(generateAppHostingYaml("demo-app", "us-central1", web), /key-1/);
});

test("missing roles and existing resources are detected", () => {
  assert.deepEqual(missingRoles(["roles/run.admin", "roles/storage.admin"], ["roles/storage.admin"]), [
    "roles/run.admin",
  ]);
  assert.equal(isBenignConflict(409, "already exists"), true);
  assert.equal(pickWebApp([{appId: "a", displayName: "Other"}, {appId: "b", displayName: "Demo"}], "Demo")?.appId, "b");
  assert.equal(
    bucketNameFromDefault(JSON.stringify({bucket: {name: "projects/p/buckets/demo-app.firebasestorage.app"}}), "demo-app"),
    "demo-app.firebasestorage.app"
  );
});

test("settleOperation polls until the operation is done", async () => {
  const seen: string[] = [];
  await settleOperation(
    {status: 200, body: JSON.stringify({name: "operations/web1", done: false})},
    async (name) => {
      seen.push(name);
      return {status: 200, body: JSON.stringify({name, done: true})};
    },
    async () => undefined
  );
  assert.deepEqual(seen, ["operations/web1"]);
});

test("provision creates missing cloud resources and writes the web keys", async () => {
  const calls: string[][] = [];
  const http: {url: string; method: string}[] = [];
  let webAppLists = 0;
  const files = new Map<string, string>();
  files.set("/repo/frontend/.env.local", "NEXT_PUBLIC_FIREBASE_API_KEY=\n");
  files.set("/repo/functions/.env", "FB_PROJECT_ID=old\n# FB_STORAGE_BUCKET=old\n");
  files.set("/repo/frontend/apphosting.yaml", "env:\n  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID\n    value: \"old\"\n");

  const ok = (stdout = ""): CommandResult => ({status: 0, stdout, stderr: ""});
  const deps: ProvisionDeps = {
    run(command, args) {
      calls.push([command, ...args]);
      const joined = args.join(" ");
      if (command === "gcloud" && args[0] === "version") return ok("gcloud");
      if (joined.includes("print-access-token") && joined.includes("application-default")) {
        return ok("adc-token\n");
      }
      if (args[0] === "auth" && args[1] === "print-access-token") return ok("token\n");
      if (args[0] === "projects" && args[1] === "describe" && joined.includes("projectNumber")) {
        return ok("555\n");
      }
      if (args[0] === "projects" && args[1] === "describe") return ok("demo-app\n");
      if (args[0] === "iam" && args[1] === "service-accounts" && args[2] === "describe") {
        return {status: 1, stdout: "", stderr: "not found"};
      }
      if (args[0] === "projects" && args[1] === "get-iam-policy") return ok("");
      return ok("");
    },
    async request(url: string, init: HttpRequest): Promise<HttpResponse> {
      const method = init.method ?? "GET";
      http.push({url, method});
      if (url.includes(":addFirebase")) {
        return {status: 409, body: JSON.stringify({error: {status: "ALREADY_EXISTS"}})};
      }
      if (url.includes("firestore.googleapis.com") && url.includes("databases") && method === "GET") {
        return {status: 404, body: "not found"};
      }
      if (url.includes("firestore.googleapis.com") && method === "POST") {
        return {status: 200, body: JSON.stringify({name: "projects/demo-app/databases/(default)/operations/1", done: true})};
      }
      if (url.endsWith("/defaultBucket") && method === "GET") return {status: 404, body: "not found"};
      if (url.endsWith("/defaultBucket") && method === "POST") {
        return {
          status: 200,
          body: JSON.stringify({bucket: {name: "demo-app.firebasestorage.app"}}),
        };
      }
      if (url.includes("identitytoolkit.googleapis.com")) return {status: 200, body: "{}"};
      if (url.endsWith("/webApps") && method === "GET") {
        webAppLists += 1;
        const apps = webAppLists === 1 ? [] : [{appId: web.appId, displayName: "Demo App"}];
        return {status: 200, body: JSON.stringify({apps})};
      }
      if (url.endsWith("/webApps") && method === "POST") {
        return {status: 200, body: JSON.stringify({name: "operations/web1", done: true, response: {appId: web.appId}})};
      }
      if (url.includes("/webApps/") && url.endsWith("/config")) return {status: 200, body: JSON.stringify(web)};
      return {status: 200, body: "{}"};
    },
    readFile: (filePath) => files.get(filePath) ?? null,
    writeFile: (filePath, content) => {
      files.set(filePath, content);
    },
    sleep: async () => undefined,
    log: () => undefined,
    warn: () => undefined,
  };

  const created = await provisionFirebaseProject(
    {
      projectId: "demo-app",
      projectName: "Demo App",
      region: "us-central1",
      repoRoot: "/repo",
      interactive: false,
    },
    deps
  );

  assert.equal(created.appId, web.appId);
  assert.match(files.get("/repo/frontend/.env.local") ?? "", /NEXT_PUBLIC_FIREBASE_API_KEY=key-1/);
  assert.match(files.get("/repo/functions/.env") ?? "", /^FB_STORAGE_BUCKET=demo-app/m);
  assert.match(files.get("/repo/frontend/apphosting.yaml") ?? "", /NEXT_PUBLIC_FIREBASE_APP_ID/);
  assert.equal(http.some((call) => call.url.includes("identitytoolkit") && call.method === "PATCH"), true);
  assert.equal(http.some((call) => call.url.includes("firestore") && call.method === "POST"), true);
  assert.equal(http.some((call) => call.url.endsWith("/defaultBucket") && call.method === "POST"), true);
  const enable = calls.find((call) => call[0] === "gcloud" && call[1] === "services" && call[2] === "enable");
  assert.ok(enable?.includes("identitytoolkit.googleapis.com"));
  assert.ok(enable?.includes("firestore.googleapis.com"));
  assert.ok(enable?.includes("eventarc.googleapis.com"));
  assert.ok(enable?.includes("pubsub.googleapis.com"));
  assert.ok(enable?.includes("firebaseextensions.googleapis.com"));
  const bindings = calls.filter((call) => call.includes("add-iam-policy-binding"));
  assert.ok(bindings.some((call) => call.includes("--role=roles/run.admin")));
  assert.ok(bindings.some((call) => call.includes("--role=roles/datastore.indexAdmin")));
  assert.ok(DEPLOYER_ROLES.includes("roles/run.admin"));
  assert.equal(
    calls.some((call) => call[0] === "gcloud" && call[1] === "iam" && call[2] === "service-accounts" && call[3] === "create"),
    true
  );
});

test("provision reuses a database, bucket, and web app that already exist", async () => {
  const http: {url: string; method: string}[] = [];
  const files = new Map<string, string>();
  const deps: ProvisionDeps = {
    run(command, args) {
      const joined = args.join(" ");
      if (command === "gcloud" && args[0] === "version") return {status: 0, stdout: "ok", stderr: ""};
      if (joined.includes("application-default")) return {status: 0, stdout: "adc\n", stderr: ""};
      if (args[0] === "auth" && args[1] === "print-access-token") return {status: 0, stdout: "token\n", stderr: ""};
      if (joined.includes("projectNumber")) return {status: 0, stdout: "555\n", stderr: ""};
      if (args[0] === "projects" && args[1] === "describe") return {status: 0, stdout: "demo-app\n", stderr: ""};
      if (args[2] === "describe" && args[1] === "service-accounts") return {status: 0, stdout: "exists", stderr: ""};
      if (args[1] === "get-iam-policy") return {status: 0, stdout: DEPLOYER_ROLES.join("\n"), stderr: ""};
      return {status: 0, stdout: "", stderr: ""};
    },
    async request(url, init) {
      const method = init.method ?? "GET";
      http.push({url, method});
      if (url.includes(":addFirebase")) return {status: 409, body: "already a FirebaseProject"};
      if (url.includes("firestore") && method === "GET") {
        return {status: 200, body: JSON.stringify({name: "projects/demo-app/databases/(default)"})};
      }
      if (url.endsWith("/defaultBucket") && method === "GET") {
        return {status: 200, body: JSON.stringify({bucket: {name: "demo-app.firebasestorage.app"}})};
      }
      if (url.includes("identitytoolkit")) return {status: 200, body: "{}"};
      if (url.endsWith("/webApps") && method === "GET") {
        return {status: 200, body: JSON.stringify({apps: [{appId: web.appId, displayName: "Demo App"}]})};
      }
      if (url.includes("/config")) return {status: 200, body: JSON.stringify(web)};
      return {status: 200, body: "{}"};
    },
    readFile: (filePath) => files.get(filePath) ?? "",
    writeFile: (filePath, content) => {
      files.set(filePath, content);
    },
    sleep: async () => undefined,
    log: () => undefined,
    warn: () => undefined,
  };

  await provisionFirebaseProject(
    {
      projectId: "demo-app",
      projectName: "Demo App",
      region: "us-central1",
      repoRoot: "/repo",
      interactive: false,
    },
    deps
  );

  assert.equal(http.some((call) => call.url.includes("firestore") && call.method === "POST"), false);
  assert.equal(http.some((call) => call.url.endsWith("/webApps") && call.method === "POST"), false);
  assert.equal(http.some((call) => call.url.endsWith("/defaultBucket") && call.method === "POST"), false);
});
