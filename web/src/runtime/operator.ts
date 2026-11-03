import "server-only";

import { ensureDirectoryUser } from "@/adapters/auth0/directory";
import { engineWriter } from "@/adapters/engine/writer";
import { readConfig, type DirectorySettings } from "@/config/config";
import type { Exchange } from "@/domain/exchange";
import { ACTIONS, callOf, type ActionInput, type ActionState } from "@/domain/operator";
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

const NO_ENGINE: ReviewContext = {
  grants: { ok: false, source: "identity", problem: { kind: "not_configured", detail: "not an engine call" }, readAt: "1970-01-01T00:00:00.000Z" },
  allowance: null,
  key: null,
  unallocated: {},
};

type PreparedOperator = {
  readonly action: Extract<ActionInput, { action: "provisionOperator" }>;
  readonly roleId: string;
  readonly settings: DirectorySettings;
};

/** The operator role id comes from configuration, never from the form. */
function withOperatorRole(input: Extract<ActionInput, { action: "provisionOperator" }>): { ok: true; value: PreparedOperator } | { ok: false; message: string } {
  const directory = readConfig().directory;
  if (!directory.ok) return { ok: false, message: `Auth0 user provisioning is not configured: ${directory.missing}.` };
  const roleId = directory.value.operatorRoleId;
  if (!roleId) return { ok: false, message: "Auth0 operator provisioning is not configured: CONSOLE_AUTH0_OPERATOR_ROLE_ID." };
  return { ok: true, value: { action: { ...input, roleId }, roleId, settings: directory.value } };
}

export async function reviewAction(session: Session, form: FormData): Promise<ActionState> {
  const values = valuesOf(form);
  const input = parseAction(form);
  if (!input.ok) return { step: "fill", values, error: { field: input.field, message: input.message } };
  if (input.value.action === "provisionOperator") {
    const prepared = withOperatorRole(input.value);
    if (!prepared.ok) return { step: "fill", values, error: { message: prepared.message } };
    return { step: "review", values, review: reviewOf(prepared.value.action, NO_ENGINE) };
  }
  return { step: "review", values, review: reviewOf(input.value, await contextFor(session, input.value)) };
}

async function commitOperator(values: Readonly<Record<string, string>>, input: Extract<ActionInput, { action: "provisionOperator" }>): Promise<ActionState> {
  const prepared = withOperatorRole(input);
  if (!prepared.ok) return { step: "fill", values, error: { message: prepared.message } };
  const { action, roleId, settings } = prepared.value;
  const started = Date.now();
  try {
    const created = await ensureDirectoryUser(settings, { subject: action.subject, email: action.email, name: action.label || action.subject }, roleId);
    const call = callOf(action);
    const exchange: Exchange = {
      method: call.method,
      path: call.path,
      ...(call.body === undefined ? {} : { body: call.body }),
      host: "auth0",
      status: 204,
      response: { user_id: created.userId },
      at: new Date().toISOString(),
      ms: Date.now() - started,
    };
    return {
      step: "done",
      ok: true,
      values,
      title: ACTIONS.provisionOperator.done,
      lines: [
        { label: "Operator", value: created.userId, mono: true },
        ...(created.password ? [{ label: "Sign-in password (shown once)", value: created.password }] : []),
      ],
      secret: null,
      note: created.password ? null : "This Auth0 user already existed, so no new password was set. The operator role is assigned.",
      exchange,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth0 did not create the user.";
    return { step: "fill", values, error: { message } };
  }
}

export async function commitAction(session: Session, form: FormData): Promise<ActionState> {
  const values = valuesOf(form);
  const input = parseAction(form);
  if (!input.ok) return { step: "fill", values, error: { field: input.field, message: input.message } };
  if (input.value.action === "provisionOperator") return commitOperator(values, input.value);
  const review = reviewOf(input.value, await contextFor(session, input.value));
  if (review.confirm) {
    const typed = form.get("confirm");
    if (typeof typed !== "string" || typed.trim() !== review.confirm.expect) {
      return { step: "review", values, review, error: `Type ${review.confirm.expect} exactly to confirm.` };
    }
  }
  const url = engineUrl();
  if (!url) return { step: "fill", values, error: { message: "The console has no engine URL (CONSOLE_ENGINE_URL)." } };
  let action = input.value;
  let password: string | null = null;
  if (action.action === "provision" && action.subject && action.email) {
    const directory = readConfig().directory;
    if (!directory.ok) return { step: "fill", values, error: { message: `Auth0 user provisioning is not configured: ${directory.missing}.` } };
    try {
      const created = await ensureDirectoryUser(directory.value, { subject: action.subject, email: action.email, name: action.label || action.subject }, directory.value.builderRoleId);
      action = { ...action, actorId: created.userId };
      password = created.password;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth0 did not create the user.";
      return { step: "fill", values, error: { message } };
    }
  }
  const writer = engineWriter(url, session.token, { timeoutMs: readConfig().timeoutMs, now: () => new Date() });
  const written = await writer.send(callOf(action));
  forgetReads();
  const outcome = outcomeOf(action, values, written);
  if (outcome.step === "done" && outcome.ok && password) {
    return { ...outcome, lines: [...outcome.lines, { label: "Sign-in password (shown once)", value: password }] };
  }
  return outcome;
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
