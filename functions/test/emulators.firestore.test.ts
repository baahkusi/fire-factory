import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {afterAll, describe, expect, it} from "vitest";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulatorHost)("Firestore emulator", () => {
  let dispose: (() => Promise<void>) | undefined;

  afterAll(async () => {
    await dispose?.();
  });

  it("completes an admin write/read round-trip", {timeout: 20_000}, async () => {
    const adminApp = await import("firebase-admin/app");
    const {getFirestore} = await import("firebase-admin/firestore");
    const {deleteApp, getApps, initializeApp} = adminApp;

    const projectId = process.env.FB_PROJECT_ID ?? "fire-factory";
    const app = getApps()[0] ?? initializeApp({projectId});
    dispose = async () => {
      await deleteApp(app);
      dispose = undefined;
    };

    const db = getFirestore(app);
    const ref = db.collection("health_checks").doc("smoke");
    await ref.set({ok: true, at: Date.now()});
    const snapshot = await ref.get();

    expect(snapshot.exists).toBe(true);
    expect(snapshot.data()?.ok).toBe(true);
  });
});

describe.skipIf(!emulatorHost)("Firestore rules", () => {
  let testEnv: RulesTestEnvironment | undefined;

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("lets a user read their profile and denies client writes", async () => {
    const [host, portRaw] = (emulatorHost ?? "127.0.0.1:8080").split(":");
    testEnv = await initializeTestEnvironment({
      projectId: "fire-factory-rules",
      firestore: {
        rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
        host,
        port: Number(portRaw),
      },
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("profiles/user-1").set({
        uid: "user-1",
        email: "a@example.com",
        displayName: "A",
        roles: ["member"],
      });
    });

    const self = testEnv.authenticatedContext("user-1").firestore();
    await assertSucceeds(self.doc("profiles/user-1").get());
    await assertFails(self.doc("profiles/user-1").set({displayName: "nope"}));

    const stranger = testEnv.authenticatedContext("user-2").firestore();
    await assertFails(stranger.doc("profiles/user-1").get());
    await assertFails(stranger.doc("staff/a@example.com").get());
  });
});
