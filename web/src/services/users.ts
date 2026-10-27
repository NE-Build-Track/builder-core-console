/**
 * Users are the engine's actors: identities that hold access keys and, in per_actor mode, an allocation
 * of their own (docs/product-specs/console.md#users). The engine has no actor list (gap G2), so actors
 * come from the key list, and their money is read one actor at a time.
 */
import type { AccessKey } from "@/domain/engine";
import { ok } from "@/domain/reading";
import type { ActorView, UsersView } from "@/domain/views";
import type { Sources } from "@/ports/sources";
import { mapLimited } from "@/utils/concurrency";
import { sumDecimals } from "@/utils/decimal";

import { reconciliationVerdict } from "./reconciliation";
import { windowBounds } from "@/utils/time";

export type ActorKeys = { readonly applicationId: string; readonly actorId: string; readonly keys: readonly AccessKey[] };

/** Group non-admin keys by (application, actor), newest key first; admins are listed separately. */
export function groupKeys(keys: readonly AccessKey[]): { readonly actors: ActorKeys[]; readonly admins: AccessKey[] } {
  const actors = new Map<string, ActorKeys>();
  const admins: AccessKey[] = [];
  for (const key of keys) {
    if (key.kind === "admin") {
      admins.push(key);
      continue;
    }
    const id = `${key.application_id}\u0000${key.actor_id}`;
    const entry = actors.get(id) ?? { applicationId: key.application_id, actorId: key.actor_id, keys: [] };
    actors.set(id, { ...entry, keys: [...entry.keys, key] });
  }
  const byNewest = (left: AccessKey, right: AccessKey) => right.created_at.localeCompare(left.created_at);
  return {
    actors: [...actors.values()]
      .map((actor) => ({ ...actor, keys: [...actor.keys].sort(byNewest) }))
      .sort((left, right) => left.applicationId.localeCompare(right.applicationId) || left.actorId.localeCompare(right.actorId)),
    admins: admins.sort(byNewest),
  };
}

/** One actor before its money is read: from the engine's actor list, its keys, or both. */
type Listed = { readonly applicationId: string; readonly actorId: string; readonly label: string | null; readonly provisioned: boolean | null; readonly keys: readonly AccessKey[] };

export async function users(sources: Sources): Promise<UsersView> {
  const [keys, known, applicationReconciliation] = await Promise.all([
    sources.engine.keys(),
    sources.engine.actors(),
    sources.engine.reconciliation({ applicationId: sources.applicationId }),
  ]);
  // Under LPB_AUTH=jwt the engine has no key routes (404): its actor list (builder-core #53) is the only source.
  const keysOn = !(!keys.ok && keys.problem.kind === "http" && keys.problem.status === 404);
  if (!known.ok && !keys.ok) {
    return {
      actors: keysOn ? keys : known,
      keysOn,
      admins: [],
      applicationId: sources.applicationId,
      applicationReconciliation,
      counts: { actors: 0, applications: 0, activeKeys: 0, balanced: 0, unbalanced: 0 },
    };
  }
  const grouped = keys.ok ? groupKeys(keys.value) : { actors: [], admins: [] };
  const listed = new Map<string, Listed>();
  for (const actor of known.ok ? known.value : []) {
    listed.set(`${actor.application_id}\u0000${actor.actor_id}`, {
      applicationId: actor.application_id,
      actorId: actor.actor_id,
      label: actor.label ? actor.label : null,
      provisioned: actor.provisioned,
      keys: [],
    });
  }
  for (const holder of grouped.actors) {
    const id = `${holder.applicationId}\u0000${holder.actorId}`;
    const row = listed.get(id);
    listed.set(id, row ? { ...row, keys: holder.keys } : { ...holder, label: null, provisioned: null });
  }
  const actors = [...listed.values()].sort((a, b) => a.applicationId.localeCompare(b.applicationId) || a.actorId.localeCompare(b.actorId));
  const admins = grouped.admins;
  const readAt = known.ok ? known.readAt : keys.ok ? keys.readAt : sources.now().toISOString();
  const window = windowBounds("30d", sources.now());
  const rows = await mapLimited(actors, 4, async (actor): Promise<ActorView> => {
    // Allowance and cost reads use the admin key's own application (gap G9).
    const readable = actor.applicationId === sources.applicationId;
    const [allowance, costs, reconciliation] = await Promise.all([
      readable ? sources.engine.allowance(actor.actorId) : Promise.resolve(null),
      readable ? sources.engine.costSummary({ ...window, actorId: actor.actorId }) : Promise.resolve(null),
      sources.engine.reconciliation({ applicationId: actor.applicationId, actorId: actor.actorId }),
    ]);
    return {
      applicationId: actor.applicationId,
      actorId: actor.actorId,
      label: actor.label,
      provisioned: actor.provisioned,
      keys: actor.keys,
      activeKeys: actor.keys.filter((key) => key.revoked_at === null).length,
      allowance,
      costs,
      spentUsd: costs?.ok ? sumDecimals(Object.values(costs.value.by_class).map((fees) => fees.fee_usd ?? "0")).total : null,
      reconciliation,
    };
  });
  return {
    actors: ok("engine", rows, readAt),
    keysOn,
    admins,
    applicationId: sources.applicationId,
    applicationReconciliation,
    counts: {
      actors: rows.length,
      applications: new Set(rows.map((row) => row.applicationId)).size,
      activeKeys: rows.reduce((sum, row) => sum + row.activeKeys, 0),
      balanced: rows.filter((row) => row.reconciliation.ok && reconciliationVerdict(row.reconciliation.value).state === "ok").length,
      unbalanced: rows.filter((row) => row.reconciliation.ok && reconciliationVerdict(row.reconciliation.value).state === "warn").length,
    },
  };
}
