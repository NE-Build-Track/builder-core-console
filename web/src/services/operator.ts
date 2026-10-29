/**
 * The Operator actions' logic (decisions D15, D17): parse a form into one action, describe what it will
 * change for the review step, and describe what came back. Pure functions over readings; the runtime
 * sends the call.
 */
import type { AccessKey, Allowance, EngineGrant } from "@/domain/engine";
import { hideSecrets } from "@/domain/exchange";
import { ident, invalid, oneOf, operationRef, optionalLabel, parsed, text, usd, type Parsed } from "@/domain/forms";
import {
  ACTIONS,
  ALLOCATION_STATUSES,
  callOf,
  type ActionInput,
  type ActionState,
  type OperatorAction,
  type Review,
  type ReviewLine,
  type ShownOnce,
} from "@/domain/operator";
import { describeProblem, type Reading } from "@/domain/reading";
import type { Written } from "@/ports/keyed";
import { fromUnits, toUnits } from "@/utils/decimal";

const ACTION_NAMES = Object.keys(ACTIONS) as OperatorAction[];

function all<T extends object>(parts: { [K in keyof T]: Parsed<T[K]> }): Parsed<T> {
  const out: Record<string, unknown> = {};
  for (const [key, part] of Object.entries(parts) as [string, Parsed<unknown>][]) {
    if (!part.ok) return part;
    out[key] = part.value;
  }
  return parsed(out as T);
}

/** FormData from an action form → one action, or the first field that is wrong. */
export function parseAction(form: FormData): Parsed<ActionInput> {
  const action = oneOf(form, "action", ACTION_NAMES, "action");
  if (!action.ok) return action;
  const actor = () => ident(form, "actor_id", "Actor");
  const application = () => ident(form, "application_id", "Application");
  const grantText = () => parsed(text(form, "grant_id"));
  switch (action.value) {
    case "createGrant": {
      const name = text(form, "name");
      if (!name) return invalid("name", "Give the grant a name.");
      return all({ action: parsed("createGrant" as const), name: parsed(name.slice(0, 120)), amount: usd(form, "amount"), operationRef: operationRef(form) });
    }
    case "fundGrant":
      return all({ action: parsed("fundGrant" as const), grantId: ident(form, "grant_id", "Grant"), amount: usd(form, "amount"), operationRef: operationRef(form) });
    case "provision":
      return all({
        action: parsed("provision" as const),
        applicationId: application(),
        actorId: actor(),
        grantId: ident(form, "grant_id", "Grant"),
        amount: usd(form, "amount", "Allocation"),
        label: parsed(optionalLabel(form, "label")),
        operationRef: operationRef(form),
      });
    case "fundAllocation":
      return all({
        action: parsed("fundAllocation" as const),
        applicationId: application(),
        actorId: actor(),
        grantId: grantText(),
        amount: usd(form, "amount"),
        operationRef: operationRef(form),
      });
    case "setStatus":
      return all({ action: parsed("setStatus" as const), applicationId: application(), actorId: actor(), status: oneOf(form, "status", ALLOCATION_STATUSES, "status") });
    case "rotatePaymentKey":
      return all({ action: parsed("rotatePaymentKey" as const), applicationId: application(), actorId: actor(), operationRef: operationRef(form) });
    case "revokeAllocation":
      return all({ action: parsed("revokeAllocation" as const), applicationId: application(), actorId: actor() });
    case "issueKey":
      return all({
        action: parsed("issueKey" as const),
        actorId: actor(),
        applicationId: application(),
        kind: oneOf(form, "kind", ["actor", "admin"] as const, "key kind"),
        label: parsed(optionalLabel(form, "label")),
        operationRef: operationRef(form),
      });
    case "rotateKey":
      return all({ action: parsed("rotateKey" as const), keyId: ident(form, "key_id", "Key"), label: parsed(optionalLabel(form, "label")), operationRef: operationRef(form) });
    case "revokeKey":
      return all({ action: parsed("revokeKey" as const), keyId: ident(form, "key_id", "Key") });
  }
}

