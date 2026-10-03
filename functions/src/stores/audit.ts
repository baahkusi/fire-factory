import {randomUUID} from "node:crypto";
import {db} from "../providers/firebase";
import {COLLECTIONS, type AuditEntry} from "../types/domain";
import {memory, useMemoryStore} from "./memory";

export async function appendAudit(input: {
  actorUid: string;
  action: string;
  target: string;
}): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: randomUUID(),
    actorUid: input.actorUid,
    action: input.action,
    target: input.target,
    at: new Date().toISOString(),
  };
  if (useMemoryStore()) {
    memory.audit.set(entry.id, entry);
    return entry;
  }
  await db().collection(COLLECTIONS.audit).doc(entry.id).set(entry);
  return entry;
}

export async function listAudit(): Promise<AuditEntry[]> {
  if (useMemoryStore()) {
    return [...memory.audit.values()].sort((a, b) => b.at.localeCompare(a.at));
  }
  const snap = await db().collection(COLLECTIONS.audit).get();
  return snap.docs
    .map((doc) => doc.data() as AuditEntry)
    .sort((a, b) => b.at.localeCompare(a.at));
}
