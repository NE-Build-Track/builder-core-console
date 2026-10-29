/**
 * The Operator actions (decision D15) and the exact engine call each one makes. The review step shows
 * this call before it is sent and the writer sends this call unchanged, so what the operator confirms is
 * what goes out (D17, D18). Bodies are typed by the pinned engine spec.
 */
import type { components } from "./engine-schema";
import { fillPath, type Exchange } from "./exchange";

type Schemas = components["schemas"];

export type OperatorAction =
  | "createGrant"
  | "fundGrant"
  | "provision"
  | "fundAllocation"
  | "setStatus"
  | "rotatePaymentKey"
  | "revokeAllocation"
  | "issueKey"
  | "rotateKey"
  | "revokeKey";

/** How the review step treats an action (D17). */
export type ActionKind = "money" | "irreversible" | "secret" | "everyday";

/**
 * Why sending the same form twice is safe: `reference` when the engine requires an operation reference
 * and answers a repeat from its record of the first (builder-core D57, ISS-11); `same-result` when the
 * call takes none because a repeat ends in the same state (set status, revoke).
 */
export type RepeatSafety = "reference" | "same-result";

export type ActionSpec = {
  readonly label: string;
  readonly kind: ActionKind;
  readonly route: string;
  readonly repeat: RepeatSafety;
  /** The toast after it worked. */
  readonly done: string;
};

export const ACTIONS: Record<OperatorAction, ActionSpec> = {
  createGrant: { label: "Create a grant", kind: "money", route: "POST /v1/admin/grants", repeat: "reference", done: "Grant created" },
  fundGrant: { label: "Fund a grant", kind: "money", route: "POST /v1/admin/grant/fund", repeat: "reference", done: "Grant funded" },
  provision: {
    label: "Provision an actor",
    kind: "money",
    route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation",
    repeat: "reference",
    done: "Actor provisioned",
  },
  fundAllocation: {
    label: "Fund an allocation",
    kind: "money",
    route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/fund",
    repeat: "reference",
    done: "Allocation funded",
  },
  setStatus: {
    label: "Set allocation status",
    kind: "everyday",
    route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/status",
    repeat: "same-result",
    done: "Status set",
  },
  rotatePaymentKey: {
    label: "Rotate the payment key",
    kind: "everyday",
    route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/rotate-key",
    repeat: "reference",
    done: "Payment key rotated",
  },
  revokeAllocation: {
    label: "Revoke the allocation",
    kind: "irreversible",
    route: "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/revoke",
    repeat: "same-result",
    done: "Allocation revoked",
  },
  issueKey: { label: "Issue an access key", kind: "secret", route: "POST /v1/admin/keys", repeat: "reference", done: "Key issued" },
  rotateKey: { label: "Rotate an access key", kind: "secret", route: "POST /v1/admin/keys/{key_id}/rotate", repeat: "reference", done: "Key rotated" },
  revokeKey: { label: "Revoke an access key", kind: "irreversible", route: "POST /v1/admin/keys/{key_id}/revoke", repeat: "same-result", done: "Key revoked" },
};

export const ALLOCATION_STATUSES = ["active", "paused", "exhausted", "revoked"] as const satisfies readonly Schemas["StatusBody"]["status"][];
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export type ActionInput =
  | { readonly action: "createGrant"; readonly name: string; readonly amount: string; readonly operationRef: string }
  | { readonly action: "fundGrant"; readonly grantId: string; readonly amount: string; readonly operationRef: string }
  | {
      readonly action: "provision";
      readonly applicationId: string;
      readonly actorId: string;
      readonly grantId: string;
      readonly amount: string;
      readonly label: string;
      readonly operationRef: string;
    }
  | {
      readonly action: "fundAllocation";
      readonly applicationId: string;
      readonly actorId: string;
      readonly grantId: string;
      readonly amount: string;
      readonly operationRef: string;
    }
  | { readonly action: "setStatus"; readonly applicationId: string; readonly actorId: string; readonly status: AllocationStatus }
  | { readonly action: "rotatePaymentKey"; readonly applicationId: string; readonly actorId: string; readonly operationRef: string }
  | { readonly action: "revokeAllocation"; readonly applicationId: string; readonly actorId: string }
  | {
      readonly action: "issueKey";
      readonly actorId: string;
      readonly applicationId: string;
      readonly kind: "actor" | "admin";
      readonly label: string;
      readonly operationRef: string;
    }
  | { readonly action: "rotateKey"; readonly keyId: string; readonly label: string; readonly operationRef: string }
  | { readonly action: "revokeKey"; readonly keyId: string };

/** One planned engine call: the route template, its filled path, and the body. */
export type PlannedCall = {
  readonly method: "POST";
  readonly template: string;
  readonly path: string;
  readonly body?: unknown;
};

const usdAmount = (amount: string): Schemas["Money-Input"] => ({ amount, currency: "USD" });

