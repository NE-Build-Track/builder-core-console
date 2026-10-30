import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ExchangePanel } from "@/components/console/act/exchange-panel";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, PageHead, ReadFrom, Section, Unreadable } from "@/components/console/primitives";
import { JobRecord } from "@/components/console/run/job-record";
import { Ago, Id, Pill } from "@/components/console/values";
import type { State } from "@/domain/views";
import { loadJobState, loadMyJobs } from "@/runtime/builder";

import { sessionFor } from "../../session-cookies";
import { BuilderBar, BuilderSignIn } from "../gate";

export const metadata: Metadata = { title: "My jobs" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES: Record<string, State> = { succeeded: "ok", failed: "bad", uncertain: "warn" };

export default function MyJobsPage({ searchParams }: { readonly searchParams: Search }) {
  return (
    <PageView>
      <PageHead icon="jobs" eyebrow="Builder" title="My jobs">
        Every job this actor key has run, newest first, with whether payment went out, why a job failed and what to do about it. Open one for its
        attempts, the engine&apos;s own message and its network cost.
      </PageHead>
      <Streamed tiles={2}>
        <MyJobs searchParams={searchParams} />
      </Streamed>
    </PageView>
  );
}

async function MyJobs({ searchParams }: { readonly searchParams: Search }) {
  await connection();
  const search = await searchParams;
  const session = await sessionFor("builder");
  if (!session) return <BuilderSignIn message={null} />;
  const raw = search.id;
  const id = typeof raw === "string" && JOB_ID.test(raw) ? raw : null;
  const [mine, detail] = await Promise.all([loadMyJobs(session), id ? loadJobState(session, id) : Promise.resolve(null)]);
  const rows = mine.jobs.ok ? mine.jobs.value : [];
  return (
    <>
      <BuilderBar session={session} actorId={mine.actorId} current="/builder/jobs" />
      {id && detail ? (
        <Section id="h-job" title="The job" description="Its attempts, whether each paid, and its wholesale network cost as the engine attributes it.">
          <div className="panel">
            <JobRecord jobId={id} state={detail} />
          </div>
          <ExchangePanel call={{ method: "GET", path: `/v1/jobs/${id}` }} title="How this job is read" />
        </Section>
      ) : null}
      <Section id="h-my-jobs" title="All my jobs" description="Up to the 50 newest.">
        <Unreadable reading={mine.jobs} what="Your jobs" />
        {mine.jobs.ok && rows.length === 0 ? (
          <Empty>
            No jobs yet. <Link href="/builder#run">Run one.</Link>
          </Empty>
        ) : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Your jobs, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Offering</th>
                  <th scope="col">State</th>
                  <th scope="col">Started</th>
                  <th scope="col" className="r">
                    Attempts
                  </th>
                  <th scope="col">Paid</th>
                  <th scope="col">Failure</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">
                      <Link href={`/builder/jobs?id=${row.id}`} aria-current={row.id === id ? "true" : undefined}>
                        <Id value={row.id} short />
                      </Link>
                    </td>
                    <td className="mono">
                      <bdi>{row.app}</bdi>
                    </td>
                    <td>
                      <Pill state={STATES[row.state] ?? "unknown"}>{row.state}</Pill>
                    </td>
                    <td>
                      <Ago iso={row.createdAt} />
                    </td>
                    <td className="r num">{row.attempts}</td>
                    <td>{row.paid ? "yes" : "no"}</td>
                    <td className="table-cell-wrap">
                      {row.failure ? (
                        <>
                          <b>{row.failure.title}</b> <span className="muted">({row.failure.code})</span>
                          <br />
                          {row.failure.todo}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <ReadFrom reading={mine.jobs} />
        <ExchangePanel call={{ method: "GET", path: "/v1/jobs?limit=50" }} title="How this list is read" />
      </Section>
    </>
  );
}
