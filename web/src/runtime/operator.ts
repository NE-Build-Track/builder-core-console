import "server-only";

import { engineWriter } from "@/adapters/engine/writer";
import { readConfig } from "@/config/config";
import { callOf, type ActionInput, type ActionState } from "@/domain/operator";
import type { Session } from "@/domain/session";
import { actorsOf, outcomeOf, parseAction, reviewOf, type OperatorView, type ReviewContext } from "@/services/operator";

import { forgetReads, loadMoney } from "./console";
import { engineUrl, keyed } from "./session";

/**
 * The Operator actions' two steps (decision D17): review reads the stack and shows exactly the call that
 * will be sent; commit parses the form again, checks the typed confirmation, sends that call with the
 * signed-in admin key, and forgets cached reads so the pages show the change.
 */

const SKIP = new Set(["intent", "confirm"]);

/** The form's own values, kept through review so Back and the commit re-send exactly what was typed. */
export function valuesOf(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (typeof value === "string" && !SKIP.has(name) && !name.startsWith("$")) values[name] = value;
  return values;
}

/** Each grant's unallocated balance from the Batteries ledger (shared reads; empty when Batteries is unreadable). */
async function unallocatedByGrant(): Promise<Record<string, string>> {
  forgetReads();
  const view = await loadMoney();
  if (!view.grants.ok) return {};
  return Object.fromEntries(view.grants.value.flatMap((item) => (item.unallocated === null ? [] : [[item.grant.id, item.unallocated]])));
}

async function contextFor(session: Session, input: ActionInput): Promise<ReviewContext> {
  const engine = keyed(session.token);
  const unavailable = { ok: false as const, source: "engine" as const, problem: { kind: "not_configured" as const, detail: "CONSOLE_ENGINE_URL" }, readAt: new Date().toISOString() };
  if (!engine) return { grants: unavailable, allowance: null, key: null, unallocated: {} };
  const actorId = "actorId" in input ? input.actorId : null;
  const wantsAllowance = input.action === "fundAllocation" || input.action === "setStatus";
  const drawsOnGrant = input.action === "provision" || input.action === "fundAllocation";
  const [grants, allowance, key, unallocated] = await Promise.all([
    engine.grants(),
    wantsAllowance && actorId ? engine.allowance(actorId) : Promise.resolve(null),
    "keyId" in input ? engine.adminKey(input.keyId) : Promise.resolve(null),
    drawsOnGrant ? unallocatedByGrant() : Promise.resolve({}),
  ]);
  return { grants, allowance, key, unallocated };
}

export async function reviewAction(session: Session, form: FormData): Promise<ActionState> {
  const values = valuesOf(form);
  const input = parseAction(form);
  if (!input.ok) return { step: "fill", values, error: { field: input.field, message: input.message } };
  return { step: "review", values, review: reviewOf(input.value, await contextFor(session, input.value)) };
}

export async function commitAction(session: Session, form: FormData): Promise<ActionState> {
  const values = valuesOf(form);
  const input = parseAction(form);
  if (!input.ok) return { step: "fill", values, error: { field: input.field, message: input.message } };
  const review = reviewOf(input.value, await contextFor(session, input.value));
  if (review.confirm) {
    const typed = form.get("confirm");
    if (typeof typed !== "string" || typed.trim() !== review.confirm.expect) {
      return { step: "review", values, review, error: `Type ${review.confirm.expect} exactly to confirm.` };
    }
  }
  const url = engineUrl();
  if (!url) return { step: "fill", values, error: { message: "The console has no engine URL (CONSOLE_ENGINE_URL)." } };
  const writer = engineWriter(url, session.token, { timeoutMs: readConfig().timeoutMs, now: () => new Date() });
  const written = await writer.send(callOf(input.value));
  forgetReads();
  return outcomeOf(input.value, values, written);
}

/** The Operator page's data, read with the operator's own key (uncached: it changes with every action). */
export async function loadOperator(session: Session): Promise<OperatorView> {
  const engine = keyed(session.token);
  const missing = { ok: false as const, source: "engine" as const, problem: { kind: "not_configured" as const, detail: "CONSOLE_ENGINE_URL" }, readAt: new Date().toISOString() };
  if (!engine) return { grants: missing, keys: missing, known: missing, actors: [], unallocated: {} };
  // Under CONSOLE_AUTH=oidc the engine runs LPB_AUTH=jwt: its key routes are gone, so they are not asked.
  const keysOn = readConfig().auth.mode === "keys";
  const [grants, keys, known, unallocated] = await Promise.all([
    engine.grants(),
    keysOn ? engine.adminKeys() : Promise.resolve(null),
    engine.adminActors(1000),
    unallocatedByGrant(),
  ]);
  const rows = actorsOf(known, keys?.ok ? keys.value : null);
  // A person who only signed in has no allocation to read (D48): no call, the row says "not provisioned".
  const allowances = await Promise.all(rows.map((row) => (row.provisioned === false ? Promise.resolve(null) : engine.allowance(row.actorId))));
  return { grants, keys, known, unallocated, actors: rows.map((row, index) => ({ ...row, allowance: allowances[index] ?? null })) };
}
