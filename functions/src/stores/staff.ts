import {db} from "../providers/firebase";
import {COLLECTIONS, type StaffGrant} from "../types/domain";
import {memory, useMemoryStore} from "./memory";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findStaffByEmail(
  email: string
): Promise<StaffGrant | undefined> {
  const key = normalizeEmail(email);
  if (!key) return undefined;
  if (useMemoryStore()) return memory.staff.get(key);
  const snap = await db().collection(COLLECTIONS.staff).doc(key).get();
  if (!snap.exists) return undefined;
  return snap.data() as StaffGrant;
}

export async function upsertStaff(grant: StaffGrant): Promise<StaffGrant> {
  const stored: StaffGrant = {
    ...grant,
    email: normalizeEmail(grant.email),
    updatedAt: grant.updatedAt || new Date().toISOString(),
  };
  if (useMemoryStore()) {
    memory.staff.set(stored.email, stored);
    return stored;
  }
  await db().collection(COLLECTIONS.staff).doc(stored.email).set(stored);
  return stored;
}

export async function listStaff(): Promise<StaffGrant[]> {
  if (useMemoryStore()) {
    return [...memory.staff.values()].sort((a, b) =>
      a.email.localeCompare(b.email)
    );
  }
  const snap = await db().collection(COLLECTIONS.staff).get();
  return snap.docs
    .map((doc) => doc.data() as StaffGrant)
    .sort((a, b) => a.email.localeCompare(b.email));
}
