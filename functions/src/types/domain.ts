/** Factory roles. Products may add roles only by updating the SPEC first. */
export type Role = "member" | "operator" | "admin";

export const ROLES: readonly Role[] = ["member", "operator", "admin"];

export const PRIVILEGED_ROLES: readonly Role[] = ["operator", "admin"];

export const COLLECTIONS = {
  profiles: "profiles",
  staff: "staff",
  audit: "audit",
} as const;

export interface Profile {
  uid: string;
  email: string;
  displayName: string;
  roles: Role[];
  updatedAt: string;
}

export interface StaffGrant {
  email: string;
  roles: Role[];
  active: boolean;
  displayName: string;
  uid?: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  actorUid: string;
  action: string;
  target: string;
  at: string;
}
