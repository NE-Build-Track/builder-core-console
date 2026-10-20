/**
 * Money as Batteries records it: grants, the allocations funded from each, and the gateway keys that
 * spend each allocation (docs/product-specs/console.md#money). Batteries is the money authority (D8);
 * the engine's grant list is shown beside it as a cross-check, never merged into it.
 */
import type { Allocation, ApiKey, Grant, LedgerRow, UsageEvent } from "@/domain/batteries";
import { mapReading, type Reading } from "@/domain/reading";
import type { AllocationView, GrantView, MoneyView } from "@/domain/views";
import type { Sources } from "@/ports/sources";
import { sumDecimals, times } from "@/utils/decimal";

/** Pick the amount field in the record's own currency (`usd` → `*_usd`). */
export function amountIn(record: Readonly<Record<string, unknown>>, field: string, currency: string): string {
  const value = record[`${field}_${currency.toLowerCase()}`];
  return typeof value === "string" ? value : "0";
}

/** What each allocation spent in the last 7 days, from Batteries' applied ticket events. */
export function weeklySpend(events: readonly UsageEvent[], now: Date): Map<string, string> {
  const since = now.getTime() - 7 * 86_400_000;
  const fees = new Map<string, string[]>();
  for (const event of events) {
    if (event.status !== "applied" || event.created_at_ms < since || !event.computed_fee_usd) continue;
    fees.set(event.allocation_id, [...(fees.get(event.allocation_id) ?? []), event.computed_fee_usd]);
  }
  return new Map([...fees].map(([id, rows]) => [id, sumDecimals(rows).total]));
}

export function allocationView(allocation: Allocation, keys: readonly ApiKey[], weekly: ReadonlyMap<string, string> = new Map()): AllocationView {
  const available = amountIn(allocation, "available", allocation.currency);
  const spentThisWeek = weekly.get(allocation.id);
  return {
    allocation,
    keys: keys.filter((key) => key.allocation_id === allocation.id),
    allocated: amountIn(allocation, "allocated", allocation.currency),
    spent: amountIn(allocation, "spent", allocation.currency),
    available,
    runwayDays: spentThisWeek ? runway(available, spentThisWeek) : null,
  };
}

/** Days left = available / (weekly spend / 7): how many weeks of spend remain, times seven. */
function runway(available: string, weekly: string): number | null {
  const weeks = times(available, weekly);
  return weeks === null ? null : Math.round(weeks * 7);
}

export function grantViews(
  grants: readonly Grant[],
  allocations: readonly Allocation[],
  keys: readonly ApiKey[],
  ledger: readonly LedgerRow[] | null,
  weekly: ReadonlyMap<string, string> = new Map(),
): GrantView[] {
  return grants.map((grant) => {
    const own = allocations.filter((allocation) => allocation.grant_id === grant.id).map((allocation) => allocationView(allocation, keys, weekly));
    const unallocatedRow = ledger?.find((row) => row.account_id === grant.id && row.account_type === "grant_unallocated");
    return {
      grant,
      total: amountIn(grant, "total", grant.currency),
      allocated: sumDecimals(own.map((item) => item.allocated)).total,
      spent: sumDecimals(own.map((item) => item.spent)).total,
      unallocated: unallocatedRow ? amountIn(unallocatedRow, "balance", grant.currency) : null,
      allocations: own,
    };
  });
}

export function totalsByCurrency(views: readonly GrantView[]): MoneyView["totals"] {
  const currencies = [...new Set(views.map((view) => view.grant.currency.toUpperCase()))].sort();
  return currencies.map((currency) => {
    const inCurrency = views.filter((view) => view.grant.currency.toUpperCase() === currency);
    return {
      currency,
      granted: sumDecimals(inCurrency.map((view) => view.total)).total,
      allocated: sumDecimals(inCurrency.map((view) => view.allocated)).total,
      spent: sumDecimals(inCurrency.map((view) => view.spent)).total,
      available: sumDecimals(inCurrency.flatMap((view) => view.allocations.map((allocation) => allocation.available))).total,
    };
  });
}

export async function money(sources: Sources): Promise<MoneyView> {
  const [grants, allocations, keys, ledger, escrow, engineGrants, usage] = await Promise.all([
    sources.batteries.grants(),
    sources.batteries.allocations(),
    sources.batteries.apiKeys(),
    sources.batteries.ledger(),
    sources.batteries.escrow(),
    sources.engine.grants(),
    sources.batteries.usage(),
  ]);
  const allocationRows = allocations.ok ? allocations.value.items : [];
  const keyRows = keys.ok ? keys.value.items : [];
  const weekly = weeklySpend(usage.ok ? usage.value.items : [], sources.now());
  const views: Reading<readonly GrantView[]> = mapReading(grants, (listing) =>
    grantViews(listing.items, allocationRows, keyRows, ledger.ok ? ledger.value : null, weekly),
  );
  const grantIds = new Set(grants.ok ? grants.value.items.map((grant) => grant.id) : []);
  return {
    grants: views,
    allocations,
    keys,
    orphanAllocations: grants.ok
      ? allocationRows.filter((allocation) => !grantIds.has(allocation.grant_id)).map((allocation) => allocationView(allocation, keyRows, weekly))
      : [],
    totals: views.ok ? totalsByCurrency(views.value) : [],
    engineGrants,
    ledger,
    ledgerSum: ledger.ok ? sumDecimals(ledger.value.flatMap((row) => (row.balance_usd ? [row.balance_usd] : []))).total : null,
    escrow,
    truncated: [grants, allocations, keys].some((reading) => reading.ok && reading.value.truncated),
  };
}
