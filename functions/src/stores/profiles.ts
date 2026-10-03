import {AppError} from "../error";
import {db} from "../providers/firebase";
import {COLLECTIONS, type Profile, type Role} from "../types/domain";
import {memory, useMemoryStore} from "./memory";

function now(): string {
  return new Date().toISOString();
}

export async function getProfile(uid: string): Promise<Profile | undefined> {
  if (useMemoryStore()) return memory.profiles.get(uid);
  const snap = await db().collection(COLLECTIONS.profiles).doc(uid).get();
  if (!snap.exists) return undefined;
  return snap.data() as Profile;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const stored: Profile = {...profile, updatedAt: profile.updatedAt || now()};
  if (useMemoryStore()) {
    memory.profiles.set(stored.uid, stored);
    return stored;
  }
  await db().collection(COLLECTIONS.profiles).doc(stored.uid).set(stored);
  return stored;
}

/**
 * Create or refresh the profile from a resolved session.
 * Keeps an existing display name when the caller does not supply one.
 */
export async function touchProfile(input: {
  uid: string;
  email?: string;
  displayName?: string;
  roles: Role[];
}): Promise<Profile> {
  const existing = await getProfile(input.uid);
  const profile: Profile = {
    uid: input.uid,
    email: (input.email ?? existing?.email ?? "").trim().toLowerCase(),
    displayName:
      existing?.displayName ||
      input.displayName?.trim() ||
      input.email?.split("@")[0] ||
      "Member",
    roles: input.roles,
    updatedAt: now(),
  };
  return saveProfile(profile);
}

export async function updateDisplayName(
  uid: string,
  displayName: string
): Promise<Profile> {
  const existing = await getProfile(uid);
  if (!existing) {
    throw new AppError("not-found", "Profile not found.", 404);
  }
  return saveProfile({
    ...existing,
    displayName,
    updatedAt: now(),
  });
}
