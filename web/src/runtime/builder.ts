import "server-only";

import type { RunInput } from "@/domain/builder";
import { mapReading, type Reading } from "@/domain/reading";
import type { Session } from "@/domain/session";
import type { RunStarted } from "@/ports/keyed";
import { catalog, jobRow, jobState, usage, type CatalogView, type JobRow, type JobState, type UsageView } from "@/services/builder";
import { windowBounds, type WindowName } from "@/utils/time";

import { forgetReads, sharedSources } from "./console";
import { keyed } from "./session";

/**
 * The Builder area (decisions D15, D19, D20): everything is read with the builder's own key, so the page
 * shows exactly what that key may see. Only discovery freshness comes from the shared engine reader.
 */

const missingEngine = <T>(): Promise<T> => Promise.reject(new Error("CONSOLE_ENGINE_URL is not set"));

export async function loadCatalog(session: Session): Promise<CatalogView> {
  const engine = keyed(session.token);
  if (!engine) return missingEngine();
  const [offerings, health] = await Promise.all([engine.offerings(), sharedSources().engine.health()]);
  return catalog(offerings, health, new Date());
}

export type MyJobs = { readonly jobs: Reading<readonly JobRow[]>; readonly actorId: string | null };

export async function loadMyJobs(session: Session): Promise<MyJobs> {
  const engine = keyed(session.token);
  if (!engine) return missingEngine();
  const jobs = await engine.myJobs(50);
  const actorId = session.actorId ?? (jobs.ok ? (jobs.value[0]?.actor_id ?? null) : null);
  return { jobs: mapReading(jobs, (list) => list.map(jobRow)), actorId };
}

export async function loadJobState(session: Session, id: string): Promise<JobState> {
  const engine = keyed(session.token);
  if (!engine) return missingEngine();
  const [job, cost] = await Promise.all([engine.job(id), engine.jobCost(id)]);
  return jobState(job, cost);
}

export async function loadMyUsage(session: Session, window: WindowName): Promise<UsageView> {
  const engine = keyed(session.token);
  if (!engine) return missingEngine();
  const bounds = windowBounds(window, new Date());
  const [allowance, summary] = await Promise.all([engine.allowance(), engine.costSummary(bounds.start, bounds.end)]);
  return usage(allowance, summary, bounds);
}

/** Start a job for the builder. The response streams through the console unchanged. */
export async function startRun(session: Session, input: RunInput, signal: AbortSignal): Promise<RunStarted | null> {
  const engine = keyed(session.token);
  if (!engine) return null;
  const started = await engine.run(input, signal);
  forgetReads();
  return started;
}
