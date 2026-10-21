/**
 * The Builder area's views (decisions D15, D19): the live catalog with each rate's unit, source and age;
 * one builder's jobs; and their allowance and wholesale network cost. Pure functions over readings.
 */
import { COST_CLASSES, type Allowance, type CostClass, type CostSummary, type EngineHealth, type Fees, type Job, type JobCost, type NetworkRate, type Offering } from "@/domain/engine";
import { mapReading, type Reading } from "@/domain/reading";
import { ageSeconds } from "@/utils/time";

/** An offering read longer ago than this is marked stale, whatever the engine's overall freshness says. */
export const STALE_AFTER_S = 300;

export type RateView =
  | { readonly known: true; readonly amount: string; readonly currency: string; readonly unit: string }
  | { readonly known: false };

export type CatalogEntry = {
  readonly app: string;
  readonly modes: readonly string[];
  readonly runners: number;
  readonly ready: number;
  readonly low: RateView;
  readonly high: RateView;
  readonly observedAt: string | null;
  readonly ageSeconds: number | null;
  readonly stale: boolean;
  /** Something the builder should know before running it: no ready runner, no rate. */
  readonly notes: readonly string[];
};

export type CatalogView = {
  readonly entries: Reading<readonly CatalogEntry[]>;
  readonly discovery: Reading<EngineHealth>;
};

function rateOf(rate: NetworkRate | null | undefined): RateView {
  return rate ? { known: true, amount: String(rate.amount), currency: rate.currency, unit: rate.unit } : { known: false };
}

export function catalogEntry(offering: Offering, now: Date): CatalogEntry {
  const age = ageSeconds(offering.observed_at ?? null, now);
  const low = rateOf(offering.rate_low);
  const high = rateOf(offering.rate_high);
  const stale = age === null || age > STALE_AFTER_S;
  const notes = [
    ...(offering.ready_count === 0 ? ["No runner is ready right now."] : []),
    ...(!low.known && !high.known ? ["No rate advertised."] : []),
    ...(stale ? ["Read too long ago to trust."] : []),
  ];
  return {
    app: offering.app,
    modes: offering.modes,
    runners: offering.runner_count,
    ready: offering.ready_count,
    low,
    high,
    observedAt: offering.observed_at ?? null,
    ageSeconds: age,
    stale,
    notes,
  };
}

export function catalog(offerings: Reading<readonly Offering[]>, discovery: Reading<EngineHealth>, now: Date): CatalogView {
  return {
    entries: mapReading(offerings, (list) => [...list].sort((a, b) => b.ready_count - a.ready_count || a.app.localeCompare(b.app)).map((item) => catalogEntry(item, now))),
    discovery,
  };
}

export type JobRow = {
  readonly id: string;
  readonly app: string;
  readonly state: string;
  readonly createdAt: string;
  readonly attempts: number;
  readonly paid: boolean;
  readonly failure: string | null;
};

export function jobRow(job: Job): JobRow {
  return {
    id: job.id,
    app: job.app,
    state: job.state,
    createdAt: job.created_at,
    attempts: job.attempts.length,
    paid: job.attempts.some((attempt) => attempt.payment_sent),
    failure: job.failure ? `${job.failure.kind}: ${job.failure.message}` : null,
  };
}

export type ClassTotal = { readonly costClass: CostClass; readonly fees: Fees | null };

export type UsageView = {
  readonly allowance: Reading<Allowance>;
  readonly summary: Reading<CostSummary>;
  readonly classes: readonly ClassTotal[];
  readonly window: { readonly start: string; readonly end: string };
};

export function usage(allowance: Reading<Allowance>, summary: Reading<CostSummary>, window: { readonly start: string; readonly end: string }): UsageView {
  const byClass = summary.ok ? (summary.value.by_class as Partial<Record<string, Fees>>) : {};
  return { allowance, summary, window, classes: COST_CLASSES.map((costClass) => ({ costClass, fees: byClass[costClass] ?? null })) };
}

/** A job and its cost, as the Builder polls them after a run (JSON for the browser). */
export type JobState = {
  readonly job: Job | null;
  readonly cost: JobCost | null;
  readonly problem: string | null;
  /** Nothing more will change: the job is final and its cost is no longer pending. */
  readonly settled: boolean;
};

export function jobState(job: Reading<Job>, cost: Reading<JobCost>): JobState {
  const final = job.ok && ["succeeded", "failed", "uncertain"].includes(job.value.state);
  const costSettled = cost.ok && cost.value.status !== "pending";
  const nothingPaid = job.ok && !job.value.attempts.some((attempt) => attempt.payment_sent);
  return {
    job: job.ok ? job.value : null,
    cost: cost.ok ? cost.value : null,
    problem: job.ok ? null : `job: ${job.problem.kind === "http" ? `HTTP ${job.problem.status}` : job.problem.kind}`,
    settled: final && (costSettled || nothingPaid),
  };
}
