import type {AuditEntry, Profile, StaffGrant} from "../types/domain";

/**
 * In-memory fallback for unit tests and `npm run dev` without a Firebase
 * project. Live emulator tests and production use Firestore.
 */
export const memory = {
  profiles: new Map<string, Profile>(),
  staff: new Map<string, StaffGrant>(),
  audit: new Map<string, AuditEntry>(),
};

export function useMemoryStore(): boolean {
  return process.env.USE_MEMORY_STORE === "1" ||
    (!process.env.FIRESTORE_EMULATOR_HOST && process.env.NODE_ENV === "test");
}

export function resetMemoryStore(): void {
  memory.profiles.clear();
  memory.staff.clear();
  memory.audit.clear();
}
