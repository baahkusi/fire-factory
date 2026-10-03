import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {AppConfig, FACTORY_PROJECT_ID} from "../config";

export function storageBucketName(): string {
  return (
    process.env.FB_STORAGE_BUCKET ??
    process.env.FIREBASE_STORAGE_BUCKET ??
    `${AppConfig.projectId || FACTORY_PROJECT_ID}.firebasestorage.app`
  );
}

let firestore: Firestore | null = null;
let firestoreConfigured = false;

export function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    projectId: AppConfig.projectId,
    storageBucket: storageBucketName(),
  });
}

export function db() {
  getAdminApp();
  if (!firestore) firestore = getFirestore();
  if (!firestoreConfigured) {
    firestore.settings({ignoreUndefinedProperties: true});
    firestoreConfigured = true;
  }
  return firestore;
}

export function auth() {
  getAdminApp();
  return getAuth();
}

export function storageBucket() {
  getAdminApp();
  return getStorage().bucket(storageBucketName());
}
