/**
 * Configure the Firebase project ID, project name, and data center region across the repository:
 *   - .firebaserc (projects.default)
 *   - firebase.json (firestore.location)
 *   - agent/environment.yaml (name, firebase_project_id, firebase_region, FB_PROJECT_ID)
 *   - package.json & workspace package.json files
 *   - Frontend UI & metadata (page.tsx, layout.tsx, apphosting.yaml)
 *   - Functions & scripts defaults (config.ts, firebase-admin.ts, script-env.ts)
 *   - Test & Docker configurations (docker-compose.test.yaml, emulator tests)
 *   - Environment files (.env.example, frontend/.env*, functions/.env*)
 *   - GitHub deployment workflows (.github/workflows/deploy.yaml)
 *
 * Usage:
 *   npm run set-project
 *   npm run set-project -- --project=your-firebase-project-id
 *   npm run set-project -- --project=your-firebase-project-id --name="Your Project Name" --region=us-central1
 *   npm run set-project -- --project=your-firebase-project-id --force
 *   npm run set-project -- --project=your-firebase-project-id --files-only
 *
 * Without --files-only, the command also provisions the existing Blaze project:
 * Web app, email/password Auth, Firestore, Storage, and deployer IAM.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { ask, confirm } from "../utils/prompt";
import { provisionFirebaseProject } from "./provision-firebase";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_FALLBACK_PROJECT_ID = "fire-factory";
const DEFAULT_REGION = "us-central1";

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

export function toTitleCase(str: string): string {
  return str
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function getCurrentProjectId(repoRoot = REPO_ROOT): string {
  const firebasercPath = path.join(repoRoot, ".firebaserc");
  if (fs.existsSync(firebasercPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(firebasercPath, "utf8"));
      if (
        typeof data?.projects?.default === "string" &&
        data.projects.default.trim()
      ) {
        return data.projects.default.trim();
      }
    } catch {
      // ignore JSON parse failure
    }
  }
  return DEFAULT_FALLBACK_PROJECT_ID;
}

export function getCurrentRegion(repoRoot = REPO_ROOT): string {
  const firebaseJsonPath = path.join(repoRoot, "firebase.json");
  if (fs.existsSync(firebaseJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(firebaseJsonPath, "utf8"));
      if (
        typeof data?.firestore?.location === "string" &&
        data.firestore.location.trim()
      ) {
        return data.firestore.location.trim();
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_REGION;
}

export function validateProjectId(id: string): {
  valid: boolean;
  message?: string;
} {
  if (!id) {
    return { valid: false, message: "Project ID cannot be empty" };
  }
  if (id.length < 6 || id.length > 30) {
    return {
      valid: false,
      message: `Project ID must be between 6 and 30 characters (got ${id.length})`,
    };
  }
  if (!/^[a-z]/.test(id)) {
    return {
      valid: false,
      message: "Project ID must start with a lowercase letter",
    };
  }
  if (!/[a-z0-9]$/.test(id)) {
    return {
      valid: false,
      message: "Project ID must end with a lowercase letter or number",
    };
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return {
      valid: false,
      message:
        "Project ID may only contain lowercase letters, numbers, and hyphens",
    };
  }
  return { valid: true };
}

export function validateRegion(region: string): {
  valid: boolean;
  message?: string;
} {
  if (!region) {
    return { valid: false, message: "Region cannot be empty" };
  }
  if (!/^[a-z]+-[a-z0-9]+$/.test(region)) {
    return {
      valid: false,
      message:
        "Region should follow standard GCP format (e.g. us-central1, europe-west1, asia-northeast1)",
    };
  }
  return { valid: true };
}

export function updateEnvFileContent(
  content: string,
  projectId: string,
  region: string
): string {
  let updated = content;

  // FB_FUNCTION_REGION=...
  updated = updated.replace(
    /^(\s*(?:FB_)?FUNCTION_REGION=)[^\r\n]*/m,
    `$1${region}`
  );

  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
  updated = updated.replace(
    /^(\s*NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=)[^\r\n]*/m,
    `$1${projectId}.firebaseapp.com`
  );

  // NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
  updated = updated.replace(
    /^(\s*NEXT_PUBLIC_FIREBASE_PROJECT_ID=)[^\r\n]*/m,
    `$1${projectId}`
  );

  // NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
  updated = updated.replace(
    /^(\s*NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=)[^\r\n]*/m,
    `$1${projectId}.firebasestorage.app`
  );

  // FB_PROJECT_ID=...
  updated = updated.replace(
    /^(\s*FB_PROJECT_ID=)[^\r\n]*/m,
    `$1${projectId}`
  );

  // # FB_STORAGE_BUCKET=... or FB_STORAGE_BUCKET=...
  updated = updated.replace(
    /^(\s*#?\s*FB_STORAGE_BUCKET=)[^\r\n]*/m,
    `$1${projectId}.firebasestorage.app`
  );

  return updated;
}

