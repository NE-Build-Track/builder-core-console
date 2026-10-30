import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Icon } from "@/components/console/icons";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, GapChip, PageHead, ReadFrom, Section, Unreadable } from "@/components/console/primitives";
import { Ago, Amount, Glyph, Id, Pill } from "@/components/console/values";
import { attemptPayment, COST_CLASS_LABELS, costClasses, type CostClass, type Fees, type Job, type JobCost } from "@/domain/engine";
import { failureAdvice } from "@/domain/failures";
import type { JobLookup, State } from "@/domain/views";
import { loadJobs } from "@/runtime/console";

export const metadata: Metadata = { title: "Jobs" };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const CLASS_STYLE: Record<CostClass, string> = { delivered: "c-delivered", failed_after_payment: "c-failed", uncertain: "c-uncertain", pending: "c-pending" };
const JOB_STATES: Record<Job["state"], State> = { queued: "unknown", running: "unknown", succeeded: "ok", failed: "bad", uncertain: "warn" };

export default function JobsPage({ searchParams }: Props) {
  return (
    <PageView>
      <PageHead icon="jobs" eyebrow="Jobs" title="Jobs">
        Any job by id, with its attempts, the orchestrators it tried, what each attempt cost, and the signed sessions behind it. <GapChip id="G1" />
      </PageHead>
      <Suspense fallback={<LookupForm value="" />}>
        <LookupFormFromQuery searchParams={searchParams} />
      </Suspense>
      <Streamed tiles={2}>
        <Jobs searchParams={searchParams} />
      </Streamed>
    </PageView>
  );
}

const pickId = (params: Record<string, string | string[] | undefined>) => (typeof params.id === "string" ? params.id : "");

async function LookupFormFromQuery({ searchParams }: Props) {
  return <LookupForm value={pickId(await searchParams)} />;
}

function LookupForm({ value }: { readonly value: string }) {
  return (
    <search>
      <form className="lookup" method="get" action="/jobs">
        <p className="field">
          <label htmlFor="job-id">Job id</label>
          <input
            id="job-id"
            name="id"
            type="search"
            autoComplete="off"
            spellCheck={false}
            defaultValue={value}
            placeholder="00000000-0000-0000-0000-000000000000"
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            aria-describedby="job-hint"
          />
        </p>
        <button className="btn primary" type="submit">
          <Icon name="search" />
          Look up
        </button>
        <p className="hint-bad" id="job-hint">
          That is not a job id. Job ids are UUIDs, as in the engine&apos;s <code>Livepeer-Job-Id</code> header.
        </p>
      </form>
    </search>
  );
}

function FeesAmount({ fees }: { readonly fees: Fees }) {
  return <Amount value={fees.fee_usd ?? fees.fee_eth} currency={fees.fee_usd ? "USD" : "ETH"} head={6} />;
}

/** The fees, and the billable part when a failover makes them differ: only the delivered attempt (builder-core D52). */
function CostFees({ cost }: { readonly cost: JobCost }) {
  const billable = cost.billable;
  const differs = billable != null && (billable.fee_usd ?? billable.fee_eth) !== (cost.fees.fee_usd ?? cost.fees.fee_eth);
  return (
    <>
      <FeesAmount fees={cost.fees} />
      {differs ? (
        <span className="muted">
          {" "}
          · <FeesAmount fees={billable} /> billable
        </span>
      ) : null}
    </>
  );
}

const PAYMENT_WORDS = { paid: "yes", unknown: "unknown", none: "no" } as const;
/** A signed session's state (builder-core D54): stored before signing, then paid or refused. */
const SESSION_WORDS = { paid: null, unknown: "the signer has not confirmed it", unpaid: "refused by the signer: never matched or billed" } as const;

