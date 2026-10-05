/**
 * Set up GitHub Actions CI/CD workflows and execute or guide the user through
 * configuring GitHub deployments for Cloud Functions and Firebase App Hosting.
 *
 * Usage:
 *   npm run setup-github
 *   npm run setup-github -- --yes
 *   npm run setup-github -- --project=your-firebase-project-id --region=us-central1
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { ask, confirm } from "../utils/prompt";
import {
  configureRepository,
  getCurrentProjectId,
  getCurrentRegion,
  toTitleCase,
} from "./set-project";
import {
  publishGithubDeployerSecret,
  provisionFirebaseProject,
  readWebConfig,
  type FirebaseWebConfig,
} from "./provision-firebase";

const REPO_ROOT = path.resolve(__dirname, "../..");

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function flag(name: string): boolean {
  return (
    process.argv.includes(`--${name}`) ||
    (name === "yes" && process.argv.includes("-y"))
  );
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function ensureFirebaseCli(isAutoYes: boolean): Promise<string | null> {
  if (commandExists("firebase")) {
    return "firebase";
  }

  // Check if local devDependency or npx works
  try {
    const localBin = path.join(REPO_ROOT, "node_modules/.bin/firebase");
    if (fs.existsSync(localBin)) {
      return localBin;
    }
    execSync("npx --no-install firebase --version", { stdio: "ignore", cwd: REPO_ROOT });
    return "npx firebase";
  } catch {
    // neither found
  }

  // eslint-disable-next-line no-console
  console.log("\n⚠️  Firebase CLI ('firebase') was not found in PATH.");
  let shouldInstall = isAutoYes;
  if (!shouldInstall && process.stdin.isTTY) {
    shouldInstall = await confirm(
      "Would you like to install Firebase CLI globally now ('npm install -g firebase-tools')?",
      true
    );
  }

  if (shouldInstall) {
    // eslint-disable-next-line no-console
    console.log("Installing firebase-tools globally via npm...");
    try {
      spawnSync("npm", ["install", "-g", "firebase-tools"], { stdio: "inherit" });
      if (commandExists("firebase")) {
        // eslint-disable-next-line no-console
        console.log("✔ Firebase CLI installed successfully!");
        return "firebase";
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Global npm install failed:", e instanceof Error ? e.message : e);
    }
  }

  // eslint-disable-next-line no-console
  console.log("\nTo install Firebase CLI manually, run:");
  // eslint-disable-next-line no-console
  console.log("  npm install -g firebase-tools");
  // eslint-disable-next-line no-console
  console.log("  # or: curl -sL https://firebase.tools | bash\n");
  return null;
}

export async function ensureGcloudCli(isAutoYes: boolean): Promise<boolean> {
  if (commandExists("gcloud")) {
    // Check if user is logged in
    try {
      const activeAccount = execSync(
        "gcloud auth list --filter=status:ACTIVE --format='value(account)'",
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      if (!activeAccount && process.stdin.isTTY && !isAutoYes) {
        // eslint-disable-next-line no-console
        console.log("\n⚠️  No active Google Cloud account detected in gcloud.");
        const login = await confirm(
          "Would you like to log in to Google Cloud now ('gcloud auth login')?",
          true
        );
        if (login) {
          spawnSync("gcloud", ["auth", "login"], { stdio: "inherit" });
        }
      }
    } catch {
      // ignore auth check error
    }
    return true;
  }

  // eslint-disable-next-line no-console
  console.log("\n⚠️  Google Cloud SDK ('gcloud') is not installed or not in PATH.");
  // eslint-disable-next-line no-console
  console.log("gcloud is needed to provision service accounts and assign deployment IAM roles.");

  let offerInstall = false;
  let installCommand = "";
  let isBrew = false;

  if (process.platform === "darwin" && commandExists("brew")) {
    offerInstall = true;
    installCommand = "brew install --cask google-cloud-sdk";
    isBrew = true;
  } else if (process.platform === "linux" || process.platform === "darwin") {
    offerInstall = true;
    installCommand = "curl -sSL https://sdk.cloud.google.com | bash";
  }

  if (offerInstall) {
    let shouldInstall = isAutoYes;
    if (!shouldInstall && process.stdin.isTTY) {
      shouldInstall = await confirm(
        `Would you like to install Google Cloud SDK now via '${installCommand}'?`,
        true
      );
    }

    if (shouldInstall) {
      // eslint-disable-next-line no-console
      console.log(`\nExecuting: ${installCommand}...\n`);
      try {
        if (isBrew) {
          spawnSync("brew", ["install", "--cask", "google-cloud-sdk"], { stdio: "inherit" });
        } else {
          execSync("curl -sSL https://sdk.cloud.google.com | bash", { stdio: "inherit" });
        }
        if (commandExists("gcloud")) {
          // eslint-disable-next-line no-console
          console.log("✔ Google Cloud SDK installed successfully!");
          return true;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Installation attempt failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log("\nTo install Google Cloud SDK manually:");
  if (process.platform === "darwin" && commandExists("brew")) {
    // eslint-disable-next-line no-console
    console.log("  brew install --cask google-cloud-sdk");
  } else {
    // eslint-disable-next-line no-console
    console.log("  curl -sSL https://sdk.cloud.google.com | bash");
  }
  // eslint-disable-next-line no-console
  console.log("  Documentation: https://cloud.google.com/sdk/docs/install\n");
  // eslint-disable-next-line no-console
  console.log("After installing, run: ./scripts/bootstrap/setup-deployments.sh\n");
  return false;
}

export function runFirebase(
  cmdString: string,
  args: string[],
  cwd: string = REPO_ROOT
) {
  if (cmdString === "npx firebase") {
    return spawnSync("npx", ["firebase", ...args], { cwd, stdio: "inherit" });
  }
  return spawnSync(cmdString, args, { cwd, stdio: "inherit" });
}

function getGitRemote(): string | null {
  try {
    const out = execSync("git remote get-url origin", {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function isGitBranchPushed(): boolean {
  try {
    execSync("git fetch origin main", { cwd: REPO_ROOT, stdio: "ignore" });
    const local = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const remote = execSync("git rev-parse origin/main", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    return local === remote;
  } catch {
    return false;
  }
}

function appHostingBackendExists(cmd: string, projectId: string, backendId: string): boolean {
  try {
    let out = "";
    if (cmd === "npx firebase") {
      out = execSync(`npx firebase apphosting:backends:list --project="${projectId}"`, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } else {
      out = execSync(`${cmd} apphosting:backends:list --project="${projectId}"`, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    }
    return out.includes(backendId);
  } catch {
    return false;
  }
}

export function generateCiWorkflow(): string {
  return `name: CI

on:
  push:
    branches:
      - main
      - 'feat/**'
      - 'fix/**'
  pull_request:
    branches:
      - main

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: Lint, Typecheck, Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install root dependencies
        run: npm ci

      - name: Install frontend dependencies
        run: npm --prefix frontend ci

      - name: Run lint
        run: npm run lint

      - name: Run typecheck
        run: npm run typecheck

      - name: Run unit tests
        run: npm test
`;
}

export function generateDeployWorkflow(projectId: string): string {
  return `name: Deploy Firebase Backend

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: deploy-firebase
  cancel-in-progress: false

jobs:
  verify:
    name: Quality Checks
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install root dependencies
        run: npm ci

      - name: Install frontend dependencies
        run: npm --prefix frontend ci

      - name: Run checks
        run: |
          npm run lint
          npm run typecheck
          npm test

  deploy:
    name: Deploy Rules & Functions
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install root dependencies
        run: npm ci

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}

      - name: Deploy Rules & Indexes
        run: npx firebase deploy --only firestore:rules,firestore:indexes,storage --project \${{ secrets.FIREBASE_PROJECT_ID || '${projectId}' }}

      - name: Deploy Cloud Functions
        run: npx firebase deploy --only functions --project \${{ secrets.FIREBASE_PROJECT_ID || '${projectId}' }}
`;
}

export function generateAppHostingYaml(
  projectId: string,
  region: string,
  web?: FirebaseWebConfig | null
): string {
  const authDomain = web?.authDomain || `${projectId}.firebaseapp.com`;
  const bucket = web?.storageBucket || `${projectId}.firebasestorage.app`;
  const webKeys = web ?
    `  - variable: NEXT_PUBLIC_FIREBASE_API_KEY
    value: "${web.apiKey}"
    availability:
      - BUILD
      - RUNTIME
  - variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    value: "${web.messagingSenderId}"
    availability:
      - BUILD
      - RUNTIME
  - variable: NEXT_PUBLIC_FIREBASE_APP_ID
    value: "${web.appId}"
    availability:
      - BUILD
      - RUNTIME
` :
    "";
  return `# Firebase App Hosting configuration for frontend
# Documentation: https://firebase.google.com/docs/app-hosting/configure

runConfig:
  minInstances: 0
  maxInstances: 5
  concurrency: 80
  cpu: 1
  memoryMiB: 512

# Environment variables injected at build and runtime
env:
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: "${projectId}"
    availability:
      - BUILD
      - RUNTIME
  - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    value: "${authDomain}"
    availability:
      - BUILD
      - RUNTIME
  - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    value: "${bucket}"
    availability:
      - BUILD
      - RUNTIME
${webKeys}  - variable: NEXT_PUBLIC_API_BASE_URL
    value: "https://${region}-${projectId}.cloudfunctions.net/api"
    availability:
      - BUILD
      - RUNTIME
`;
}

export function generateSetupDeploymentsScript(
  projectId: string,
  region: string,
  appId = ""
): string {
  const appArg = appId ? ` --app "$WEB_APP_ID"` : "";
  return `#!/usr/bin/env bash
# Re-run provisioning, the GitHub deployer secret, and App Hosting.
# Generated for Firebase Project: ${projectId} (Region: ${region})
set -euo pipefail

PROJECT_ID="${projectId}"
REGION="${region}"
WEB_APP_ID="${appId}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  Deployments Setup: $PROJECT_ID ($REGION)"
echo "=========================================================="

echo "→ Provisioning Firebase (Firestore, Storage, Auth, Web app, deployer)..."
npm run provision -- --project="$PROJECT_ID" --region="$REGION" --yes

if [[ -n "$(git status --porcelain)" ]]; then
  echo "→ Committing working tree..."
  git add .
  git commit -m "Configure deployments for $PROJECT_ID" || echo "Notice: commit skipped."
else
  echo "✔ Git working tree is clean."
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "→ Pushing to main..."
  git push -u origin main || echo "Notice: push skipped."
else
  echo "→ No git remote origin detected. Add with: git remote add origin <url>"
fi

echo "→ Publishing the GitHub deployer secret..."
npm run provision -- --project="$PROJECT_ID" --region="$REGION" --yes --secret-only

FIREBASE_BIN="firebase"
if ! command -v firebase >/dev/null 2>&1; then
  if npx --no-install firebase --version >/dev/null 2>&1; then
    FIREBASE_BIN="npx firebase"
  fi
fi

if command -v firebase >/dev/null 2>&1 || [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
  echo "→ Creating App Hosting backend 'web'."
  echo "  The first run opens a browser so you can authorize the GitHub repository."
  $FIREBASE_BIN apphosting:backends:create --project="$PROJECT_ID" --backend=web --primary-region="$REGION" --root-dir=frontend${appArg} || echo "Notice: App Hosting creation did not complete. Re-run after firebase login."
else
  echo "Notice: firebase CLI not available. Install with: npm install -g firebase-tools"
fi

echo ""
echo "✔ Deployment setup complete for $PROJECT_ID!"
`;
}

async function main() {
  const isAutoYes = flag("yes");
  const explicitProject = (arg("project") ?? arg("id") ?? "").trim().toLowerCase();
  const explicitRegion = (arg("region") ?? "").trim().toLowerCase();
  const explicitName = (arg("name") ?? "").trim();
  const explicitRemote = (arg("remote") ?? "").trim();
  const interactive = !isAutoYes && Boolean(process.stdin.isTTY);

  let projectId = explicitProject || getCurrentProjectId(REPO_ROOT);
  let region = explicitRegion || getCurrentRegion(REPO_ROOT);
  const templateIds = new Set(["fire-factory", "fire-factory-si"]);
  if (!explicitProject && !isAutoYes && interactive && templateIds.has(projectId)) {
    // eslint-disable-next-line no-console
    console.log(`\nNotice: The project ID is currently the template default '${projectId}'.`);
    projectId = (await ask("Firebase project ID")).trim().toLowerCase();
    const regionAnswer = (await ask("Data center region", {default: region})).trim().toLowerCase();
    region = regionAnswer || region;
  }

  const projectName = explicitName || toTitleCase(projectId);
  // eslint-disable-next-line no-console
  console.log("\nSetting up GitHub Actions & Firebase Deployments\n");
  // eslint-disable-next-line no-console
  console.log(`Target Project: ${projectName} (${projectId})`);
  // eslint-disable-next-line no-console
  console.log(`Target Region:  ${region}\n`);

  const stamped = configureRepository(REPO_ROOT, {projectId, projectName, region});
  if (stamped.length > 0) {
    // eslint-disable-next-line no-console
    console.log("Stamped project id into repository files:");
    for (const file of stamped) {
      // eslint-disable-next-line no-console
      console.log(`  ✔ ${file}`);
    }
  }

  let shouldExecute = isAutoYes || flag("run");
  if (flag("generate-only") || flag("no-run")) {
    shouldExecute = false;
  } else if (!isAutoYes && !flag("run")) {
    shouldExecute = await confirm(
      "\nProvision this Firebase project and connect GitHub deploy now?",
      true
    );
  }

  let web: FirebaseWebConfig | null = null;
  if (shouldExecute) {
    await ensureGcloudCli(isAutoYes);
    web = await provisionFirebaseProject({
      projectId,
      projectName,
      region,
      repoRoot: REPO_ROOT,
      interactive,
    });
  } else {
    const localPath = path.join(REPO_ROOT, "frontend/.env.local");
    if (fs.existsSync(localPath)) {
      web = readWebConfig(fs.readFileSync(localPath, "utf8"));
    }
  }

  const workflowsDir = path.join(REPO_ROOT, ".github/workflows");
  fs.mkdirSync(workflowsDir, {recursive: true});
  const filesWritten: string[] = [];
  const ciPath = path.join(workflowsDir, "ci.yaml");
  fs.writeFileSync(ciPath, generateCiWorkflow(), "utf8");
  filesWritten.push(".github/workflows/ci.yaml");
  const deployPath = path.join(workflowsDir, "deploy.yaml");
  fs.writeFileSync(deployPath, generateDeployWorkflow(projectId), "utf8");
  filesWritten.push(".github/workflows/deploy.yaml");
  const appHostingPath = path.join(REPO_ROOT, "frontend/apphosting.yaml");
  fs.writeFileSync(appHostingPath, generateAppHostingYaml(projectId, region, web), "utf8");
  filesWritten.push("frontend/apphosting.yaml");
  const scriptPath = path.join(REPO_ROOT, "scripts/bootstrap/setup-deployments.sh");
  fs.writeFileSync(
    scriptPath,
    generateSetupDeploymentsScript(projectId, region, web?.appId ?? ""),
    "utf8"
  );
  fs.chmodSync(scriptPath, 0o755);
  filesWritten.push("scripts/bootstrap/setup-deployments.sh (executable)");

  // eslint-disable-next-line no-console
  console.log("\nGenerated deployment files:");
  for (const file of filesWritten) {
    // eslint-disable-next-line no-console
    console.log(`  ✔ ${file}`);
  }

  if (!shouldExecute) {
    // eslint-disable-next-line no-console
    console.log("\nRe-run with ./scripts/bootstrap/setup-deployments.sh when you want cloud provisioning.\n");
    return;
  }

  let remote = explicitRemote || getGitRemote();
  // eslint-disable-next-line no-console
  console.log("\n--- Git repository ---");
  try {
    const status = execSync("git status --porcelain", {cwd: REPO_ROOT, encoding: "utf8"}).trim();
    if (status) {
      execSync("git add .", {cwd: REPO_ROOT});
      execSync(`git commit -m "Configure deployments for ${projectId}"`, {cwd: REPO_ROOT});
      // eslint-disable-next-line no-console
      console.log("✔ Changes committed.");
    } else {
      // eslint-disable-next-line no-console
      console.log("✔ Git working tree is clean.");
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      "Notice: Git commit did not complete:",
      error instanceof Error ? error.message : error
    );
  }

  if (!remote && interactive) {
    const enteredRemote = await ask(
      "Enter your GitHub repository remote URL (or press Enter to skip)",
      {required: false}
    );
    if (enteredRemote) {
      remote = enteredRemote.trim();
      try {
        execSync(`git remote add origin ${remote}`, {cwd: REPO_ROOT});
        // eslint-disable-next-line no-console
        console.log(`✔ Remote origin added: ${remote}`);
      } catch {
        // origin already exists
      }
    }
  }

  if (remote) {
    if (isGitBranchPushed()) {
      // eslint-disable-next-line no-console
      console.log("✔ Branch main is already up to date with origin.");
    } else {
      try {
        execSync("git push -u origin main", {cwd: REPO_ROOT, stdio: "inherit"});
        // eslint-disable-next-line no-console
        console.log("✔ Pushed to GitHub main.");
      } catch {
        // eslint-disable-next-line no-console
        console.warn("Notice: Push did not complete. Run 'git push -u origin main'.");
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log("\n--- GitHub deployer secret ---");
  try {
    await publishGithubDeployerSecret({projectId, repoRoot: REPO_ROOT, interactive});
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      "Notice: GitHub secret was not set:",
      error instanceof Error ? error.message : error
    );
  }

  // eslint-disable-next-line no-console
  console.log("\n--- Firebase App Hosting ---");
  const firebaseCmd = await ensureFirebaseCli(isAutoYes);
  if (!firebaseCmd) {
    // eslint-disable-next-line no-console
    console.log("Install the Firebase CLI, then re-run ./scripts/bootstrap/setup-deployments.sh");
  } else if (appHostingBackendExists(firebaseCmd, projectId, "web")) {
    // eslint-disable-next-line no-console
    console.log("✔ Firebase App Hosting backend 'web' already exists.");
  } else {
    const loggedIn = runFirebase(firebaseCmd, ["projects:list"]);
    if (loggedIn.status !== 0 && interactive) {
      // eslint-disable-next-line no-console
      console.log("\nFirebase CLI is not logged in. Starting 'firebase login'...\n");
      runFirebase(firebaseCmd, ["login"]);
    }
    const createArgs = [
      "apphosting:backends:create",
      "--project",
      projectId,
      "--backend",
      "web",
      "--primary-region",
      region,
      "--root-dir",
      "frontend",
    ];
    if (web?.appId) createArgs.push("--app", web.appId);
    // eslint-disable-next-line no-console
    console.log("The first App Hosting create opens a browser to authorize GitHub.");
    const result = runFirebase(firebaseCmd, createArgs);
    if (result.status !== 0) {
      // eslint-disable-next-line no-console
      console.warn("\nApp Hosting backend was not created.");
      // eslint-disable-next-line no-console
      console.log("Finish the GitHub authorization, then re-run:");
      // eslint-disable-next-line no-console
      console.log(`  firebase apphosting:backends:create --project ${projectId} --backend web --primary-region ${region} --root-dir frontend`);
    } else {
      // eslint-disable-next-line no-console
      console.log("✔ Firebase App Hosting backend 'web' created.");
    }
  }

  // eslint-disable-next-line no-console
  console.log("\nCloud project is provisioned.");
  // eslint-disable-next-line no-console
  console.log(`  Verify after deploy: npm run production-posture -- --api=https://${region}-${projectId}.cloudfunctions.net/api`);
  // eslint-disable-next-line no-console
  console.log("  First admin: npm run create-admin -- --email=you@example.com");
  // eslint-disable-next-line no-console
  console.log("  Product spec: agent/SPEC.md §1.4\n");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
