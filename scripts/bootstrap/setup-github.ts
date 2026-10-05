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
  getCurrentProjectId,
  getCurrentRegion,
  toTitleCase,
  updateEnvironmentYaml,
  updateFirebaseJson,
  updateFirebaserc,
} from "./set-project";

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

function parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const sshMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

function getMissingGcpApis(projectId: string, requiredApis: string[]): string[] {
  try {
    const output = execSync(
      `gcloud services list --enabled --project="${projectId}" --format="value(config.name)"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const enabled = new Set(output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    return requiredApis.filter((api) => !enabled.has(api));
  } catch {
    return requiredApis;
  }
}

function serviceAccountExists(projectId: string, name: string): boolean {
  try {
    execSync(
      `gcloud iam service-accounts describe "${name}@${projectId}.iam.gserviceaccount.com" --project="${projectId}"`,
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

function getMissingIamRoles(projectId: string, saEmail: string, roles: string[]): string[] {
  try {
    const output = execSync(
      `gcloud projects get-iam-policy "${projectId}" --flatten="bindings[].members" --filter="bindings.members:serviceAccount:${saEmail}" --format="value(bindings.role)"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const granted = new Set(output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    return roles.filter((role) => !granted.has(role));
  } catch {
    return roles;
  }
}

function hasGithubSecret(secretName: string): boolean {
  if (!commandExists("gh")) return false;
  try {
    const list = execSync("gh secret list", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return list.includes(secretName);
  } catch {
    return false;
  }
}

function hasUserManagedKey(projectId: string, saEmail: string): boolean {
  try {
    const keys = execSync(
      `gcloud iam service-accounts keys list --iam-account="${saEmail}" --project="${projectId}" --filter="keyType:USER_MANAGED" --format="value(name)"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return keys.length > 0;
  } catch {
    return false;
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
  region: string
): string {
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
    value: "${projectId}.firebaseapp.com"
    availability:
      - BUILD
      - RUNTIME
  - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    value: "${projectId}.firebasestorage.app"
    availability:
      - BUILD
      - RUNTIME
  - variable: NEXT_PUBLIC_API_BASE_URL
    value: "https://${region}-${projectId}.cloudfunctions.net/api"
    availability:
      - BUILD
      - RUNTIME
`;
}

export function generateSetupDeploymentsScript(
  projectId: string,
  region: string
): string {
  return `#!/usr/bin/env bash
# Standalone automated setup script for GitHub Actions and Firebase App Hosting.
# Generated for Firebase Project: ${projectId} (Region: ${region})
set -euo pipefail

PROJECT_ID="${projectId}"
REGION="${region}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  Deployments Setup: $PROJECT_ID ($REGION)"
echo "=========================================================="

# 1. Commit and push repository
if [[ -n "$(git status --porcelain)" ]]; then
  echo "→ Committing working tree..."
  git add .
  git commit -m "Configure deployments for $PROJECT_ID"
else
  echo "✔ Git working tree is clean."
fi

if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin main >/dev/null 2>&1 || true
  LOCAL_REV="$(git rev-parse HEAD 2>/dev/null || true)"
  REMOTE_REV="$(git rev-parse origin/main 2>/dev/null || true)"
  if [[ -n "$LOCAL_REV" ]] && [[ "$LOCAL_REV" == "$REMOTE_REV" ]]; then
    echo "✔ Branch 'main' is already up to date with origin/main, skipping push."
  else
    echo "→ Pushing to main..."
    git push -u origin main || echo "Notice: Push skipped or branch up to date."
  fi
else
  echo "→ No git remote origin detected. Add with: git remote add origin <url>"
fi

# 2. Google Cloud Service Account
if ! command -v gcloud >/dev/null 2>&1; then
  echo "⚠️  Google Cloud SDK ('gcloud') not found in PATH."
  if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    read -p "Install gcloud now via Homebrew ('brew install --cask google-cloud-sdk')? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
      brew install --cask google-cloud-sdk
    fi
  else
    echo "Install gcloud manually: curl -sSL https://sdk.cloud.google.com | bash"
  fi
fi

if command -v gcloud >/dev/null 2>&1; then
  if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
    echo "⚠️  Google Cloud access denied or project not found for '$PROJECT_ID'."
    echo "   Verify authenticated account: gcloud config get-value account"
    echo "   Switch account if needed:    gcloud auth login"
  else
    echo "→ Checking Google Cloud APIs..."
    REQUIRED_APIS=(
      firebaseapphosting.googleapis.com
      developerconnect.googleapis.com
      run.googleapis.com
      cloudbuild.googleapis.com
      artifactregistry.googleapis.com
    )
    ENABLED_APIS="$(gcloud services list --enabled --project="$PROJECT_ID" --format="value(config.name)" 2>/dev/null || true)"
    MISSING_APIS=()
    for api in "\${REQUIRED_APIS[@]}"; do
      if ! echo "$ENABLED_APIS" | grep -qx "$api"; then
        MISSING_APIS+=("$api")
      fi
    done
    if [[ \${#MISSING_APIS[@]} -eq 0 ]]; then
      echo "✔ Required Google Cloud APIs already enabled, skipping."
    else
      echo "→ Enabling missing Google Cloud APIs: \${MISSING_APIS[*]}..."
      gcloud services enable "\${MISSING_APIS[@]}" --project="$PROJECT_ID" || true
    fi

    SA_EMAIL="github-deployer@$PROJECT_ID.iam.gserviceaccount.com"
    if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
      echo "✔ Service account 'github-deployer' already exists, skipping creation."
    else
      echo "→ Creating Google Cloud Service Account (github-deployer)..."
      gcloud iam service-accounts create github-deployer \\
        --project="$PROJECT_ID" \\
        --description="Deploys Firebase Functions and Rules" || true
    fi

    ROLES=(
      roles/cloudfunctions.admin
      roles/iam.serviceAccountUser
      roles/firebaserules.admin
      roles/datastore.user
      roles/storage.admin
    )

    ASSIGNED_ROLES="$(gcloud projects get-iam-policy "$PROJECT_ID" \\
      --flatten="bindings[].members" \\
      --filter="bindings.members:serviceAccount:$SA_EMAIL" \\
      --format="value(bindings.role)" 2>/dev/null || true)"

    for r in "\${ROLES[@]}"; do
      if echo "$ASSIGNED_ROLES" | grep -qx "$r"; then
        echo "✔ Role $r already granted to github-deployer, skipping."
      else
        echo "  • Granting $r..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \\
          --member="serviceAccount:$SA_EMAIL" \\
          --role="$r" >/dev/null || true
      fi
    done

    SECRET_SET=false
    if command -v gh >/dev/null 2>&1; then
      if gh secret list 2>/dev/null | grep -q "FIREBASE_SERVICE_ACCOUNT"; then
        SECRET_SET=true
      fi
    fi

    if [[ "$SECRET_SET" == "true" ]]; then
      echo "✔ GitHub Secret FIREBASE_SERVICE_ACCOUNT already configured, skipping key generation."
    else
      echo "→ Generating deployer service account key..."
      KEY_FILE="./github-key.json"
      if gcloud iam service-accounts keys create "$KEY_FILE" \\
        --iam-account="$SA_EMAIL" \\
        --project="$PROJECT_ID"; then
        if command -v gh >/dev/null 2>&1; then
          echo "→ Setting FIREBASE_SERVICE_ACCOUNT in GitHub Secrets via gh CLI..."
          gh secret set FIREBASE_SERVICE_ACCOUNT < "$KEY_FILE"
          rm -f "$KEY_FILE"
          echo "✔ GitHub Secret FIREBASE_SERVICE_ACCOUNT configured successfully!"
        elif [[ "$(uname)" == "Darwin" ]] && command -v pbcopy >/dev/null 2>&1; then
          pbcopy < "$KEY_FILE"
          rm -f "$KEY_FILE"
          echo "✔ Service account key copied to macOS clipboard (via pbcopy)!"
          echo "  Paste as secret 'FIREBASE_SERVICE_ACCOUNT' at: GitHub Settings -> Secrets -> Actions"
        else
          echo "✔ Service account key generated at: $KEY_FILE"
          echo "  Add as secret 'FIREBASE_SERVICE_ACCOUNT' in GitHub Settings, then securely delete $KEY_FILE."
        fi
      else
        echo "Notice: Could not generate key. You can generate one in Google Cloud Console IAM."
      fi
    fi
  fi
else
  echo "Notice: gcloud CLI not installed. Run this script again after installing gcloud."
fi

# 3. Firebase App Hosting
FIREBASE_BIN="firebase"
if ! command -v firebase >/dev/null 2>&1; then
  if npx --no-install firebase --version >/dev/null 2>&1; then
    FIREBASE_BIN="npx firebase"
  else
    echo "⚠️  Firebase CLI not found in PATH."
    if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
      read -p "Install firebase-cli via Homebrew ('brew install firebase-cli')? [Y/n] " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        brew install firebase-cli
        if command -v firebase >/dev/null 2>&1; then
          FIREBASE_BIN="firebase"
        fi
      fi
    fi
    if ! command -v firebase >/dev/null 2>&1; then
      read -p "Install firebase-tools globally ('npm install -g firebase-tools')? [Y/n] " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        npm install -g firebase-tools
        if command -v firebase >/dev/null 2>&1; then
          FIREBASE_BIN="firebase"
        fi
      fi
    fi
  fi
fi

if command -v firebase >/dev/null 2>&1 || [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
  BACKEND_LIST=""
  if [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
    BACKEND_LIST="$(npx firebase apphosting:backends:list --project="$PROJECT_ID" 2>/dev/null || true)"
  else
    BACKEND_LIST="$($FIREBASE_BIN apphosting:backends:list --project="$PROJECT_ID" 2>/dev/null || true)"
  fi

  if echo "$BACKEND_LIST" | grep -q "web"; then
    echo "✔ Firebase App Hosting backend 'web' already exists, skipping creation."
  else
    echo "→ Creating Firebase App Hosting backend 'web'..."
    $FIREBASE_BIN apphosting:backends:create \\
      --project="$PROJECT_ID" \\
      --backend=web \\
      --primary-region="$REGION" \\
      --root-dir=frontend || echo "Notice: App Hosting creation did not complete. Check Blaze plan and Developer Connect link."
  fi
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
  const explicitRemote = (arg("remote") ?? "").trim();

  let projectId = explicitProject || getCurrentProjectId(REPO_ROOT);
  let region = explicitRegion || getCurrentRegion(REPO_ROOT);

  if (projectId === "fire-factory" && !explicitProject && !isAutoYes && process.stdin.isTTY) {
    // eslint-disable-next-line no-console
    console.log("\nNotice: The project ID is currently the template default 'fire-factory'.");
    projectId = (await ask("Firebase project ID")).trim().toLowerCase();
    region = (await ask("Data center region", { default: region })).trim().toLowerCase();
    const projectName = toTitleCase(projectId);
    updateFirebaserc(REPO_ROOT, projectId);
    updateFirebaseJson(REPO_ROOT, region);
    updateEnvironmentYaml(REPO_ROOT, projectId, projectName, region);
  }

  // eslint-disable-next-line no-console
  console.log("\nSetting up GitHub Actions & Firebase Deployments\n");
  // eslint-disable-next-line no-console
  console.log(`Target Project: ${projectId}`);
  // eslint-disable-next-line no-console
  console.log(`Target Region:  ${region}\n`);

  const workflowsDir = path.join(REPO_ROOT, ".github/workflows");
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  const filesWritten: string[] = [];

  // 1. CI Workflow
  const ciPath = path.join(workflowsDir, "ci.yaml");
  fs.writeFileSync(ciPath, generateCiWorkflow(), "utf8");
  filesWritten.push(".github/workflows/ci.yaml");

  // 2. Deploy Workflow (Functions & Rules)
  const deployPath = path.join(workflowsDir, "deploy.yaml");
  fs.writeFileSync(deployPath, generateDeployWorkflow(projectId), "utf8");
  filesWritten.push(".github/workflows/deploy.yaml");

  // 3. App Hosting Config
  const appHostingPath = path.join(REPO_ROOT, "frontend/apphosting.yaml");
  fs.writeFileSync(appHostingPath, generateAppHostingYaml(projectId, region), "utf8");
  filesWritten.push("frontend/apphosting.yaml");

  // 4. Standalone Deployment Setup Shell Script
  const scriptPath = path.join(REPO_ROOT, "scripts/bootstrap/setup-deployments.sh");
  fs.writeFileSync(scriptPath, generateSetupDeploymentsScript(projectId, region), "utf8");
  fs.chmodSync(scriptPath, 0o755);
  filesWritten.push("scripts/bootstrap/setup-deployments.sh (executable)");

  // eslint-disable-next-line no-console
  console.log("Generated Deployment & CI Files:");
  for (const file of filesWritten) {
    // eslint-disable-next-line no-console
    console.log(`  ✔ ${file}`);
  }

  // Determine git remote
  let remote = explicitRemote || getGitRemote();

  // Execution flow: offer to run the automated steps directly
  let shouldExecute = isAutoYes || flag("run");
  if (flag("generate-only") || flag("no-run")) {
    shouldExecute = false;
  } else if (!isAutoYes && !flag("run")) {
    shouldExecute = await confirm(
      "\nWould you like to execute the automated setup steps now (Git, gcloud, App Hosting)?",
      true
    );
  }

  if (shouldExecute) {
    // eslint-disable-next-line no-console
    console.log("\n--- Step 1: Git Repository & Push ---");

    // Commit changes if dirty
    try {
      const status = execSync("git status --porcelain", {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim();
      if (status) {
        // eslint-disable-next-line no-console
        console.log("Committing changes to git...");
        execSync("git add .", { cwd: REPO_ROOT });
        execSync(`git commit -m "Configure deployments for ${projectId}"`, {
          cwd: REPO_ROOT,
        });
        // eslint-disable-next-line no-console
        console.log("✔ Changes committed.");
      } else {
        // eslint-disable-next-line no-console
        console.log("✔ Git working tree is clean.");
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Notice: Git commit could not be completed automatically (run manually if needed):", e instanceof Error ? e.message : e);
    }

    if (!remote && !isAutoYes) {
      const enteredRemote = await ask(
        "Enter your GitHub repository remote URL (or press Enter to skip)",
        { required: false }
      );
      if (enteredRemote) {
        remote = enteredRemote.trim();
        try {
          execSync(`git remote add origin ${remote}`, { cwd: REPO_ROOT });
          // eslint-disable-next-line no-console
          console.log(`✔ Remote origin added: ${remote}`);
        } catch {
          // ignore if already added
        }
      }
    }

    if (remote) {
      if (isGitBranchPushed()) {
        // eslint-disable-next-line no-console
        console.log("✔ Branch 'main' is already up to date with remote origin, skipping push.");
      } else {
        try {
          // eslint-disable-next-line no-console
          console.log("Pushing to GitHub remote main...");
          execSync("git push -u origin main", { cwd: REPO_ROOT, stdio: "inherit" });
          // eslint-disable-next-line no-console
          console.log("✔ Pushed to GitHub main.");
        } catch {
          // eslint-disable-next-line no-console
          console.warn("Notice: Push did not complete. You can run 'git push -u origin main' manually.");
        }
      }
    }

    // --- Step 2: Google Cloud Service Account ---
    // eslint-disable-next-line no-console
    console.log("\n--- Step 2: Google Cloud Service Account (GitHub Actions Deployer) ---");
    const hasGcloud = await ensureGcloudCli(isAutoYes);
    if (hasGcloud) {
      let runGcloud = isAutoYes;
      if (!runGcloud) {
        runGcloud = await confirm(
          `Create GitHub deployer service account and assign IAM roles in Google Cloud project (${projectId})?`,
          true
        );
      }
      if (runGcloud) {
        // Pre-check access to the project
        let activeAccount = "";
        try {
          activeAccount = execSync("gcloud config get-value account", {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim();
        } catch {
          // ignore
        }

        let hasProjectAccess = false;
        try {
          execSync(`gcloud projects describe "${projectId}"`, {
            stdio: ["ignore", "pipe", "ignore"],
          });
          hasProjectAccess = true;
        } catch {
          // eslint-disable-next-line no-console
          console.warn(`\n⚠️  Google Cloud access denied or project not found for "${projectId}".`);
          if (activeAccount) {
            // eslint-disable-next-line no-console
            console.warn(`   Authenticated in gcloud as: ${activeAccount}`);
          }
          // eslint-disable-next-line no-console
          console.log("\n   Possible causes:");
          // eslint-disable-next-line no-console
          console.log(`   1. Account mismatch: Was ${projectId} created under a different Google account?`);
          // eslint-disable-next-line no-console
          console.log("      Run 'gcloud auth list' to see accounts, or 'gcloud auth login' to switch.");
          // eslint-disable-next-line no-console
          console.log(`   2. Missing IAM role: Grant ${activeAccount || "your email"} 'Owner' or 'Editor' in Google Cloud Console:`);
          // eslint-disable-next-line no-console
          console.log(`      https://console.cloud.google.com/iam-admin/iam?project=${projectId}`);
          // eslint-disable-next-line no-console
          console.log("   3. Project ID mismatch: Check Firebase Console -> Project Settings -> General -> Project ID.\n");

          if (process.stdin.isTTY && !isAutoYes) {
            const reauth = await confirm(
              "Would you like to log in to the account that owns this Firebase project now ('gcloud auth login')?",
              true
            );
            if (reauth) {
              spawnSync("gcloud", ["auth", "login"], { stdio: "inherit" });
              try {
                execSync(`gcloud projects describe "${projectId}"`, {
                  stdio: ["ignore", "pipe", "ignore"],
                });
                hasProjectAccess = true;
                // eslint-disable-next-line no-console
                console.log(`✔ Access verified for project ${projectId}!`);
              } catch {
                // eslint-disable-next-line no-console
                console.warn(`Could not verify access to ${projectId}. Skipping service account creation.`);
              }
            }
          }
        }

        if (hasProjectAccess) {
          const requiredApis = [
            "firebaseapphosting.googleapis.com",
            "developerconnect.googleapis.com",
            "run.googleapis.com",
            "cloudbuild.googleapis.com",
            "artifactregistry.googleapis.com",
          ];
          const missingApis = getMissingGcpApis(projectId, requiredApis);
          if (missingApis.length === 0) {
            // eslint-disable-next-line no-console
            console.log("✔ Required Google Cloud APIs already enabled, skipping.");
          } else {
            // eslint-disable-next-line no-console
            console.log(`Enabling missing Google Cloud APIs: ${missingApis.join(", ")}...`);
            try {
              execSync(
                `gcloud services enable ${missingApis.join(" ")} --project="${projectId}"`,
                { stdio: "inherit" }
              );
              // eslint-disable-next-line no-console
              console.log("✔ Required Google Cloud APIs enabled!");
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn("Notice: Could not enable all APIs automatically (Blaze plan may be required):", e instanceof Error ? e.message : e);
            }
          }

          let serviceAccountReady = false;
          if (serviceAccountExists(projectId, "github-deployer")) {
            // eslint-disable-next-line no-console
            console.log("✔ Service account 'github-deployer' already exists, skipping creation.");
            serviceAccountReady = true;
          } else {
            try {
              // eslint-disable-next-line no-console
              console.log("Creating service account 'github-deployer'...");
              execSync(
                `gcloud iam service-accounts create github-deployer --project="${projectId}" --description="Deploys Firebase Functions and Rules"`,
                { stdio: "inherit" }
              );
              serviceAccountReady = true;
            } catch {
              if (serviceAccountExists(projectId, "github-deployer")) {
                // eslint-disable-next-line no-console
                console.log("✔ Service account 'github-deployer' already exists, proceeding...");
                serviceAccountReady = true;
              } else {
                // eslint-disable-next-line no-console
                console.warn("\n❌ Service account 'github-deployer' could not be created or accessed.");
                // eslint-disable-next-line no-console
                console.warn("Skipping IAM bindings and key generation for now.");
              }
            }
          }

          if (serviceAccountReady) {
            const saEmail = `github-deployer@${projectId}.iam.gserviceaccount.com`;
            const roles = [
              "roles/cloudfunctions.admin",
              "roles/iam.serviceAccountUser",
              "roles/firebaserules.admin",
              "roles/datastore.user",
              "roles/storage.admin",
            ];
            const missingRoles = getMissingIamRoles(projectId, saEmail, roles);
            if (missingRoles.length === 0) {
              // eslint-disable-next-line no-console
              console.log("✔ All IAM roles already granted to github-deployer, skipping.");
            } else {
              for (const role of missingRoles) {
                // eslint-disable-next-line no-console
                console.log(`Granting ${role}...`);
                try {
                  execSync(
                    `gcloud projects add-iam-policy-binding "${projectId}" --member="serviceAccount:${saEmail}" --role="${role}"`,
                    { stdio: "ignore" }
                  );
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.warn(`Warning: Could not bind ${role}:`, e instanceof Error ? e.message : e);
                }
              }
            }

            const secretAlreadySet = hasGithubSecret("FIREBASE_SERVICE_ACCOUNT");
            if (secretAlreadySet) {
              // eslint-disable-next-line no-console
              console.log("✔ GitHub secret FIREBASE_SERVICE_ACCOUNT already configured, skipping key generation.");
            } else {
              const keyPath = path.join(REPO_ROOT, "github-key.json");
              try {
                // eslint-disable-next-line no-console
                console.log("Generating service account key...");
                execSync(
                  `gcloud iam service-accounts keys create "${keyPath}" --iam-account="${saEmail}" --project="${projectId}"`,
                  { stdio: "inherit" }
                );

                const hasGh = commandExists("gh");
                if (hasGh) {
                  // eslint-disable-next-line no-console
                  console.log("Setting FIREBASE_SERVICE_ACCOUNT in GitHub Repository Secrets via gh CLI...");
                  execSync(`gh secret set FIREBASE_SERVICE_ACCOUNT < "${keyPath}"`, {
                    cwd: REPO_ROOT,
                    stdio: "inherit",
                  });
                  fs.unlinkSync(keyPath);
                  // eslint-disable-next-line no-console
                  console.log("✔ Secret FIREBASE_SERVICE_ACCOUNT set in GitHub!");
                } else if (process.platform === "darwin" && commandExists("pbcopy")) {
                  execSync(`pbcopy < "${keyPath}"`);
                  fs.unlinkSync(keyPath);
                  // eslint-disable-next-line no-console
                  console.log("\n✔ Service account JSON key copied to your clipboard via pbcopy!");
                  const ghDetails = remote ? parseGitHubRepo(remote) : null;
                  const secretUrl = ghDetails
                    ? `https://github.com/${ghDetails.owner}/${ghDetails.repo}/settings/secrets/actions/new`
                    : "https://github.com/<owner>/<repo>/settings/secrets/actions/new";
                  // eslint-disable-next-line no-console
                  console.log(`  Go to: ${secretUrl}`);
                  // eslint-disable-next-line no-console
                  console.log("  Add Secret Name: FIREBASE_SERVICE_ACCOUNT");
                  // eslint-disable-next-line no-console
                  console.log("  Paste key: Cmd+V");
                } else {
                  // eslint-disable-next-line no-console
                  console.log(`✔ Key saved to ${keyPath}. Add to GitHub Secrets as FIREBASE_SERVICE_ACCOUNT, then delete.`);
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("Notice: Key generation failed:", e instanceof Error ? e.message : e);
                // eslint-disable-next-line no-console
                console.log("You can generate the key manually in the Google Cloud Console under IAM -> Service Accounts.");
              }
            }
          }
        } else {
          // eslint-disable-next-line no-console
          console.log("\nSkipping service account setup for now. You can run './scripts/bootstrap/setup-deployments.sh' once access is granted.\n");
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("Notice: gcloud CLI not ready. You can run './scripts/bootstrap/setup-deployments.sh' after installing.");
    }

    // --- Step 3: Firebase App Hosting Backend ---
    // eslint-disable-next-line no-console
    console.log("\n--- Step 3: Firebase App Hosting Backend ---");
    const firebaseCmd = await ensureFirebaseCli(isAutoYes);
    if (firebaseCmd) {
      if (appHostingBackendExists(firebaseCmd, projectId, "web")) {
        // eslint-disable-next-line no-console
        console.log("✔ Firebase App Hosting backend 'web' already exists, skipping creation.");
      } else {
        let createAppHosting = isAutoYes;
        if (!createAppHosting) {
          createAppHosting = await confirm(
            `Run '${firebaseCmd} apphosting:backends:create' for backend 'web' in region '${region}' now?`,
            true
          );
        }
        if (createAppHosting) {
          // eslint-disable-next-line no-console
          console.log(`Executing ${firebaseCmd} apphosting:backends:create...`);
          const result = runFirebase(
            firebaseCmd,
            [
              "apphosting:backends:create",
              "--project",
              projectId,
              "--backend",
              "web",
              "--primary-region",
              region,
              "--root-dir",
              "frontend",
            ]
          );

          if (result.status !== 0) {
            // eslint-disable-next-line no-console
            console.warn("\n⚠️  Firebase App Hosting backend creation did not complete successfully.");
            // eslint-disable-next-line no-console
            console.log("Why this happens on fresh projects:");
            // eslint-disable-next-line no-console
            console.log("  1. Blaze Plan Required: App Hosting provisions Cloud Run services, which are blocked on the free Spark plan.");
            // eslint-disable-next-line no-console
            console.log(`     Upgrade in Firebase Console: https://console.firebase.google.com/project/${projectId}/overview`);
            // eslint-disable-next-line no-console
            console.log("  2. GitHub Repository Link: Google Cloud Developer Connect requires linking your GitHub repository.");
            // eslint-disable-next-line no-console
            console.log(`     Link in Firebase Console: https://console.firebase.google.com/project/${projectId}/apphosting`);
            // eslint-disable-next-line no-console
            console.log(`     Or re-run interactively in terminal: firebase apphosting:backends:create --project ${projectId}\n`);
          } else {
            // eslint-disable-next-line no-console
            console.log("✔ Firebase App Hosting backend 'web' created successfully!");
          }
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("Notice: Firebase CLI not ready. You can configure App Hosting backend after installing.");
    }

    // --- Step 4: Base Deployment & Next Lifecycle Steps ---
    // eslint-disable-next-line no-console
    console.log("\n--- Step 4: Base Deployment & Lifecycle Progression ---");
    // eslint-disable-next-line no-console
    console.log("Your base skeleton is now ready for deployment!");
    // eslint-disable-next-line no-console
    console.log("  • Deploy base: push to 'main' (or run: npm run deploy:base)");
    // eslint-disable-next-line no-console
    console.log(`  • Verify live posture: npm run production-posture -- --api=https://${region}-${projectId}.cloudfunctions.net/api`);
    // eslint-disable-next-line no-console
    console.log("\nRemaining product lifecycle:");
    // eslint-disable-next-line no-console
    console.log("  1. Define specs: Write your product requirements in agent/SPEC.md §1.4");
    // eslint-disable-next-line no-console
    console.log("  2. Remaining steps generate: Ask agent to append rows to agent/PLAN.md and create agent/implementation/ notes");
    // eslint-disable-next-line no-console
    console.log("  3. Finish work & deploy: Build step-by-step, approve, and push to deploy");
    // eslint-disable-next-line no-console
    console.log("  4. Enter maintenance: Declare Maintenance phase and record subsequent changes in agent/maintenance/");
    // eslint-disable-next-line no-console
    console.log("  5. Keep updating: Discrete maintenance requests per change\n");
  } else {
    // If user chose not to run steps now, show them the standalone script location
    // eslint-disable-next-line no-console
    console.log("\nTo run the full deployment setup at any time without copy-pasting, execute:");
    // eslint-disable-next-line no-console
    console.log("  ./scripts/bootstrap/setup-deployments.sh\n");
  }

  // eslint-disable-next-line no-console
  console.log("Setup completed successfully!\n");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
