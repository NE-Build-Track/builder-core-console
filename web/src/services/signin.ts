/**
 * Which key was pasted (decision D16). The engine has no "who am I" call (gap G13), so the console asks
 * two questions it can answer: may this key list keys (an admin key), and may it list its own jobs (any
 * working key). A builder's actor id comes from its newest job, when it has one.
 */
import type { AccessKey, Job } from "@/domain/engine";
import { describeProblem, type Reading } from "@/domain/reading";
import type { Area, KeyKind } from "@/domain/session";

export type Identity = { readonly kind: KeyKind; readonly actorId: string | null; readonly applicationId: string | null };

export type Classified = { readonly ok: true; readonly identity: Identity } | { readonly ok: false; readonly message: string };

function refused(reading: Reading<unknown>): string | null {
  if (reading.ok) return null;
  const problem = reading.problem;
  if (problem.kind === "http" && problem.status === 401) return "The engine does not accept this key: it is wrong, or it was revoked.";
  if (problem.kind === "http") return null;
  return `The engine could not be asked: ${describeProblem(problem)}.`;
}

export function classifyKey(area: Area, adminKeys: Reading<readonly AccessKey[]>, jobs: Reading<readonly Job[]>): Classified {
  const unusable = refused(adminKeys) ?? refused(jobs);
  if (unusable) return { ok: false, message: unusable };
  const admin = adminKeys.ok;
  if (area === "operator") {
    return admin
      ? { ok: true, identity: { kind: "admin", actorId: null, applicationId: null } }
      : { ok: false, message: "This key works but is not an admin key. Operator actions need an admin key." };
  }
  if (admin) return { ok: false, message: "This is an admin key. The Builder area uses an actor key: issue one in Operator actions." };
  if (!jobs.ok) return { ok: false, message: `The key cannot list its jobs: ${describeProblem(jobs.problem)}. It needs the jobs.read permission.` };
  const newest = jobs.value[0];
  return { ok: true, identity: { kind: "actor", actorId: newest?.actor_id ?? null, applicationId: newest?.application_id ?? null } };
}
