/**
 * Jobs: every job in the application a page at a time (GET /v1/jobs, builder-core D44 and D59), the newest
 * cost projections (gap G3), and any job by id with its attempts, its cost, and the Batteries events its
 * signed sessions produced (docs/product-specs/console.md#jobs).
 */
import type { UsageEvent } from "@/domain/batteries";
import type { Job } from "@/domain/engine";
import { failureAdvice } from "@/domain/failures";
import { mapReading, ok, type Reading } from "@/domain/reading";
import type { JobList, JobListRow, JobLookup, JobsView } from "@/domain/views";
import type { Sources } from "@/ports/sources";

/** Jobs per page of the list. */
export const JOB_PAGE = 50;

/** An ISO-8601 time with its offset: the engine refuses `before` without one (builder-core D59). */
const AWARE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isJobId(value: string): boolean {
  return UUID.test(value.trim());
}

/** Every manifest a job's attempts were signed under, once each. */
export function manifestsOf(job: Job): string[] {
  return [...new Set(job.attempts.flatMap((attempt) => attempt.sessions.map((session) => session.manifest_id)))];
}

export async function providerEvents(sources: Sources, job: Job): Promise<Reading<readonly UsageEvent[]>> {
  const readings = await Promise.all(manifestsOf(job).map((manifest) => sources.batteries.usageForManifest(manifest)));
  const failure = readings.find((reading) => !reading.ok);
  if (failure && !failure.ok) return failure;
  const events = readings.flatMap((reading) => (reading.ok ? reading.value.items : []));
  return ok("batteries", events, sources.now().toISOString());
}

export async function lookupJob(sources: Sources, id: string): Promise<JobLookup> {
  const trimmed = id.trim();
  const [job, cost] = await Promise.all([sources.engine.job(trimmed), sources.engine.jobCost(trimmed)]);
  return {
    id: trimmed,
    job,
    cost: job.ok ? cost : null,
    providerEvents: job.ok ? await providerEvents(sources, job.value) : null,
  };
}

function listRow(job: Job): JobListRow {
  const failure = job.failure ? failureAdvice(job.failure) : null;
  return {
    id: job.id,
    actorId: job.actor_id,
    app: job.app,
    state: job.state,
    createdAt: job.created_at,
    attempts: job.attempts.length,
    paid: job.attempts.some((attempt) => attempt.payment_sent),
    failure: failure ? { title: failure.title, code: failure.code } : null,
  };
}

export async function jobList(sources: Sources, before: string | null): Promise<JobList> {
  const given = before?.trim() || null;
  const usable = given !== null && AWARE_TIME.test(given) && !Number.isNaN(Date.parse(given)) ? given : null;
  const read = await sources.engine.jobs(usable ? { limit: JOB_PAGE, before: usable } : { limit: JOB_PAGE });
  const full = read.ok && read.value.length === JOB_PAGE;
  return {
    rows: mapReading(read, (list) => list.map(listRow)),
    before: usable,
    older: full ? (read.value.at(-1)?.created_at ?? null) : null,
    invalidBefore: given !== null && usable === null,
  };
}

export async function jobs(sources: Sources, lookupId: string | null, before: string | null = null): Promise<JobsView> {
  const [list, projections, lookup] = await Promise.all([
    jobList(sources, before),
    sources.engine.costProjections(),
    lookupId && isJobId(lookupId) ? lookupJob(sources, lookupId) : Promise.resolve(null),
  ]);
  return { list, projections, lookup, invalidId: lookupId !== null && lookupId !== "" && !isJobId(lookupId) };
}
