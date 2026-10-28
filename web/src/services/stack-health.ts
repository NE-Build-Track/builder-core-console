/**
 * Stack health: one verdict per component from the checks each source makes available
 * (docs/product-specs/console.md#stack-health). A check that cannot be made reads "unknown", never "ok".
 */
import type { EngineHealth, Reconciliation } from "@/domain/engine";
import { shortCommit, PINS } from "@/domain/pins";
import { describeProblem, mapReading, type Reading } from "@/domain/reading";
import type { DiscoveredOrchestrator } from "@/domain/discovery";
import type { SignerMetrics, SignerReadiness } from "@/domain/signer";
import type { Check, ComponentHealth, StackHealth, State, Topology, Verdict } from "@/domain/views";
import type { Sources } from "@/ports/sources";
import { mapLimited } from "@/utils/concurrency";
import { sumDecimals } from "@/utils/decimal";

import { isStale } from "./network";
import { reconciliationVerdict } from "./reconciliation";
import { tickerItems } from "./usage";
import { ageSeconds, formatAge } from "@/utils/time";

/** The engine syncs costs every LPB_COST_SYNC_INTERVAL_S (30 s by default); five missed rounds is stale. */
export const COST_SYNC_STALE_S = 150;
/** The signer delivers accounting events at least once; an event older than this is stuck. */
export const OUTBOX_STUCK_S = 300;

const RANK: Record<State, number> = { ok: 0, unknown: 1, warn: 2, bad: 3 };

export function worst(states: readonly State[]): State {
  return states.reduce<State>((acc, state) => (RANK[state] > RANK[acc] ? state : acc), "ok");
}

function unreadable(id: string, label: string, reading: Reading<unknown>): Check {
  return { id, label, state: "bad", summary: reading.ok ? "" : describeProblem(reading.problem) };
}

export function engineChecks(health: Reading<EngineHealth>, now: Date): Check[] {
  if (!health.ok) return [unreadable("engine.ready", "Engine reachable", health)];
  const h = health.value;
  const checks: Check[] = [
    {
      id: "engine.ready",
      label: "Ready",
      state: h.ready ? "ok" : "bad",
      summary: h.ready ? "Accepting jobs" : "Not ready: /readyz answered 503",
    },
    {
      id: "engine.discovery",
      label: "Discovery",
      state: h.discovery_fresh ? "ok" : "warn",
      summary: h.discovery_fresh
        ? `Fresh, observed ${ago(h.discovery_observed_at, now)}`
        : `Stale${h.discovery_error ? `: ${h.discovery_error}` : ""} (last observed ${ago(h.discovery_observed_at, now)})`,
    },
  ];
  const syncAge = ageSeconds(h.cost_sync_at, now);
  checks.push({
    id: "engine.cost_sync",
    label: "Cost sync",
    state: h.cost_sync_error ? "warn" : syncAge === null ? "unknown" : syncAge > COST_SYNC_STALE_S ? "warn" : "ok",
    summary: h.cost_sync_error
      ? `Last sync failed: ${h.cost_sync_error}`
      : syncAge === null
        ? "Has not synced with Batteries yet"
        : `Synced ${formatAge(syncAge)} ago`,
  });
  const pinned = shortCommit(PINS.engine.commit);
  checks.push({
    id: "engine.version",
    label: "Version",
    state: h.version.includes(pinned) ? "ok" : "warn",
    summary: h.version.includes(pinned)
      ? `${h.version} (pinned ${pinned})`
      : `Engine reports ${h.version}; the console is built for ${pinned}`,
  });
  checks.push({
    id: "engine.load",
    label: "Running jobs",
    state: "ok",
    summary: `${h.running_jobs} running · ${h.allocation_mode.replace("_", "-")} allocations`,
  });
  return checks;
}

export function batteriesChecks(ready: Reading<true>): Check[] {
  return [
    ready.ok
      ? { id: "batteries.ready", label: "Ready", state: "ok", summary: "Management API and accounting are up" }
      : unreadable("batteries.ready", "Ready", ready),
  ];
}

/**
 * Does the engine account for everything Batteries charged? In per_application mode the engine
 * reconciles the whole application at once. In per_actor mode that call answers 404 (gap G10), so
 * the verdict is the sum of every actor's reconciliation in the console's application.
 */
