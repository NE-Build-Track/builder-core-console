/**
 * Usage over a window, computed on demand from what the sources hold today (decision D6):
 * Batteries' signed-ticket events, joined to its payment sessions for app and orchestrator, beside the
 * engine's own cost classification for the same window (docs/product-specs/console.md#usage).
 */
import type { Allocation, PaymentSession, UsageEvent } from "@/domain/batteries";
import { COST_CLASSES, type CostSummary } from "@/domain/engine";
import { mapReading, type Reading } from "@/domain/reading";
import type { Breakdown, Bucket, TickerItem, UsageView } from "@/domain/views";
import type { Sources } from "@/ports/sources";
import { averageDecimal, compareDecimals, sumDecimals } from "@/utils/decimal";
import { isoFromMillis, slotsOf, windowBounds, type WindowName } from "@/utils/time";

export function inWindow(events: readonly UsageEvent[], window: { readonly start: string; readonly end: string }): UsageEvent[] {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  return events.filter((event) => event.created_at_ms >= start && event.created_at_ms < end);
}

/** Sum fees per key, largest first. Events without a USD fee still count as events. */
export function breakdown(
  events: readonly UsageEvent[],
  keyOf: (event: UsageEvent) => string,
  labelOf: (key: string) => string = (key) => key,
): Breakdown[] {
  const groups = new Map<string, UsageEvent[]>();
  for (const event of events) {
    const key = keyOf(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      label: labelOf(key),
      feeUsd: sumDecimals(rows.map((row) => row.computed_fee_usd).filter(Boolean)).total,
      events: rows.length,
    }))
    .sort((left, right) => compareDecimals(right.feeUsd, left.feeUsd) || right.events - left.events);
}

/** `count` buckets of `size` ms from `start`, oldest first; empty buckets are zero. */
export function bucketsOf(events: readonly UsageEvent[], start: string, size: number, count: number): Bucket[] {
  const origin = Date.parse(start);
  const groups: UsageEvent[][] = Array.from({ length: count }, () => []);
  for (const event of events) {
    const index = Math.floor((event.created_at_ms - origin) / size);
    if (index >= 0 && index < count) groups[index]?.push(event);
  }
  return groups.map((rows, index) => ({
    start: isoFromMillis(origin + index * size),
    feeUsd: sumDecimals(rows.map((row) => row.computed_fee_usd).filter(Boolean)).total,
    events: rows.length,
  }));
}

/** The newest applied tickets, newest first, with the app and orchestrator of their payment session. */
export function tickerItems(events: readonly UsageEvent[], sessions: readonly PaymentSession[], limit: number): (TickerItem & { manifestId: string; allocation: string })[] {
  const session = new Map(sessions.map((row) => [row.id, row]));
  return events
    .filter((event) => event.status === "applied")
    .slice(-limit)
    .reverse()
    .map((event) => ({
      id: event.id,
      feeUsd: event.computed_fee_usd || "0",
      app: session.get(event.payment_session_id)?.app ?? "unknown session",
      orchestrator: session.get(event.payment_session_id)?.orchestrator ?? "unknown",
      at: isoFromMillis(event.created_at_ms),
      manifestId: event.manifest_id,
      allocation: event.allocation_id,
    }));
}

export function summarise(
  events: readonly UsageEvent[],
  sessions: readonly PaymentSession[],
  allocations: readonly Allocation[],
): Pick<UsageView, "feeUsd" | "eventCount" | "averageFeeUsd" | "quarantined" | "byApp" | "byOrchestrator" | "byAllocation"> {
  const session = new Map(sessions.map((row) => [row.id, row]));
  const allocationName = new Map(allocations.map((row) => [row.id, row.name]));
  const applied = events.filter((event) => event.status === "applied");
  const feeUsd = sumDecimals(applied.map((event) => event.computed_fee_usd).filter(Boolean)).total;
  return {
    feeUsd,
    eventCount: applied.length,
    averageFeeUsd: averageDecimal(feeUsd, applied.length),
    quarantined: events.filter((event) => event.status !== "applied"),
    byApp: breakdown(applied, (event) => session.get(event.payment_session_id)?.app ?? "unknown session"),
    byOrchestrator: breakdown(applied, (event) => session.get(event.payment_session_id)?.orchestrator ?? "unknown session"),
    byAllocation: breakdown(
      applied,
      (event) => event.allocation_id,
      (id) => allocationName.get(id) ?? id,
    ),
  };
}

export function costClasses(summary: Reading<CostSummary>): UsageView["classes"] {
  return COST_CLASSES.map((costClass) => ({
    costClass,
    fees: summary.ok ? (summary.value.by_class[costClass] ?? null) : null,
  }));
}

export async function usage(sources: Sources, windowName: WindowName): Promise<UsageView> {
  const window = windowBounds(windowName, sources.now());
  const [events, sessions, allocations, engineCosts] = await Promise.all([
    sources.batteries.usage(),
    sources.batteries.sessions(),
    sources.batteries.allocations(),
    sources.engine.costSummary(window),
  ]);
  const windowed = mapReading(events, (listing) => ({ items: inWindow(listing.items, window), truncated: listing.truncated }));
  const rows = windowed.ok ? windowed.value.items : [];
  const sessionRows = sessions.ok ? sessions.value.items : [];
  const slots = slotsOf(windowName);
  return {
    window,
    by: slots.by,
    events: windowed,
    sessionsTruncated: sessions.ok && sessions.value.truncated,
    ...summarise(rows, sessionRows, allocations.ok ? allocations.value.items : []),
    buckets: bucketsOf(rows.filter((row) => row.status === "applied"), window.start, slots.size, slots.count),
    recent: tickerItems(rows, sessionRows, 10),
    engineCosts,
    classes: costClasses(engineCosts),
  };
}
