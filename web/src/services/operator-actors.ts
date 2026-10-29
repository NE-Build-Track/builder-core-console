/**
 * The Operator page's rows (decision D15): every actor the operator can act on, from the engine's actor
 * list and, when engine keys are on, the keys. Pure functions over readings.
 */
import type { AccessKey, Allowance, EngineGrant, KnownActor } from "@/domain/engine";
import type { Reading } from "@/domain/reading";

export type OperatorActor = {
  readonly applicationId: string;
  readonly actorId: string;
  /** The operator's label, else the identity provider's name (builder-core D48); null when neither. */
  readonly label: string | null;
  /** The identity provider's latest name for this person; null when they never signed in by token. */
  readonly name: string | null;
  readonly status: string | null;
  /** From the engine's list; null for an actor known only by a key. */
  readonly provisioned: boolean | null;
  readonly activeKeys: number;
  readonly revokedKeys: number;
  /** Null until read; the admin key reads allocations in its own application only (gap G9). */
  readonly allowance: Reading<Allowance> | null;
};

export type OperatorView = {
  readonly grants: Reading<readonly EngineGrant[]>;
  readonly unallocated: Readonly<Record<string, string>>;
  /** Null when engine keys are off (CONSOLE_AUTH=oidc, LPB_AUTH=jwt): the key actions are hidden. */
  readonly keys: Reading<readonly AccessKey[]> | null;
  readonly known: Reading<readonly KnownActor[]>;
  readonly actors: readonly OperatorActor[];
};

/**
 * Every actor the operator can act on: the engine's known actors (GET /v1/admin/actors: provisioned, or
 * people an identity provider signed in, with their names) and, when engine keys are on, any actor that
 * holds a key the engine does not list yet. Admin keys are not actors.
 */
export function actorsOf(known: Reading<readonly KnownActor[]>, keys: readonly AccessKey[] | null): readonly Omit<OperatorActor, "allowance">[] {
  const rows = new Map<string, Omit<OperatorActor, "allowance">>();
  for (const actor of known.ok ? known.value : []) {
    rows.set(`${actor.application_id}\u0000${actor.actor_id}`, {
      applicationId: actor.application_id,
      actorId: actor.actor_id,
      label: actor.label ? actor.label : null,
      name: actor.name ?? null,
      status: actor.allocation?.status ?? null,
      provisioned: actor.provisioned,
      activeKeys: 0,
      revokedKeys: 0,
    });
  }
  for (const holder of keys ? actorsFromKeys(keys) : []) {
    const id = `${holder.applicationId}\u0000${holder.actorId}`;
    const row = rows.get(id);
    rows.set(id, row ? { ...row, activeKeys: holder.activeKeys, revokedKeys: holder.revokedKeys } : { ...holder, label: null, name: null, status: null, provisioned: null });
  }
  return [...rows.values()].sort((a, b) => a.applicationId.localeCompare(b.applicationId) || a.actorId.localeCompare(b.actorId));
}

/** Actors as the keys show them, added to the engine's actor list for key holders it does not list yet. Admin keys are not actors. */
export function actorsFromKeys(keys: readonly AccessKey[]): readonly Omit<OperatorActor, "allowance" | "label" | "name" | "status" | "provisioned">[] {
  const byActor = new Map<string, { applicationId: string; actorId: string; activeKeys: number; revokedKeys: number }>();
  for (const key of keys) {
    if (key.kind === "admin") continue;
    const id = `${key.application_id}\u0000${key.actor_id}`;
    const row = byActor.get(id) ?? { applicationId: key.application_id, actorId: key.actor_id, activeKeys: 0, revokedKeys: 0 };
    if (key.revoked_at) row.revokedKeys += 1;
    else row.activeKeys += 1;
    byActor.set(id, row);
  }
  return [...byActor.values()].sort((a, b) => a.applicationId.localeCompare(b.applicationId) || a.actorId.localeCompare(b.actorId));
}
