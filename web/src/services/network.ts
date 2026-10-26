/**
 * The network as this stack sees it: what the engine offers per app, the runners behind each offer, and
 * the orchestrators the discovery service serves (docs/product-specs/console.md#network).
 */
import type { Runner } from "@/domain/engine";
import { ok, type Reading } from "@/domain/reading";
import type { DiscoveredOrchestrator } from "@/domain/discovery";
import type { AppNetwork, NetworkView, OfferingStats, OrchestratorView } from "@/domain/views";
import type { Sources } from "@/ports/sources";
import { mapLimited } from "@/utils/concurrency";
import { compareDecimals } from "@/utils/decimal";
import { ageSeconds } from "@/utils/time";

/** The signer re-reads orchestrators continuously; one not heard from in a minute is stale. */
export const STALE_ORCHESTRATOR_S = 60;

export function isStale(lastSeen: string | null, now: Date): boolean {
  const age = ageSeconds(lastSeen, now);
  return age === null || age > STALE_ORCHESTRATOR_S;
}

export function orchestratorViews(discovered: readonly DiscoveredOrchestrator[], now: Date): OrchestratorView[] {
  return discovered
    .map((orchestrator) => ({
      address: orchestrator.address,
      lastSeen: orchestrator.last_seen,
      stale: isStale(orchestrator.last_seen, now),
      runners: orchestrator.runners.length,
      capacity: orchestrator.runners.reduce((sum, runner) => sum + (runner.capacity ?? 0), 0),
      capacityAvailable: orchestrator.runners.reduce((sum, runner) => sum + (runner.capacity_available ?? 0), 0),
      apps: [...new Set(orchestrator.runners.map((runner) => runner.app))].sort(),
    }))
    .sort((left, right) => left.address.localeCompare(right.address));
}

/** Total and free slots across runners; a runner that does not report capacity adds nothing. */
export function capacityOf(runners: readonly Runner[]): { readonly total: number; readonly available: number } {
  return runners.reduce(
    (acc, runner) => ({ total: acc.total + (runner.capacity ?? 0), available: acc.available + (runner.capacity_available ?? 0) }),
    { total: 0, available: 0 },
  );
}

/** Runner count, orchestrators, slots and the price range of one app's runners. */
export function offeringStats(runners: readonly Runner[]): OfferingStats {
  const capacity = capacityOf(runners);
  const prices = runners.flatMap((runner) => (runner.rate ? [runner.rate] : [])).sort((left, right) => compareDecimals(left.amount, right.amount));
  const first = prices[0];
  const last = prices[prices.length - 1];
  return {
    runners: runners.length,
    orchestrators: new Set(runners.map((runner) => runner.orchestrator_url ?? runner.url)).size,
    free: capacity.available,
    total: capacity.total,
    priceLow: first?.amount ?? null,
    priceHigh: last?.amount ?? null,
    priceUnit: first ? `${first.currency}/${first.unit}` : null,
  };
}

export async function network(sources: Sources): Promise<NetworkView> {
  const [offerings, discovery, health] = await Promise.all([
    sources.engine.offerings(),
    sources.discovery.inventory(),
    sources.engine.health(),
  ]);
  const now = sources.now();
  let apps: Reading<readonly AppNetwork[]>;
  if (offerings.ok) {
    const sorted = [...offerings.value].sort((left, right) => left.app.localeCompare(right.app));
    const rows = await mapLimited(sorted, 4, async (offering) => {
      const runners = await sources.engine.runners(offering.app);
      return { offering, runners, stats: offeringStats(runners.ok ? runners.value : []) };
    });
    apps = ok("engine", rows, offerings.readAt);
  } else {
    apps = offerings;
  }
  const orchestrators: Reading<readonly OrchestratorView[]> = discovery.ok
    ? ok("signer", orchestratorViews(discovery.value, now), discovery.readAt)
    : discovery;
  const appRows = apps.ok ? apps.value : [];
  const orchestratorRows = orchestrators.ok ? orchestrators.value : [];
  return {
    apps,
    orchestrators,
    discovery: health,
    totals: {
      apps: appRows.length,
      orchestrators: orchestratorRows.length,
      freshOrchestrators: orchestratorRows.filter((row) => !row.stale).length,
      runners: appRows.reduce((sum, row) => sum + row.stats.runners, 0),
      free: appRows.reduce((sum, row) => sum + row.stats.free, 0),
      slots: appRows.reduce((sum, row) => sum + row.stats.total, 0),
    },
  };
}
