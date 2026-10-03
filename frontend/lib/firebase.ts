import {getApp, getApps, initializeApp} from "firebase/app";
import {connectAuthEmulator, getAuth, type Auth} from "firebase/auth";
import {authEmulatorHost, firebaseConfigured, firebaseWebConfig} from "./config";

let emulatorConnected = false;

export function getFirebaseAuth(): Auth {
  if (!firebaseConfigured()) {
    throw new Error("Firebase web config is missing. See frontend/.env.example.");
  }
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig());
  const auth = getAuth(app);
  const host = authEmulatorHost();
  if (host && !emulatorConnected) {
    connectAuthEmulator(auth, `http://${host}`, {disableWarnings: true});
    emulatorConnected = true;
  }
  return auth;
}
