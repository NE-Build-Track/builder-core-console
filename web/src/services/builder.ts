/**
 * The Builder area's views (decisions D15, D19): the live catalog with each rate's unit, source and age;
 * one builder's jobs; and their allowance and wholesale network cost. Pure functions over readings.
 */
import { COST_CLASSES, type Allowance, type CostClass, type CostSummary, type EngineHealth, type Fees, type Job, type JobCost, type NetworkRate, type Offering } from "@/domain/engine";
import { isFinalState, type JobState, type RunInput } from "@/domain/builder";
import { invalid, parsed, wholeNumber, type Parsed } from "@/domain/forms";
import { mapReading, type Reading } from "@/domain/reading";
import { weiToEth } from "@/utils/decimal";
import { ageSeconds } from "@/utils/time";

/** An offering read longer ago than this is marked stale, whatever the engine's overall freshness says. */
export const STALE_AFTER_S = 300;

export type RateView =
  | { readonly known: true; readonly amount: string; readonly currency: string; readonly unit: string; readonly text: string }
  | { readonly known: false };

/** "per second", "per request", "per 720p pixel-second": the orchestrator's unit, in words. */
export function unitWords(unit: string): string {
  if (unit === "fixed") return "per request";
  return `per ${unit.replace(/-/g, " ").replace(/s$/, "").replace(/ second$/, "-second")}`;
}

/**
 * A rate exactly as advertised, readable: wei shown as ETH with the wei beside it. The engine gives no
 * USD rate (gap G14); a USD figure would need an ETH price with its source and time.
 */
export function rateText(amount: string, currency: string, unit: string): string {
  const per = unitWords(unit);
  return currency.toLowerCase() === "wei" ? `${weiToEth(amount)} ETH ${per} (${amount} wei)` : `${amount} ${currency} ${per}`;
}

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
  return rate ? { known: true, amount: String(rate.amount), currency: rate.currency, unit: rate.unit, text: rateText(String(rate.amount), rate.currency, rate.unit) } : { known: false };
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

export function jobState(job: Reading<Job>, cost: Reading<JobCost>): JobState {
  const final = job.ok && isFinalState(job.value.state);
  const costSettled = cost.ok && cost.value.status !== "pending";
  const nothingPaid = job.ok && !job.value.attempts.some((attempt) => attempt.payment_sent);
  return {
    job: job.ok ? job.value : null,
    cost: cost.ok ? cost.value : null,
    problem: job.ok ? null : `job: ${job.problem.kind === "http" ? `HTTP ${job.problem.status}` : job.problem.kind}`,
    settled: final && (costSettled || nothingPaid),
  };
}

function field(value: Record<string, unknown>, name: string): unknown {
  return value[name];
}

/**
 * A run request from the browser, checked before anything is sent (decision D19). The browser built it,
 * so nothing in it is trusted: the server parses it again and the engine checks the key's permissions.
 */
export function parseRun(value: unknown): Parsed<RunInput> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid("body", "The run request must be a JSON object.");
  const body = value as Record<string, unknown>;
  const app = field(body, "app");
  if (typeof app !== "string" || !/^[A-Za-z0-9._/@:-]{1,200}$/.test(app)) return invalid("app", "Choose an offering.");
  const path = field(body, "path");
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 500 || /\s/.test(path)) return invalid("path", "The path must start with / and have no spaces.");
  const method = field(body, "method");
  if (method !== "POST" && method !== "GET") return invalid("method", "The method must be POST or GET.");
  const payload = field(body, "payload");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return invalid("payload", "The input must be a JSON object.");
  const stream = field(body, "stream");
  if (typeof stream !== "boolean") return invalid("stream", "Say whether to stream.");
  const timeout = wholeNumber(String(field(body, "timeoutS")), "timeoutS", "Timeout", 5, 600);
  if (!timeout.ok) return timeout;
  const attempts = wholeNumber(String(field(body, "maxAttempts")), "maxAttempts", "Attempts", 1, 5);
  if (!attempts.ok) return attempts;
  const ref = field(body, "operationRef");
  if (typeof ref !== "string" || !/^[A-Za-z0-9._:-]{8,200}$/.test(ref)) return invalid("operationRef", "The run lost its operation reference; try again.");
  return parsed({ app, path, method, payload: payload as Record<string, unknown>, stream, timeoutS: timeout.value, maxAttempts: attempts.value, operationRef: ref });
}
