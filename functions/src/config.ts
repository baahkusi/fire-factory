export const FACTORY_PROJECT_ID = "fire-factory";

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.FUNCTIONS_EMULATOR !== "true"
  );
}

/** Fail closed: memory store and test auth must never ship to production. */
export function assertProductionSafety(): void {
  if (!isProductionRuntime()) return;
  const problems: string[] = [];
  if (process.env.ALLOW_TEST_AUTH === "1") {
    problems.push("ALLOW_TEST_AUTH=1 is forbidden in production.");
  }
  if (process.env.USE_MEMORY_STORE === "1") {
    problems.push(
      "USE_MEMORY_STORE=1 is forbidden in production. Unset it for durable Firestore."
    );
  }
  if (problems.length > 0) {
    throw new Error(problems.join(" "));
  }
}

export const AppConfig = {
  apiRateLimitMax: 120,
  apiRateLimitWindowMs: 60_000,
  serviceName: "fire-factory",
  region: process.env.FUNCTION_REGION?.trim() || "us-central1",
  projectId:
    process.env.FB_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    FACTORY_PROJECT_ID,
  isProduction: isProductionRuntime(),
  siteUrl: process.env.PUBLIC_SITE_URL?.trim() || "",
} as const;

function configuredOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const listed = configuredOrigins().some((allowed) => {
      try {
        return new URL(allowed).origin === parsed.origin;
      } catch {
        return false;
      }
    });
    if (listed) return true;
    if (AppConfig.siteUrl) {
      try {
        if (parsed.origin === new URL(AppConfig.siteUrl).origin) return true;
      } catch {
        /* invalid PUBLIC_SITE_URL */
      }
    }
    if (!AppConfig.isProduction) {
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".local")
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

assertProductionSafety();
