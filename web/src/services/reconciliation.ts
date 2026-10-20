/**
 * What a reconciliation means. The engine's `balanced` is false whenever Batteries has charged tickets
 * that the engine's cost sync has not read yet, which is every moment paid jobs are running (gap G11).
 * So: unattributed rows mean money the engine cannot tie to a job; no unattributed rows and Batteries
 * ahead means the engine is catching up; the engine ahead of Batteries is a real mismatch.
 */
import type { Reconciliation } from "@/domain/engine";
import type { State } from "@/domain/views";
import { difference, sumDecimals, toUnits } from "@/utils/decimal";

export type ReconciliationVerdict = {
  readonly kind: "balanced" | "catching_up" | "unattributed" | "mismatch" | "no_spend";
  readonly state: State;
  /** Batteries' spend minus what the engine has attributed (USD), when there is a gap. */
  readonly gapUsd: string | null;
};

export function reconciliationVerdict(r: Reconciliation): ReconciliationVerdict {
  if (r.balanced === null) return { kind: "no_spend", state: "unknown", gapUsd: null };
  if (r.balanced) return { kind: "balanced", state: "ok", gapUsd: null };
  if (r.unattributed.row_count > 0) return { kind: "unattributed", state: "warn", gapUsd: r.unattributed.fee_usd ?? null };
  const attributed = sumDecimals(Object.values(r.by_class).map((fees) => fees.fee_usd ?? "0")).total;
  const gap = r.provider_spent ? difference(r.provider_spent.amount, attributed) : null;
  const ahead = gap !== null && (toUnits(gap) ?? 0n) > 0n;
  return ahead ? { kind: "catching_up", state: "ok", gapUsd: gap } : { kind: "mismatch", state: "warn", gapUsd: gap };
}
