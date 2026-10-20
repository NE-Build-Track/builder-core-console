/**
 * Clearinghouse Batteries management API shapes at ca09e47 (docs/references/data-sources.md#batteries).
 * Parsed here, at the boundary; nothing else in the console sees an unparsed Batteries body.
 * Unknown fields are allowed (Batteries adds fields over time); missing required fields are not.
 */
import { z } from "zod";

const millis = z.number().int().nonnegative();
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "a decimal string");

export const grantSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  sponsor: z.string().default(""),
  status: z.string(),
  currency: z.string(),
  total_usd: decimal.optional(),
  total_eth: decimal.optional(),
  created_at_ms: millis,
  starts_at_ms: millis.nullable().default(null),
  ends_at_ms: millis.nullable().default(null),
});
export type Grant = z.infer<typeof grantSchema>;

export const allocationSchema = z.looseObject({
  id: z.string(),
  grant_id: z.string(),
  name: z.string(),
  beneficiary: z.string().default(""),
  status: z.string(),
  currency: z.string(),
  allocated_usd: decimal.optional(),
  spent_usd: decimal.optional(),
  available_usd: decimal.optional(),
  allocated_eth: decimal.optional(),
  spent_eth: decimal.optional(),
  available_eth: decimal.optional(),
  created_at_ms: millis,
});
export type Allocation = z.infer<typeof allocationSchema>;

export const apiKeySchema = z.looseObject({
  id: z.string(),
  allocation_id: z.string(),
  name: z.string(),
  prefix: z.string(),
  created_at_ms: millis,
  last_used_at_ms: millis.nullable().default(null),
  revoked_at_ms: millis.nullable().default(null),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** A payment session: one signer challenge for one runner, attributed to an allocation and key. */
export const paymentSessionSchema = z.looseObject({
  id: z.string(),
  allocation_id: z.string(),
  api_key_id: z.string(),
  app: z.string(),
  orchestrator: z.string(),
  payment_type: z.string(),
  status: z.string(),
  state_id: z.string().default(""),
  created_at_ms: millis,
  last_seen_at_ms: millis,
});
export type PaymentSession = z.infer<typeof paymentSessionSchema>;

/** One `create_signed_ticket` accounting event as Batteries applied (or quarantined) it. */
export const usageEventSchema = z.looseObject({
  id: z.string(),
  event_id: z.string(),
  allocation_id: z.string(),
  payment_session_id: z.string().default(""),
  manifest_id: z.string().default(""),
  request_id: z.string().default(""),
  pipeline: z.string().default(""),
  status: z.string(),
  error: z.string().default(""),
  currency: z.string(),
  computed_fee_usd: decimal.or(z.literal("")).default(""),
  computed_fee_eth: decimal.or(z.literal("")).default(""),
  created_at_ms: millis,
});
export type UsageEvent = z.infer<typeof usageEventSchema>;

export const settlementSchema = z.looseObject({ id: z.string() });
export type Settlement = z.infer<typeof settlementSchema>;

export const ledgerRowSchema = z.looseObject({
  account_id: z.string(),
  account_type: z.string(),
  currency: z.string(),
  balance_usd: decimal.optional(),
  balance_eth: decimal.optional(),
});
export type LedgerRow = z.infer<typeof ledgerRowSchema>;

/** Present only when Batteries runs its on-chain listener (docs/references/gaps.md#g7). */
export const escrowRowSchema = z.looseObject({
  chain_id: z.string(),
  contract_address: z.string(),
  sender: z.string(),
  confirmed_through_block: z.string(),
  deposit_balance_wei: z.string(),
  reserve_balance_wei: z.string(),
  total_balance_wei: z.string(),
});
export type EscrowRow = z.infer<typeof escrowRowSchema>;

/** A boundary schema and the value it parses to, for adapters (zod itself stays in this layer). */
export type Schema = z.ZodType;
export type Parsed<T extends Schema> = z.infer<T>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), next_cursor: z.string() });
}

export const ledgerReportSchema = z.array(ledgerRowSchema);
export const escrowReportSchema = z.array(escrowRowSchema);

/** A list read that may have stopped early: the console walks pages up to a row cap. */
export type Listing<T> = {
  readonly items: readonly T[];
  /** True when the cap stopped the walk before the last page. Totals over a truncated list are partial. */
  readonly truncated: boolean;
};