async function Jobs({ searchParams }: Props) {
  const id = pickId(await searchParams);
  await connection();
  const view = await loadJobs(id || null);
  return (
    <>
      {view.invalidId ? (
        <p className="problem" role="alert">
          <strong>That is not a job id.</strong>
          <span>Job ids are UUIDs, as in the engine&apos;s Livepeer-Job-Id header.</span>
        </p>
      ) : null}
      {view.lookup ? <LookupResult lookup={view.lookup} /> : null}

      <Section id="h-newest" title="Newest costed jobs" description="GET /v1/costs/projections returns the 25 newest." end={<GapChip id="G3" />} reveal>
        <Unreadable reading={view.projections} what="Cost projections" />
        {view.projections.ok && view.projections.value.length === 0 ? <Empty>No job has a cost yet. Costs appear after the engine&apos;s next sync with Batteries.</Empty> : null}
        {view.projections.ok && view.projections.value.length > 0 ? (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">The 25 newest cost projections</caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Cost status</th>
                  <th scope="col">Cost class</th>
                  <th scope="col" className="r">
                    Fees
                  </th>
                  <th scope="col" className="r">
                    Attempts
                  </th>
                  <th scope="col">First observed</th>
                </tr>
              </thead>
              <tbody>
                {view.projections.value.map((cost) => {
                  const classes = costClasses(cost); // a job that failed over is several (builder-core D52)
                  return (
                    <tr key={cost.job_id}>
                      <th scope="row">
                        <Link className="link-btn mono" href={`/jobs?id=${cost.job_id}`} scroll={false}>
                          {cost.job_id.slice(0, 8)}
                          <span className="muted">{cost.job_id.slice(8, 13)}…</span>
                        </Link>
                      </th>
                      <td>
                        <Pill state={cost.status === "pending" || cost.status === "none" ? "unknown" : "ok"}>{cost.status}</Pill>
                      </td>
                      <td>
                        {classes.length > 0
                          ? classes.map((costClass) => (
                              <span className="chip-row" key={costClass}>
                                <span className={`swatch ${CLASS_STYLE[costClass]}`} />
                                {COST_CLASS_LABELS[costClass]}
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td className="r">
                        <CostFees cost={cost} />
                      </td>
                      <td className="r num">{cost.attempts.length}</td>
                      <td>
                        <Ago iso={cost.first_observed_at} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {view.projections.ok ? <ReadFrom reading={view.projections} /> : null}
      </Section>
    </>
  );
}

function host(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function LookupResult({ lookup }: { readonly lookup: JobLookup }) {
  const { job, cost, providerEvents } = lookup;
  if (!job.ok) {
    return job.problem.kind === "http" && job.problem.status === 404 ? (
      <p className="panel" role="status">
        No job <Id value={lookup.id} /> on this engine.
      </p>
    ) : (
      <Unreadable reading={job} what="The job" />
    );
  }
  const value = job.value;
  const events = providerEvents?.ok ? providerEvents.value : [];
  const feeFor = (manifest: string) => events.find((event) => event.manifest_id === manifest)?.computed_fee_usd;
  return (
    <article className="panel job" aria-labelledby="job-title">
      <div className="job-head">
        <h2 id="job-title">{value.id}</h2>
        <Pill state={JOB_STATES[value.state]}>{value.state}</Pill>
      </div>
      <dl className="facts">
        <dt>App</dt>
        <dd>
          <span className="mono">{value.app}</span>
          {value.capability ? ` · ${value.capability}` : ""}
          {value.model ? ` · ${value.model}` : ""}
        </dd>
        <dt>Actor</dt>
        <dd>
          <bdi className="mono">{value.actor_id}</bdi> in <bdi className="mono">{value.application_id}</bdi>
        </dd>
        <dt>Mode</dt>
        <dd>{value.mode}</dd>
        <dt>Submitted</dt>
        <dd>
          <Ago iso={value.created_at} />
        </dd>
        <dt>Completed</dt>
        <dd>
          <Ago iso={value.completed_at} />
        </dd>
        {value.failure ? (
          <>
            <dt>Failure</dt>
            <dd>
              <FailureFacts failure={value.failure} />
            </dd>
          </>
        ) : null}
        {value.usage ? (
          <>
            <dt>Measured usage</dt>
            <dd>
              {Object.entries(value.usage.quantities)
                .map(([unit, quantity]) => `${quantity.toLocaleString("en-US")} ${unit}`)
                .join(", ")}{" "}
              ({value.usage.source.replace("_", " ")})
            </dd>
          </>
        ) : null}
        <dt>Cost</dt>
        <dd>
          {cost?.ok ? (
            <>
              <CostFees cost={cost.value} /> · {cost.value.status}
            </>
          ) : cost ? (
            "unavailable"
          ) : (
            "—"
          )}
        </dd>
      </dl>
      <ol className="attempts" role="list" aria-label="Attempts">
        {value.attempts.map((attempt) => {
          const attemptCost = cost?.ok ? cost.value.attempts.find((row) => row.attempt_number === attempt.number) : undefined;
          const state: State =
            attempt.outcome === "succeeded"
              ? "ok"
              : attempt.outcome === "in_flight"
                ? "unknown"
                : attempt.outcome === "payment_unknown" || attemptCost?.cost_class === "uncertain"
                  ? "warn"
                  : "bad";
          return (
            <li key={attempt.number} className="attempt" data-state={state}>
              <span className="num" aria-hidden="true">
                {attempt.number}
              </span>
              <div className="body">
                <div className="line1">
                  <span className="sr-only">Attempt {attempt.number}:</span>
                  <Pill state={state}>
                    {attempt.outcome}
                    {attempt.status_code ? ` (${attempt.status_code})` : ""}
                  </Pill>
                  <span className="orch">{host(attempt.orchestrator_url)}</span>
                </div>
                <div className="attrs">
                  <span>
                    Paid <b>{PAYMENT_WORDS[attemptPayment(attempt)]}</b>
                  </span>
                  <span>
                    Cost class <b>{attemptCost ? COST_CLASS_LABELS[attemptCost.cost_class] : "—"}</b>
                  </span>
                  <span>Fees {attemptCost ? <FeesAmount fees={attemptCost.fees} /> : <b>—</b>}</span>
                  <Ago iso={attempt.started_at} />
                </div>
                {attempt.sessions.length > 0 ? (
                  <ul className="sessions" role="list" aria-label="Signed sessions">
                    {attempt.sessions.map((session) => {
                      const fee = feeFor(session.manifest_id);
                      const match = session.match ?? "unmatched";
                      const refused = session.payment_state === "unpaid";
                      const note = SESSION_WORDS[session.payment_state];
                      return (
                        <li
                          key={session.manifest_id}
                          data-match={refused ? "refused" : match}
                          tabIndex={0}
                          data-tip={
                            refused
                              ? "The signer refused this manifest, so it is never matched to usage and costs nothing."
                              : fee
                                ? `Batteries has a usage event for this manifest: ${fee} USD`
                                : "No Batteries usage event carries this manifest id yet."
                          }
                        >
                          <Glyph state={refused ? "unknown" : match === "matched" ? "ok" : "warn"} />
                          <span className="mono">{session.manifest_id}</span>
                          <span className="muted">{refused ? "unpaid" : match}</span>
                          {note ? <span className="muted">· {note}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {providerEvents && !providerEvents.ok ? <Unreadable reading={providerEvents} what="Batteries events for this job" /> : null}
      <ReadFrom reading={job} />
    </article>
  );
}

/** A failure in the engine's table's words (builder-core D58), with its own message and the next step. */
function FailureFacts({ failure }: { readonly failure: NonNullable<Job["failure"]> }) {
  const advice = failureAdvice(failure);
  return (
    <>
      <b>{advice.title}</b> (<code>{advice.code}</code>): {advice.message}
      <br />
      <span className="muted">What to do: {advice.todo}</span>
    </>
  );
}