export function updateFirebaserc(
  repoRoot: string,
  projectId: string
): boolean {
  const filePath = path.join(repoRoot, ".firebaserc");
  let data: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      data = {};
    }
  }
  const projects =
    typeof data.projects === "object" && data.projects !== null ?
      (data.projects as Record<string, unknown>) :
      {};
  projects.default = projectId;
  data.projects = projects;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  return true;
}

export function updateFirebaseJson(
  repoRoot: string,
  region: string
): boolean {
  const filePath = path.join(repoRoot, "firebase.json");
  if (!fs.existsSync(filePath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (data.firestore) {
      data.firestore.location = region;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function updateEnvironmentYaml(
  repoRoot: string,
  projectId: string,
  projectName: string,
  region: string
): boolean {
  const filePath = path.join(repoRoot, "agent/environment.yaml");
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(/(name:\s*)[^\r\n]*/, `$1${projectName}`);
  content = content.replace(
    /(firebase_project_id:\s*)[^\s#]+(\s*#.*)?/,
    `$1${projectId}$2`
  );
  if (/firebase_region:/.test(content)) {
    content = content.replace(/(firebase_region:\s*)[^\s#]+(\s*#.*)?/, `$1${region}$2`);
  } else {
    content = content.replace(
      /(firebase_project_id:[^\r\n]*)/,
      `$1\n  firebase_region: ${region}`
    );
  }
  content = content.replace(/(FB_PROJECT_ID:\s*)[^\r\n]*/g, `$1${projectId}`);
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

export function updatePackageJson(
  repoRoot: string,
  projectId: string
): boolean {
  const filePath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(/("name":\s*")[^"]*(")/, `$1${projectId}$2`);
  content = content.replace(/(FB_PROJECT_ID=)[^\s\\]*/g, `$1${projectId}`);
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

export function updateSubpackageJson(
  filePath: string,
  packageName: string
): boolean {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(/("name":\s*")[^"]*(")/, `$1${packageName}$2`);
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

export function updateDockerCompose(
  repoRoot: string,
  projectId: string
): boolean {
  const filePath = path.join(repoRoot, "docker-compose.test.yaml");
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(/(name:\s*)[^\r\n]*-test/, `$1${projectId}-test`);
  content = content.replace(
    /(container_name:\s*)[^\r\n]*-emulators/,
    `$1${projectId}-emulators`
  );
  content = content.replace(/(GCLOUD_PROJECT:\s*)[^\r\n]*/, `$1${projectId}`);
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

export function updateFrontendUi(
  repoRoot: string,
  projectId: string,
  projectName: string
): { page: boolean; layout: boolean } {
  let page = false;
  let layout = false;

  const pagePath = path.join(repoRoot, "frontend/app/page.tsx");
  if (fs.existsSync(pagePath)) {
    let content = fs.readFileSync(pagePath, "utf8");
    content = content.replace(/(<p className="meta">)[^<]*(<\/p>)/, `$1${projectId}$2`);
    fs.writeFileSync(pagePath, content, "utf8");
    page = true;
  }

  const layoutPath = path.join(repoRoot, "frontend/app/layout.tsx");
  if (fs.existsSync(layoutPath)) {
    let content = fs.readFileSync(layoutPath, "utf8");
    content = content.replace(/(title:\s*")[^"]*(")/, `$1${projectName}$2`);
    content = content.replace(
      /(description:\s*")[^"]*(")/,
      `$1${projectName} on Firebase.$2`
    );
    fs.writeFileSync(layoutPath, content, "utf8");
    layout = true;
  }

  return { page, layout };
}

export function updateCodeDefaults(
  repoRoot: string,
  projectId: string,
  region: string
): string[] {
  const updatedFiles: string[] = [];

  const configPath = path.join(repoRoot, "functions/src/config.ts");
  if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, "utf8");
    content = content.replace(
      /(export const FACTORY_PROJECT_ID = ")[^"]*(";)/,
      `$1${projectId}$2`
    );
    content = content.replace(
      /(region:\s*(?:process\.env\.(?:FB_)?FUNCTION_REGION\?\.trim\(\)\s*\|\|\s*)+")[^"]*(")/,
      `$1${region}$2`
    );
    fs.writeFileSync(configPath, content, "utf8");
    updatedFiles.push("functions/src/config.ts");
  }

  const adminUtilPath = path.join(repoRoot, "scripts/utils/firebase-admin.ts");
  if (fs.existsSync(adminUtilPath)) {
    let content = fs.readFileSync(adminUtilPath, "utf8");
    content = content.replace(
      /(const DEFAULT_PROJECT_ID = ")[^"]*(";)/,
      `$1${projectId}$2`
    );
    fs.writeFileSync(adminUtilPath, content, "utf8");
    updatedFiles.push("scripts/utils/firebase-admin.ts");
  }

  const scriptEnvPath = path.join(repoRoot, "scripts/utils/script-env.ts");
  if (fs.existsSync(scriptEnvPath)) {
    let content = fs.readFileSync(scriptEnvPath, "utf8");
    content = content.replace(
      /(const DEFAULT_PROJECT_ID = ")[^"]*(";)/,
      `$1${projectId}$2`
    );
    fs.writeFileSync(scriptEnvPath, content, "utf8");
    updatedFiles.push("scripts/utils/script-env.ts");
  }

  const emulatorTestPath = path.join(
    repoRoot,
    "functions/test/emulators.firestore.test.ts"
  );
  if (fs.existsSync(emulatorTestPath)) {
    let content = fs.readFileSync(emulatorTestPath, "utf8");
    content = content.replace(
      /(process\.env\.FB_PROJECT_ID \?\? ")[^"]*(";)/,
      `$1${projectId}$2`
    );
    content = content.replace(
      /(projectId:\s*")[^"]*(-rules",?)/,
      `$1${projectId}$2`
    );
    fs.writeFileSync(emulatorTestPath, content, "utf8");
    updatedFiles.push("functions/test/emulators.firestore.test.ts");
  }

  const setupPath = path.join(repoRoot, "SETUP.md");
  if (fs.existsSync(setupPath)) {
    let content = fs.readFileSync(setupPath, "utf8");
    content = content.replace(
      /(export FB_PROJECT_ID=)[^\r\n]*/g,
      `$1${projectId}`
    );
    fs.writeFileSync(setupPath, content, "utf8");
    updatedFiles.push("SETUP.md");
  }

  return updatedFiles;
}

export function updateEnvFile(
  filePath: string,
  projectId: string,
  region: string
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, "utf8");
  const updated = updateEnvFileContent(original, projectId, region);
  if (original !== updated) {
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  }
  return false;
}

export function configureRepository(
  repoRoot: string,
  settings: {
    projectId: string;
    projectName: string;
    region: string;
    skipLocalEnvs?: boolean;
  }
): string[] {
  const {projectId, projectName, region} = settings;
  const modified: string[] = [];

  if (updateFirebaserc(repoRoot, projectId)) {
    modified.push(".firebaserc");
  }
  if (updateFirebaseJson(repoRoot, region)) {
    modified.push("firebase.json (firestore.location)");
  }
  if (updateEnvironmentYaml(repoRoot, projectId, projectName, region)) {
    modified.push("agent/environment.yaml");
  }
  if (updatePackageJson(repoRoot, projectId)) {
    modified.push("package.json");
  }
  const frontendPkg = path.join(repoRoot, "frontend/package.json");
  if (updateSubpackageJson(frontendPkg, `@${projectId}/frontend`)) {
    modified.push("frontend/package.json");
  }
  const scriptsPkg = path.join(repoRoot, "scripts/package.json");
  if (updateSubpackageJson(scriptsPkg, `@${projectId}/scripts`)) {
    modified.push("scripts/package.json");
  }

  const uiUpdates = updateFrontendUi(repoRoot, projectId, projectName);
  if (uiUpdates.page) modified.push("frontend/app/page.tsx");
  if (uiUpdates.layout) modified.push("frontend/app/layout.tsx");

  modified.push(...updateCodeDefaults(repoRoot, projectId, region));

  if (updateDockerCompose(repoRoot, projectId)) {
    modified.push("docker-compose.test.yaml");
  }

  for (const relPath of [".env.example", "frontend/.env.example", "functions/.env.example"]) {
    const fullPath = path.join(repoRoot, relPath);
    if (updateEnvFile(fullPath, projectId, region)) modified.push(relPath);
  }

  if (!settings.skipLocalEnvs) {
    const frontendLocal = path.join(repoRoot, "frontend/.env.local");
    const frontendExample = path.join(repoRoot, "frontend/.env.example");
    if (fs.existsSync(frontendLocal)) {
      if (updateEnvFile(frontendLocal, projectId, region)) modified.push("frontend/.env.local");
    } else if (fs.existsSync(frontendExample)) {
      fs.writeFileSync(
        frontendLocal,
        updateEnvFileContent(fs.readFileSync(frontendExample, "utf8"), projectId, region),
        "utf8"
      );
      modified.push("frontend/.env.local (created from example)");
    }

    const functionsLocal = path.join(repoRoot, "functions/.env");
    const functionsExample = path.join(repoRoot, "functions/.env.example");
    if (fs.existsSync(functionsLocal)) {
      if (updateEnvFile(functionsLocal, projectId, region)) modified.push("functions/.env");
    } else if (fs.existsSync(functionsExample)) {
      fs.writeFileSync(
        functionsLocal,
        updateEnvFileContent(fs.readFileSync(functionsExample, "utf8"), projectId, region),
        "utf8"
      );
      modified.push("functions/.env (created from example)");
    }
  }

  const rootLocal = path.join(repoRoot, ".env");
  if (fs.existsSync(rootLocal) && updateEnvFile(rootLocal, projectId, region)) {
    modified.push(".env");
  }

  const appHostingPath = path.join(repoRoot, "frontend/apphosting.yaml");
  if (fs.existsSync(appHostingPath)) {
    let content = fs.readFileSync(appHostingPath, "utf8");
    content = content.replace(
      /(variable:\s*NEXT_PUBLIC_FIREBASE_PROJECT_ID\s*\n\s*value:\s*")[^"]*(")/g,
      `$1${projectId}$2`
    );
    content = content.replace(
      /(variable:\s*NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN\s*\n\s*value:\s*")[^"]*(")/g,
      `$1${projectId}.firebaseapp.com$2`
    );
    content = content.replace(
      /(variable:\s*NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET\s*\n\s*value:\s*")[^"]*(")/g,
      `$1${projectId}.firebasestorage.app$2`
    );
    content = content.replace(
      /(variable:\s*NEXT_PUBLIC_API_BASE_URL\s*\n\s*value:\s*")[^"]*(")/g,
      `$1https://${region}-${projectId}.cloudfunctions.net/api$2`
    );
    fs.writeFileSync(appHostingPath, content, "utf8");
    modified.push("frontend/apphosting.yaml");
  }

  const deployWorkflowPath = path.join(repoRoot, ".github/workflows/deploy.yaml");
  if (fs.existsSync(deployWorkflowPath)) {
    let content = fs.readFileSync(deployWorkflowPath, "utf8");
    content = content.replace(
      /(--project\s+\${{\s*secrets\.FIREBASE_PROJECT_ID\s*\|\|\s*')[^']+('\s*}})/g,
      `$1${projectId}$2`
    );
    fs.writeFileSync(deployWorkflowPath, content, "utf8");
    modified.push(".github/workflows/deploy.yaml");
  }

  return modified;
}

async function main() {
  const explicitProject = (arg("project") ?? arg("id") ?? "").trim().toLowerCase();
  const explicitName = (arg("name") ?? "").trim();
  const explicitRegion = (arg("region") ?? "").trim().toLowerCase();
  const isInteractive = !explicitProject;

  let projectId = explicitProject;
  if (!projectId) {
    // eslint-disable-next-line no-console
    console.log("\nConfigure Firebase Project & Infrastructure\n");
    const current = getCurrentProjectId(REPO_ROOT);
    const answer = await ask("Firebase project ID", { default: current });
    projectId = answer.trim().toLowerCase();
  }

  const validation = validateProjectId(projectId);
  if (!validation.valid) {
    if (flag("force")) {
      // eslint-disable-next-line no-console
      console.warn(`Warning: ${validation.message} (proceeding due to --force)`);
    } else if (isInteractive) {
      // eslint-disable-next-line no-console
      console.warn(`\nWarning: ${validation.message}`);
      const proceed = await confirm("Use this project ID anyway?", false);
      if (!proceed) {
        throw new Error("Aborted by user.");
      }
    } else {
      throw new Error(
        `Invalid Firebase project ID: ${validation.message}. Use --force to override.`
      );
    }
  }

  let projectName = explicitName;
  if (!projectName) {
    const defaultName = toTitleCase(projectId);
    if (isInteractive) {
      const nameAnswer = await ask("Project display name", { default: defaultName });
      projectName = nameAnswer.trim() || defaultName;
    } else {
      projectName = defaultName;
    }
  }

  let region = explicitRegion;
  if (!region) {
    const currentRegion = getCurrentRegion(REPO_ROOT);
    if (isInteractive) {
      const regionAnswer = await ask(
        "Data center region (Firestore & Functions location)",
        { default: currentRegion }
      );
      region = regionAnswer.trim().toLowerCase() || currentRegion;
    } else {
      region = currentRegion;
    }
  }

  const regionValidation = validateRegion(region);
  if (!regionValidation.valid && !flag("force")) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: ${regionValidation.message}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nConfiguring Project: ${projectName} (${projectId}) in region [${region}]\n`);
  const modified = configureRepository(REPO_ROOT, {
    projectId,
    projectName,
    region,
    skipLocalEnvs: flag("no-env") || flag("skip-env"),
  });

  // eslint-disable-next-line no-console
  console.log("Updated files across repository:");
  for (const item of modified) {
    // eslint-disable-next-line no-console
    console.log(`  ✔ ${item}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nRepository files now point at "${projectName}" (${projectId}) in region ${region}.`
  );

  try {
    execSync("npm install --package-lock-only", { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    // ignore
  }
  let launchedGithub = false;
  const shouldPromptGithub = isInteractive && process.stdin.isTTY && !flag("no-prompt-github");
  if (shouldPromptGithub) {
    const runGithub = await confirm(
      "\nWould you like to run GitHub CI/CD & deployment setup now (npm run setup-github)?",
      true
    );
    if (runGithub) {
      launchedGithub = true;
      // eslint-disable-next-line no-console
      console.log("\nLaunching GitHub deployment setup...\n");
      const child = spawnSync(
        "npm",
        [
          "run",
          "setup-github",
          "--",
          `--project=${projectId}`,
          `--region=${region}`,
          `--name=${projectName}`,
          "--run",
        ],
        {cwd: REPO_ROOT, stdio: "inherit"}
      );
      if ((child.status ?? 1) !== 0) process.exit(child.status ?? 1);
    }
  }

  if (!launchedGithub && !flag("files-only")) {
    await provisionFirebaseProject({
      projectId,
      projectName,
      region,
      repoRoot: REPO_ROOT,
      interactive: isInteractive && Boolean(process.stdin.isTTY),
    });
  }

  // eslint-disable-next-line no-console
  console.log("\nNext steps:");
  // eslint-disable-next-line no-console
  console.log("  1. Create your first admin: npm run create-admin -- --email=you@example.com");
  // eslint-disable-next-line no-console
  console.log("  2. Deploy the base: push to main, or npm run deploy:base");
  // eslint-disable-next-line no-console
  console.log("  3. Define the product in agent/SPEC.md §1.4");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
