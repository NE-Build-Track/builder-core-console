/**
 * Jobs, within what the engine exposes today (gap G1, G3): the newest cost projections, and any job by
 * id with its attempts, its cost, and the Batteries events its signed sessions produced
 * (docs/product-specs/console.md#jobs).
 */
import type { UsageEvent } from "@/domain/batteries";
import type { Job } from "@/domain/engine";
import { ok, type Reading } from "@/domain/reading";
import type { JobLookup, JobsView } from "@/domain/views";
import type { Sources } from "@/ports/sources";

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

export async function jobs(sources: Sources, lookupId: string | null): Promise<JobsView> {
  const [projections, lookup] = await Promise.all([
    sources.engine.costProjections(),
    lookupId && isJobId(lookupId) ? lookupJob(sources, lookupId) : Promise.resolve(null),
  ]);
  return { projections, lookup, invalidId: lookupId !== null && lookupId !== "" && !isJobId(lookupId) };
}
