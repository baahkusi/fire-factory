/**
 * Configure the Firebase project ID across .firebaserc, agent/environment.yaml,
 * and environment files (.env.example, frontend/.env*, functions/.env*).
 *
 * Usage:
 *   npm run set-project
 *   npm run set-project -- --project=your-firebase-project-id
 *   npm run set-project -- --project=your-firebase-project-id --force
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { ask, confirm } from "../utils/prompt";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_FALLBACK_PROJECT_ID = "fire-factory-si";

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

export function updateEnvFileContent(
  content: string,
  projectId: string
): string {
  let updated = content;

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

export function updateEnvironmentYaml(
  repoRoot: string,
  projectId: string
): boolean {
  const filePath = path.join(repoRoot, "agent/environment.yaml");
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf8");
  content = content.replace(
    /(firebase_project_id:\s*)[^\s#]+(\s*#.*)?/,
    `$1${projectId}$2`
  );
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

export function updateEnvFile(filePath: string, projectId: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, "utf8");
  const updated = updateEnvFileContent(original, projectId);
  if (original !== updated) {
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  }
  return false;
}

async function main() {
  const explicitProject = (arg("project") ?? arg("id") ?? "").trim().toLowerCase();
  const isInteractive = !explicitProject;

  let projectId = explicitProject;
  if (!projectId) {
    // eslint-disable-next-line no-console
    console.log("\nConfigure Firebase Project ID\n");
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

  // eslint-disable-next-line no-console
  console.log(`\nSetting Firebase project to: ${projectId}\n`);
  const modified: string[] = [];

  // 1. .firebaserc
  if (updateFirebaserc(REPO_ROOT, projectId)) {
    modified.push(".firebaserc");
  }

  // 2. agent/environment.yaml
  if (updateEnvironmentYaml(REPO_ROOT, projectId)) {
    modified.push("agent/environment.yaml");
  }

  // 3. Env examples
  const exampleFiles = [
    ".env.example",
    "frontend/.env.example",
    "functions/.env.example",
  ];
  for (const relPath of exampleFiles) {
    const fullPath = path.join(REPO_ROOT, relPath);
    if (updateEnvFile(fullPath, projectId)) {
      modified.push(relPath);
    }
  }

  // 4. Local frontend and functions envs (created and synced by default)
  const skipLocalEnvs = flag("no-env") || flag("skip-env");

  if (!skipLocalEnvs) {
    // frontend/.env.local
    const frontendLocal = path.join(REPO_ROOT, "frontend/.env.local");
    const frontendExample = path.join(REPO_ROOT, "frontend/.env.example");
    if (fs.existsSync(frontendLocal)) {
      if (updateEnvFile(frontendLocal, projectId)) {
        modified.push("frontend/.env.local");
      }
    } else if (fs.existsSync(frontendExample)) {
      const content = updateEnvFileContent(
        fs.readFileSync(frontendExample, "utf8"),
        projectId
      );
      fs.writeFileSync(frontendLocal, content, "utf8");
      modified.push("frontend/.env.local (created from example)");
    }

    // functions/.env
    const functionsLocal = path.join(REPO_ROOT, "functions/.env");
    const functionsExample = path.join(REPO_ROOT, "functions/.env.example");
    if (fs.existsSync(functionsLocal)) {
      if (updateEnvFile(functionsLocal, projectId)) {
        modified.push("functions/.env");
      }
    } else if (fs.existsSync(functionsExample)) {
      const content = updateEnvFileContent(
        fs.readFileSync(functionsExample, "utf8"),
        projectId
      );
      fs.writeFileSync(functionsLocal, content, "utf8");
      modified.push("functions/.env (created from example)");
    }
  }

  // 6. Root .env if present
  const rootLocal = path.join(REPO_ROOT, ".env");
  if (fs.existsSync(rootLocal)) {
    if (updateEnvFile(rootLocal, projectId)) {
      modified.push(".env");
    }
  }

  // eslint-disable-next-line no-console
  console.log("Updated files:");
  for (const item of modified) {
    // eslint-disable-next-line no-console
    console.log(`  ✔ ${item}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nSuccessfully configured Firebase project to "${projectId}".`);
  // eslint-disable-next-line no-console
  console.log("\nNext steps:");
  // eslint-disable-next-line no-console
  console.log(
    "  1. Fill in your Firebase web credentials in frontend/.env.local (API key, App ID, etc.)"
  );
  // eslint-disable-next-line no-console
  console.log("  2. Run 'npm test' to verify test suites");
  // eslint-disable-next-line no-console
  console.log(
    "  3. Create your first admin with: npm run create-admin -- --email=you@example.com"
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