/** What the review step needs to know about the stack, read just before it is shown. */
export type ReviewContext = {
  readonly grants: Reading<readonly EngineGrant[]>;
  readonly allowance: Reading<Allowance> | null;
  /** The key a key action names, inspected just before review (GET /v1/admin/keys/{key_id}, ISS-08). */
  readonly key: Reading<AccessKey> | null;
  /** Each grant's unallocated balance from the Batteries ledger, when the console can read it. */
  readonly unallocated: Readonly<Record<string, string>>;
};

function minus(left: string, right: string): string | null {
  const a = toUnits(left);
  const b = toUnits(right);
  return a === null || b === null ? null : fromUnits(a - b);
}

/** What drawing `amount` from a grant does to its unallocated balance, and a warning when it is short. */
function fromGrant(context: ReviewContext, grantId: string, amount: string): { readonly lines: ReviewLine[]; readonly warnings: string[] } {
  const free = context.unallocated[grantId];
  if (!grantId || free === undefined) return { lines: [], warnings: [] };
  const after = minus(free, amount);
  if (after === null) return { lines: [], warnings: [] };
  const short = after.startsWith("-");
  return {
    lines: [{ label: "Grant unallocated", before: dollars(free), after: short ? "not enough" : dollars(after) }],
    warnings: short ? [`The grant has only ${dollars(free)} unallocated, so the engine will refuse this (409). Fund the grant first, or allocate less.`] : [],
  };
}

/** An amount exactly as it is, never rounded, with at least two decimals: $1.50, $0.125. */
function dollars(value: string): string {
  const units = toUnits(value);
  if (units === null) return `$${value}`;
  const [whole = "0", fraction = ""] = fromUnits(units).split(".");
  return `$${whole}.${fraction.padEnd(2, "0")}`;
}

function plus(left: string, right: string): string | null {
  const a = toUnits(left);
  const b = toUnits(right);
  return a === null || b === null ? null : fromUnits(a + b);
}

function grantName(context: ReviewContext, id: string): string {
  const grant = context.grants.ok ? context.grants.value.find((item) => item.id === id) : undefined;
  return grant?.name ? `${grant.name} (${id})` : id;
}

