/**
 * Fail if a deployed API is still on the memory store.
 *
 *   npm run production-posture -- --api=https://<region>-<project>.cloudfunctions.net/api
 */
function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit?.slice(prefix.length);
}

async function main() {
  const base = (arg("api") ?? process.env.PUBLIC_API_URL ?? "").replace(
    /\/$/,
    ""
  );
  if (!base) {
    throw new Error("Pass --api=https://<functions-host>/api or the function origin");
  }
  const healthUrl = base.endsWith("/health") ? base : `${base}/health`;
  const health = await fetch(healthUrl).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Health HTTP ${response.status} from ${healthUrl}`);
    }
    return response.json() as Promise<{store?: string; status?: string}>;
  });

  const failures: string[] = [];
  if (health.status !== "ok") failures.push("health status is not ok");
  if (health.store !== "firestore") {
    failures.push(`store is ${health.store ?? "unknown"}, expected firestore`);
  }
  if (failures.length) {
    // eslint-disable-next-line no-console
    console.error("Production posture FAILED:");
    for (const item of failures) {
      // eslint-disable-next-line no-console
      console.error(`  · ${item}`);
    }
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("Production posture OK:", health);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
