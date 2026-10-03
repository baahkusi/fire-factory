/**
 * Grant operator or admin by email.
 *
 *   npm run create-admin -- --email=you@example.com
 *   npm run create-admin -- --email=you@example.com --password='…' --role=operator
 *   npm run create-admin -- --emulator --email=you@example.com --password='…'
 *
 * Writes staff/{email}, profiles/{uid} when the Auth user exists, and
 * custom claims {roles}. Sign out and in once so the ID token refreshes.
 * If the Auth user does not exist yet, the staff row still applies on
 * first sign-in.
 */
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {initFirebaseAdmin} from "../utils/firebase-admin";
import {ask, askChoice, confirm} from "../utils/prompt";
import {loadScriptEnv, resolveScriptMode} from "../utils/script-env";

const ROLES = ["admin", "operator"] as const;
type StaffRole = (typeof ROLES)[number];

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function resolveInputs(): Promise<{
  email: string;
  role: StaffRole;
  displayName: string;
  password?: string;
}> {
  let email = (arg("email") ?? "").trim().toLowerCase();
  let role = (arg("role") ?? "admin").trim().toLowerCase();
  let displayName = (arg("name") ?? "").trim();
  const password = arg("password");

  if (!email) {
    // eslint-disable-next-line no-console
    console.log("\nGrant a staff role by email\n");
    email = (await ask("Email")).toLowerCase();
    displayName =
      displayName ||
      (await ask("Display name", {
        default: email.split("@")[0] || "Staff",
        required: false,
      }));
    role = await askChoice("Role", [...ROLES], "admin");
  }

  if (!email.includes("@")) {
    throw new Error("Pass --email=someone@example.com");
  }
  if (!ROLES.includes(role as StaffRole)) {
    throw new Error(`--role must be one of: ${ROLES.join(", ")}`);
  }
  if (!displayName) displayName = email.split("@")[0] || "Staff";

  return {email, role: role as StaffRole, displayName, password};
}

async function main() {
  const mode = loadScriptEnv(resolveScriptMode());
  initFirebaseAdmin();
  // eslint-disable-next-line no-console
  console.log(`Mode: ${mode}`);

  const inputs = await resolveInputs();
  const auth = getAuth();
  const db = getFirestore();
  const roles = [inputs.role];
  const now = new Date().toISOString();

  let uid: string | undefined;
  try {
    const user = await auth.getUserByEmail(inputs.email);
    uid = user.uid;
    // eslint-disable-next-line no-console
    console.log(`Found Firebase user ${uid}`);
    if (!flag("yes") && !arg("email")) {
      const ok = await confirm(
        `Mark ${inputs.email} as ${inputs.role}?`,
        true
      );
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log("Cancelled.");
        return;
      }
    }
    const existing = user.customClaims ?? {};
    await auth.setCustomUserClaims(uid, {...existing, roles});
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error ?
        String((error as {code?: string}).code) :
        "";
    if (code !== "auth/user-not-found") throw error;

    if (inputs.password && inputs.password.length >= 8) {
      const user = await auth.createUser({
        email: inputs.email,
        password: inputs.password,
        displayName: inputs.displayName,
        emailVerified: true,
      });
      uid = user.uid;
      await auth.setCustomUserClaims(uid, {roles});
      // eslint-disable-next-line no-console
      console.log(`Created Firebase user ${uid}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "No Auth user yet. Writing the staff grant. " +
          "It applies the first time this email signs in. " +
          "Pass --password= (8+ chars) to create the user now."
      );
    }
  }

  await db.collection("staff").doc(inputs.email).set({
    email: inputs.email,
    roles,
    active: true,
    displayName: inputs.displayName,
    uid: uid ?? null,
    updatedAt: now,
  });

  if (uid) {
    const profileRef = db.collection("profiles").doc(uid);
    const existing = await profileRef.get();
    const previous = existing.data() ?? {};
    await profileRef.set({
      uid,
      email: inputs.email,
      displayName:
        (typeof previous.displayName === "string" && previous.displayName) ||
        inputs.displayName,
      roles,
      updatedAt: now,
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Granted ${inputs.role} to ${inputs.email}.`);
  // eslint-disable-next-line no-console
  console.log("They must sign out and sign in once to refresh the ID token.");
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