export function reviewOf(input: ActionInput, context: ReviewContext): Review {
  const spec = ACTIONS[input.action];
  const base = { title: spec.label, kind: spec.kind, call: callOf(input), warnings: [], confirm: null };
  switch (input.action) {
    case "createGrant":
      return { ...base, lines: [{ label: "Name", value: input.name }, { label: "Amount", value: dollars(input.amount) }], button: `Create a ${dollars(input.amount)} grant` };
    case "fundGrant": {
      const grant = context.grants.ok ? context.grants.value.find((item) => item.id === input.grantId) : undefined;
      const after = grant?.total ? plus(grant.total, input.amount) : null;
      const lines: ReviewLine[] = [
        { label: "Grant", value: grantName(context, input.grantId), mono: true },
        grant?.total && after ? { label: "Total", before: dollars(grant.total), after: dollars(after) } : { label: "Adds", value: dollars(input.amount) },
      ];
      return { ...base, lines, button: `Fund ${dollars(input.amount)}` };
    }
    case "provision": {
      const grant = fromGrant(context, input.grantId, input.amount);
      return {
        ...base,
        lines: [
          { label: "Actor", value: `${input.actorId} in ${input.applicationId}`, mono: true },
          { label: "From grant", value: grantName(context, input.grantId), mono: true },
          ...grant.lines,
          { label: "Allocation", before: "$0", after: dollars(input.amount) },
          ...(input.label ? [{ label: "Label", value: input.label }] : []),
        ],
        warnings: grant.warnings,
        button: `Provision with ${dollars(input.amount)}`,
      };
    }
    case "fundAllocation": {
      const allowance = context.allowance?.ok ? context.allowance.value : null;
      const lines: ReviewLine[] = [{ label: "Actor", value: `${input.actorId} in ${input.applicationId}`, mono: true }];
      const grantedNow = allowance?.granted?.amount ?? null;
      const availableNow = allowance?.available?.amount ?? null;
      const granted = grantedNow === null ? null : plus(String(grantedNow), input.amount);
      const available = availableNow === null ? null : plus(String(availableNow), input.amount);
      if (grantedNow !== null && availableNow !== null && granted && available) {
        lines.push({ label: "Granted", before: dollars(String(grantedNow)), after: dollars(granted) }, { label: "Available", before: dollars(String(availableNow)), after: dollars(available) });
      } else {
        lines.push({ label: "Adds", value: dollars(input.amount) });
      }
      const grant = fromGrant(context, input.grantId, input.amount);
      if (input.grantId) lines.push({ label: "From grant", value: grantName(context, input.grantId), mono: true }, ...grant.lines);
      return { ...base, lines, warnings: grant.warnings, button: `Fund ${dollars(input.amount)}` };
    }
    case "setStatus": {
      const current = context.allowance?.ok ? context.allowance.value.status : "unknown";
      return {
        ...base,
        lines: [{ label: "Actor", value: `${input.actorId} in ${input.applicationId}`, mono: true }, { label: "Status", before: current, after: input.status }],
        warnings: input.status === "active" ? [] : ["While the allocation is not active, the actor's jobs are refused before anything is paid."],
        button: `Set ${input.status}`,
      };
    }
    case "rotatePaymentKey":
      return {
        ...base,
        lines: [
          { label: "Actor", value: `${input.actorId} in ${input.applicationId}`, mono: true },
          { label: "Effect", value: "The engine replaces the allocation's gateway key (lpg_) and keeps the new one in its secret store. Nothing is shown to copy." },
        ],
        button: "Rotate the payment key",
      };
    case "revokeAllocation":
      return {
        ...base,
        lines: [{ label: "Actor", value: `${input.actorId} in ${input.applicationId}`, mono: true }, { label: "Effect", value: "Spending stops for good; the balance stays in the ledger." }],
        warnings: ["This cannot be undone."],
        confirm: { expect: input.actorId, prompt: `Type the actor id, ${input.actorId}, to confirm` },
        button: "Revoke the allocation",
      };
    case "issueKey":
      return {
        ...base,
        lines: [
          { label: "For", value: `${input.actorId} in ${input.applicationId}`, mono: true },
          { label: "Kind", value: input.kind === "admin" ? "admin (can do everything, including move money)" : "actor (runs and reads its own jobs)" },
          ...(input.label ? [{ label: "Label", value: input.label }] : []),
          { label: "The key", value: "Shown once on the next screen. Copy it then; the engine keeps only a hash." },
        ],
        warnings: input.kind === "admin" ? ["An admin key can move money. Issue actor keys to builders."] : [],
        button: "Issue the key",
      };
    case "rotateKey": {
      const key = context.key?.ok ? context.key.value : undefined;
      return {
        ...base,
        lines: [
          ...keyLines(input.keyId, key),
          ...(key ? [{ label: "Permissions", value: key.permissions.join(", ") || "none" }, { label: "Label", before: key.label || "none", after: input.label || key.label || "none" }] : []),
          { label: "Effect", value: "A new key with the same owner and permissions, shown once on the next screen. Calls with the old key fail at once with 401; there is no overlap." },
        ],
        warnings: [
          ...(key?.revoked_at ? ["This key is already revoked, so the engine will refuse this (400)."] : []),
          ...(key?.kind === "admin" ? ["This is an admin key. If it is the one you signed in with, sign in again with the new key after this."] : []),
        ],
        button: "Rotate the key",
      };
    }
    case "revokeKey": {
      const key = context.key?.ok ? context.key.value : undefined;
      return {
        ...base,
        lines: [...keyLines(input.keyId, key), { label: "Effect", value: "Calls with this key fail at once with 401." }],
        warnings: [
          "This cannot be undone.",
          ...(key?.kind === "admin" ? ["This is an admin key. If it is the one you signed in with, your next action will fail and you will need another admin key."] : []),
        ],
        confirm: { expect: input.keyId.slice(0, 8), prompt: `Type the first 8 characters of the key id, ${input.keyId.slice(0, 8)}, to confirm` },
        button: "Revoke the key",
      };
    }
  }
}