function plan(input: ActionInput, params: Readonly<Record<string, string>>, body?: unknown): PlannedCall {
  const template = ACTIONS[input.action].route.replace(/^POST /, "");
  return { method: "POST", template, path: fillPath(template, params), ...(body === undefined ? {} : { body }) };
}

export function callOf(input: ActionInput): PlannedCall {
  switch (input.action) {
    case "createGrant": {
      const body: Schemas["GrantBody"] = { name: input.name, amount: usdAmount(input.amount), operation_ref: input.operationRef };
      return plan(input, {}, body);
    }
    case "fundGrant": {
      const body: Schemas["FundRequest"] = { grant_id: input.grantId, amount: usdAmount(input.amount), operation_ref: input.operationRef };
      return plan(input, {}, body);
    }
    case "provision": {
      const body: Schemas["ProvisionBody"] = { amount: usdAmount(input.amount), grant_id: input.grantId, label: input.label, operation_ref: input.operationRef };
      return plan(input, { application_id: input.applicationId, actor_id: input.actorId }, body);
    }
    case "fundAllocation": {
      const body: Schemas["FundRequest"] = { grant_id: input.grantId, amount: usdAmount(input.amount), operation_ref: input.operationRef };
      return plan(input, { application_id: input.applicationId, actor_id: input.actorId }, body);
    }
    case "setStatus": {
      const body: Schemas["StatusBody"] = { status: input.status };
      return plan(input, { application_id: input.applicationId, actor_id: input.actorId }, body);
    }
    case "rotatePaymentKey": {
      const body: Schemas["RotateBody"] = { operation_ref: input.operationRef };
      return plan(input, { application_id: input.applicationId, actor_id: input.actorId }, body);
    }
    case "revokeAllocation":
      return plan(input, { application_id: input.applicationId, actor_id: input.actorId });
    case "issueKey": {
      const body: Schemas["IssueKeyBody"] = {
        actor_id: input.actorId,
        application_id: input.applicationId,
        kind: input.kind,
        label: input.label,
        operation_ref: input.operationRef,
      };
      return plan(input, {}, body);
    }
    case "rotateKey": {
      // No label: the engine keeps the key's own (D44), so the body carries only the reference (D57).
      const body: Schemas["RotateKeyBody"] = { ...(input.label ? { label: input.label } : {}), operation_ref: input.operationRef };
      return plan(input, { key_id: input.keyId }, body);
    }
    case "revokeKey":
      return plan(input, { key_id: input.keyId });
  }
}

/** One input of an action form, described by the server and drawn by the client (D17). */
export type FieldSpec =
  | { readonly type: "hidden"; readonly name: string; readonly value: string }
  | {
      readonly type: "text" | "usd";
      readonly name: string;
      readonly label: string;
      readonly value?: string;
      readonly placeholder?: string;
      readonly hint?: string;
    }
  | {
      readonly type: "select";
      readonly name: string;
      readonly label: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly value?: string;
      readonly hint?: string;
    };

export type ReviewLine = {
  readonly label: string;
  readonly value?: string;
  /** A balance or state before → after, for money moves and status changes. */
  readonly before?: string;
  readonly after?: string;
  readonly mono?: boolean;
};

export type Review = {
  readonly title: string;
  readonly kind: ActionKind;
  readonly lines: readonly ReviewLine[];
  readonly call: PlannedCall;
  readonly warnings: readonly string[];
  /** For actions that cannot be undone: the text the operator must type, and what to ask. */
  readonly confirm: { readonly expect: string; readonly prompt: string } | null;
  /** The confirm button's words: "Fund $5.00", "Revoke key". */
  readonly button: string;
};

/**
 * A new key, shown once on the result and never again (D17). `token` is null when the engine answered a
 * repeat of the operation reference from its record (builder-core D57): the key was issued by the first
 * request, and the engine keeps only its hash, so the token cannot be shown. Rotating the key replaces it.
 */
export type ShownOnce = { readonly token: string | null; readonly keyId: string; readonly actorId: string; readonly kind: string };

export type ActionState =
  | { readonly step: "fill"; readonly values?: Readonly<Record<string, string>>; readonly error?: { readonly field?: string; readonly message: string } }
  | { readonly step: "review"; readonly values: Readonly<Record<string, string>>; readonly review: Review; readonly error?: string }
  | {
      readonly step: "done";
      readonly ok: true;
      readonly values: Readonly<Record<string, string>>;
      readonly title: string;
      readonly lines: readonly ReviewLine[];
      readonly secret: ShownOnce | null;
      /** Said beside the result: that the engine answered a repeat from its record (D57), or nothing. */
      readonly note: string | null;
      readonly exchange: Exchange;
    }
  | {
      readonly step: "done";
      readonly ok: false;
      readonly values: Readonly<Record<string, string>>;
      readonly title: string;
      readonly message: string;
      /**
       * How to try again: under the same reference (a lost answer, a command still running, a refusal the
       * engine forgot), or under a new one, because this reference already belongs to another request (D57).
       */
      readonly retry: "same-reference" | "new-reference";
      readonly exchange: Exchange;
    };