export function reconciliationCheck(readings: readonly Reading<Reconciliation>[]): Check {
  const id = "batteries.balanced";
  const label = "Engine agrees with Batteries";
  const isMissing = (r: Reading<Reconciliation>) => !r.ok && r.problem.kind === "http" && r.problem.status === 404;
  const failures = readings.filter((r) => !r.ok && !isMissing(r));
  const rows = readings.flatMap((r) => (r.ok ? [{ r: r.value, verdict: reconciliationVerdict(r.value) }] : []));
  const who = (r: Reconciliation) => (r.actor_id ? `actor ${r.actor_id}` : `application ${r.application_id}`);
  const unattributed = rows.filter((row) => row.verdict.kind === "unattributed");
  const mismatched = rows.filter((row) => row.verdict.kind === "mismatch");
  const catchingUp = rows.filter((row) => row.verdict.kind === "catching_up");
  const balanced = rows.filter((row) => row.verdict.kind === "balanced");
  if (unattributed.length > 0) {
    const first = unattributed[0]!.r;
    return {
      id,
      label,
      state: "warn",
      summary: `${unattributed.length} with unattributed spend: ${who(first)} has ${first.unattributed.fee_usd ?? first.unattributed.fee_eth} ${first.unattributed.fee_usd ? "USD" : "ETH"} the engine cannot tie to a job (${first.unattributed.row_count} rows)`,
    };
  }
  if (mismatched.length > 0) {
    const first = mismatched[0]!;
    return { id, label, state: "warn", summary: `${who(first.r)}: the engine attributes more than Batteries charged (gap ${first.verdict.gapUsd ?? "?"} USD)` };
  }
  if (failures.length > 0) {
    const first = failures[0] as Reading<Reconciliation>;
    return { id, label, state: "unknown", summary: `Reconciliation could not be read: ${first.ok ? "" : describeProblem(first.problem)}` };
  }
  if (catchingUp.length > 0) {
    const ahead = sumDecimals(catchingUp.map((row) => row.verdict.gapUsd ?? "0")).total;
    return {
      id,
      label,
      state: "ok",
      summary: `Catching up: Batteries is ${ahead} USD ahead of the last cost sync on ${catchingUp.length} of ${rows.length} allocations, nothing unattributed`,
    };
  }
  if (balanced.length > 0) {
    return { id, label, state: "ok", summary: balanced.length === 1 ? "Balanced" : `Balanced for all ${balanced.length} allocations` };
  }
  return {
    id,
    label,
    state: "unknown",
    summary: rows.length > 0 ? "No provider spend to compare yet" : "No allocation in this application yet, so nothing to reconcile",
  };
}

export function signerChecks(readiness: Reading<SignerReadiness>, metrics: Reading<SignerMetrics>): Check[] {
  const checks: Check[] = [
    readiness.ok
      ? {
          id: "signer.ready",
          label: "Ready to pay",
          state: readiness.value.ready ? "ok" : "bad",
          summary: readiness.value.ready
            ? "Chain access, deposit and reserve, price rate and outbox are healthy"
            : `Cannot pay: ${readiness.value.detail || "/readyz answered 503"}`,
        }
      : unreadable("signer.ready", "Ready to pay", readiness),
  ];
  if (!metrics.ok) {
    checks.push({ id: "signer.outbox", label: "Accounting outbox", state: "unknown", summary: describeProblem(metrics.problem) });
    return checks;
  }
  const m = metrics.value;
  const pending = m.livepeer_signer_kafka_pending_events;
  const oldest = m.livepeer_signer_kafka_oldest_event_age_seconds ?? 0;
  const healthy = m.livepeer_signer_kafka_outbox_healthy;
  checks.push({
    id: "signer.outbox",
    label: "Accounting outbox",
    state: healthy === 0 ? "bad" : pending === undefined ? "unknown" : pending === 0 ? "ok" : oldest > OUTBOX_STUCK_S ? "bad" : "warn",
    summary:
      healthy === 0
        ? "Outbox storage is unhealthy: the signer withholds payments"
        : pending === undefined
          ? "The signer did not report its outbox"
          : pending === 0
            ? "Every signed ticket has reached Batteries"
            : `${pending} events waiting for Batteries, oldest ${formatAge(Math.round(oldest))}`,
  });
  const errors =
    (m.livepeer_signer_kafka_publish_errors_total ?? 0) +
    (m.livepeer_signer_kafka_enqueue_errors_total ?? 0) +
    (m.livepeer_signer_kafka_storage_errors_total ?? 0);
  checks.push({
    id: "signer.errors",
    label: "Delivery errors",
    state: errors === 0 ? "ok" : "warn",
    summary: errors === 0 ? "None since the signer started" : `${errors} publish, enqueue or storage errors since the signer started`,
  });
  return checks;
}

/** Reconciliation for the console's application, per allocation mode (see reconciliationCheck). */
export async function applicationReconciliations(sources: Sources, health: Reading<EngineHealth>): Promise<Reading<Reconciliation>[]> {
  if (!health.ok || health.value.allocation_mode === "per_application") {
    return [await sources.engine.reconciliation({ applicationId: sources.applicationId })];
  }
  // The engine's own actor list (builder-core #69), not its keys: under LPB_AUTH=jwt there are no keys,
  // and only a provisioned actor has an allocation to reconcile.
  const known = await sources.engine.actors();
  if (!known.ok) return [known];
  const actors = known.value.filter((actor) => actor.provisioned && actor.application_id === sources.applicationId).map((actor) => actor.actor_id);
  return mapLimited(actors, 4, (actorId) => sources.engine.reconciliation({ applicationId: sources.applicationId, actorId }));
}

const ROLES: Record<ComponentHealth["component"], string> = {
  engine: "Runs paid jobs and classifies their cost",
  batteries: "Grants, allocations and the ticket ledger",
  signer: "Signs payments and reports every ticket",
};