/** The key as the engine shows it now: who owns it, and whether it still works. */
function keyLines(keyId: string, key: AccessKey | undefined): ReviewLine[] {
  if (!key) return [{ label: "Key", value: keyId, mono: true }];
  return [
    { label: "Key", value: keyId, mono: true },
    { label: "Belongs to", value: `${key.actor_id} in ${key.application_id} (${key.kind})`, mono: true },
    { label: "Created", value: key.created_at },
    ...(key.revoked_at ? [{ label: "Revoked", value: key.revoked_at }] : []),
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The engine's answer, described for the result step. A new key comes back once, in `secret`. */
export function resultOf(input: ActionInput, value: unknown): { readonly lines: readonly ReviewLine[]; readonly secret: ShownOnce | null } {
  const body = record(value);
  switch (input.action) {
    case "createGrant":
      return { lines: [{ label: "Grant id", value: String(body.id ?? "unknown"), mono: true }, { label: "Amount", value: dollars(input.amount) }], secret: null };
    case "issueKey": {
      const key = record(body.key);
      const token = typeof body.token === "string" ? body.token : null;
      const keyId = String(key.key_id ?? "unknown");
      return {
        lines: [{ label: "Key id", value: keyId, mono: true }, { label: "For", value: `${String(key.actor_id ?? input.actorId)} in ${String(key.application_id ?? input.applicationId)}`, mono: true }],
        secret: key.key_id === undefined ? null : { token, keyId, actorId: String(key.actor_id ?? input.actorId), kind: String(key.kind ?? input.kind) },
      };
    }
    case "rotateKey": {
      const key = record(body.key);
      const token = typeof body.token === "string" ? body.token : null;
      const keyId = String(key.key_id ?? "unknown");
      const owner = String(key.actor_id ?? "unknown");
      return {
        lines: [
          { label: "Key id", value: keyId, mono: true },
          { label: "For", value: `${owner} in ${String(key.application_id ?? "unknown")}`, mono: true },
          { label: "Replaces", value: `${input.keyId} (revoked)`, mono: true },
        ],
        secret: key.key_id === undefined ? null : { token, keyId, actorId: owner, kind: String(key.kind ?? "unknown") },
      };
    }
    case "provision":
    case "fundAllocation":
    case "setStatus":
    case "rotatePaymentKey":
    case "revokeAllocation":
      return {
        lines: [
          { label: "Actor", value: `${String(body.actor_id ?? input.actorId)} in ${String(body.application_id ?? input.applicationId)}`, mono: true },
          { label: "Allocation", value: String(body.allocation_id ?? "—"), mono: true },
          { label: "Status", value: String(body.status ?? "—") },
        ],
        secret: null,
      };
    case "fundGrant":
      return { lines: [{ label: "Grant", value: input.grantId, mono: true }, { label: "Added", value: dollars(input.amount) }], secret: null };
    case "revokeKey":
      return { lines: [{ label: "Key", value: input.keyId, mono: true }], secret: null };
  }
}

/** The result step for what the writer got back: what changed, or why nothing did. Keys are hidden from the exchange. */
export function outcomeOf(input: ActionInput, values: Readonly<Record<string, string>>, written: Written): ActionState {
  const spec = ACTIONS[input.action];
  const exchange = hideSecrets(written.exchange);
  if (!written.ok) {
    const conflict = written.problem.kind === "http" && written.problem.code === "operation_conflict";
    const retry = conflict ? "new-reference" : "same-reference";
    return { step: "done", ok: false, values, title: `${spec.label}: not done`, message: describeProblem(written.problem), retry, exchange };
  }
  const note = written.replayed
    ? "This was already applied under this operation reference. The engine answered from its record (Idempotent-Replayed: true), so nothing was applied twice; the result is the first request's."
    : null;
  return { step: "done", ok: true, values, title: spec.done, ...resultOf(input, written.value), note, exchange };
}

/** The response as the result panel shows it: a new key's token replaced, everything else as sent. */
export const shownResponse = (value: unknown): unknown => hideSecrets(value);

export { actorsFromKeys, actorsOf, type OperatorActor, type OperatorView } from "./operator-actors";
