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
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "→ Pushing to main..."
  git push -u origin main || echo "Push skipped or branch up to date."
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
  echo "→ Configuring Google Cloud Service Account (github-deployer)..."
  gcloud iam service-accounts create github-deployer \\
    --project="$PROJECT_ID" \\
    --description="Deploys Firebase Functions and Rules" || true

  ROLES=(
    roles/cloudfunctions.admin
    roles/iam.serviceAccountUser
    roles/firebaserules.admin
    roles/datastore.user
    roles/storage.admin
  )

  for r in "\${ROLES[@]}"; do
    echo "  • Granting $r..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \\
      --member="serviceAccount:github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \\
      --role="$r" >/dev/null
  done

  echo "→ Generating deployer service account key..."
  KEY_FILE="./github-key.json"
  gcloud iam service-accounts keys create "$KEY_FILE" \\
    --iam-account="github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \\
    --project="$PROJECT_ID"

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
  echo "gcloud CLI not installed. Run this script again after installing gcloud."
fi

# 3. Firebase App Hosting
FIREBASE_BIN="firebase"
if ! command -v firebase >/dev/null 2>&1; then
  if npx --no-install firebase --version >/dev/null 2>&1; then
    FIREBASE_BIN="npx firebase"
  else
    echo "⚠️  Firebase CLI not found in PATH."
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

if command -v firebase >/dev/null 2>&1 || [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
  echo "→ Creating Firebase App Hosting backend 'web'..."
  $FIREBASE_BIN apphosting:backends:create \\
    --project="$PROJECT_ID" \\
    --backend=web \\
    --primary-region="$REGION" \\
    --root-dir=frontend
else
  echo "firebase CLI not available. Install with: npm install -g firebase-tools"
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
          let serviceAccountReady = false;
          try {
            // eslint-disable-next-line no-console
            console.log("Creating service account 'github-deployer'...");
            execSync(
              `gcloud iam service-accounts create github-deployer --project="${projectId}" --description="Deploys Firebase Functions and Rules"`,
              { stdio: "inherit" }
            );
            serviceAccountReady = true;
          } catch {
            try {
              execSync(
                `gcloud iam service-accounts describe "github-deployer@${projectId}.iam.gserviceaccount.com" --project="${projectId}"`,
                { stdio: "ignore" }
              );
              // eslint-disable-next-line no-console
              console.log("Notice: Service account github-deployer already exists, proceeding...");
              serviceAccountReady = true;
            } catch {
              // eslint-disable-next-line no-console
              console.warn("\n❌ Service account 'github-deployer' could not be created or accessed.");
              // eslint-disable-next-line no-console
              console.warn("Skipping IAM bindings and key generation for now.");
            }
          }

          if (serviceAccountReady) {
            const roles = [
              "roles/cloudfunctions.admin",
              "roles/iam.serviceAccountUser",
              "roles/firebaserules.admin",
              "roles/datastore.user",
              "roles/storage.admin",
            ];
            for (const role of roles) {
              // eslint-disable-next-line no-console
              console.log(`Granting ${role}...`);
              try {
                execSync(
                  `gcloud projects add-iam-policy-binding "${projectId}" --member="serviceAccount:github-deployer@${projectId}.iam.gserviceaccount.com" --role="${role}"`,
                  { stdio: "ignore" }
                );
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn(`Warning: Could not bind ${role}:`, e instanceof Error ? e.message : e);
              }
            }

            const keyPath = path.join(REPO_ROOT, "github-key.json");
            try {
              // eslint-disable-next-line no-console
              console.log("Generating service account key...");
              execSync(
                `gcloud iam service-accounts keys create "${keyPath}" --iam-account="github-deployer@${projectId}.iam.gserviceaccount.com" --project="${projectId}"`,
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
        runFirebase(
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