/** The one verdict at the top of the page, and the sentence that explains it. */
export function verdictOf(components: readonly ComponentHealth[]): Verdict {
  const checks = components.flatMap((component) => component.checks.map((check) => ({ component, check })));
  const count = (state: State) => checks.filter(({ check }) => check.state === state).length;
  const [passing, warnings, failing, unknown] = [count("ok"), count("warn"), count("bad"), count("unknown")];
  const state = worst(components.map((component) => component.state));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const headline = { ok: "Operational", warn: "Operational", unknown: "Partly unknown", bad: "Impaired" }[state];
  const short =
    state === "ok"
      ? "Operational"
      : state === "bad"
        ? `Impaired, ${failing} failing`
        : state === "warn"
          ? `Operational, ${plural(warnings, "warning")}`
          : `${plural(unknown, "check")} unknown`;
  const worstFirst = [...checks].sort((left, right) => RANK[right.check.state] - RANK[left.check.state]);
  const problems = worstFirst
    .filter(({ check }) => check.state !== "ok")
    .slice(0, 2)
    .map(({ component, check }) => `${component.title}, ${check.label.toLowerCase()}: ${brief(check.summary)}`);
  const why =
    problems.length === 0
      ? "Every check passes: the engine is ready, Batteries is accounting, and the signer can pay."
      : `${problems.join(". ")}.`.replace("..", ".");
  return { state, headline, short, why, passing, total: checks.length, warnings, failing };
}

/** Upstream errors can be long (a URL repeated twice); the verdict keeps the first clause. The card shows all of it. */
function brief(text: string): string {
  const first = text.split(/(?<=[.;)])\s|\s\(url=/)[0] ?? text;
  return first.length > 110 ? `${first.slice(0, 107).trimEnd()}…` : first;
}

export function topologyOf(
  components: readonly ComponentHealth[],
  engine: Reading<EngineHealth>,
  metrics: Reading<SignerMetrics>,
  readiness: Reading<SignerReadiness>,
  discovery: Reading<readonly DiscoveredOrchestrator[]>,
  now: Date,
): Topology {
  const stateOf = (name: ComponentHealth["component"]) => components.find((component) => component.component === name)?.state ?? "unknown";
  const balanced = components.find((component) => component.component === "batteries")?.checks.find((check) => check.id === "batteries.balanced");
  const pending = metrics.ok ? metrics.value.livepeer_signer_kafka_pending_events : undefined;
  return {
    engine: { state: stateOf("engine"), detail: engine.ok ? `${engine.value.running_jobs} jobs running` : "unreachable" },
    signer: {
      state: stateOf("signer"),
      detail: readiness.ok ? `outbox ${pending ?? "?"} · ${readiness.value.ready ? "ready" : "not ready"}` : "unreachable",
    },
    batteries: {
      state: stateOf("batteries"),
      detail: balanced?.state === "warn" ? "ledger · unattributed" : balanced?.summary.startsWith("Catching up") ? "ledger · syncing" : balanced?.state === "ok" ? "ledger · balanced" : "ledger",
    },
    orchestrators: discovery.ok
      ? discovery.value.map((orchestrator) => ({ label: hostOf(orchestrator.address), stale: isStale(orchestrator.last_seen, now) }))
      : [],
  };
}

function hostOf(address: string): string {
  try {
    return new URL(address).hostname;
  } catch {
    return address;
  }
}

export async function stackHealth(sources: Sources): Promise<StackHealth> {
  const [engine, batteriesReady, readiness, metrics, discovery, usage, sessions] = await Promise.all([
    sources.engine.health(),
    sources.batteries.ready(),
    sources.signer.readiness(),
    sources.signer.metrics(),
    sources.discovery.inventory(),
    sources.batteries.usage(),
    sources.batteries.sessions(),
  ]);
  const reconciliations = await applicationReconciliations(sources, engine);
  const now = sources.now();
  const component = (component: ComponentHealth["component"], title: string, checks: Check[]): ComponentHealth => ({
    component,
    title,
    role: ROLES[component],
    checks,
    state: worst(checks.map((check) => check.state)),
  });
  const components = [
    component("engine", "Engine", engineChecks(engine, now)),
    component("batteries", "Batteries", [...batteriesChecks(batteriesReady), reconciliationCheck(reconciliations)]),
    component("signer", "Signer", signerChecks(readiness, metrics)),
  ];
  const verdict = verdictOf(components);
  return {
    state: verdict.state,
    verdict,
    components,
    topology: topologyOf(components, engine, metrics, readiness, discovery, now),
    engine,
    signerMetrics: metrics,
    ticker: mapReading(usage, (listing) => tickerItems(listing.items, sessions.ok ? sessions.value.items : [], 18)),
    checkedAt: now.toISOString(),
  };
}

function ago(iso: string | null, now: Date): string {
  const age = ageSeconds(iso, now);
  return age === null ? "never" : `${formatAge(age)} ago`;
}
