import Link from "next/link";

import { Empty, GapChip, ReadFrom, Section, Unreadable } from "@/components/console/primitives";
import { Ago, Pill } from "@/components/console/values";
import type { Job } from "@/domain/engine";
import type { JobList, State } from "@/domain/views";
import { JOB_PAGE } from "@/services/jobs";

export const JOB_STATES: Record<Job["state"], State> = { queued: "unknown", running: "unknown", succeeded: "ok", failed: "bad", uncertain: "warn" };

/** GET /v1/jobs as the reader sees it: every actor's jobs in the application (builder-core D44), newest first. */
export function JobListSection({ list }: { readonly list: JobList }) {
  const rows = list.rows.ok ? list.rows.value : [];
  return (
    <Section
      id="h-all"
      title={list.before ? "Older jobs" : "All jobs"}
      description={
        list.before ? (
          <>
            Created before <Ago iso={list.before} />, newest first, {JOB_PAGE} at a time.
          </>
        ) : (
          `Every actor's jobs in this application, newest first, ${JOB_PAGE} at a time. No filters yet (gap G15).`
        )
      }
      end={<GapChip id="G15" />}
      reveal
    >
      {list.invalidBefore ? (
        <p className="problem" role="alert">
          <strong>That page time has no offset.</strong>
          <span>The engine pages by a time with its offset, such as 2026-11-02T18:00:00Z, so the newest jobs are shown.</span>
        </p>
      ) : null}
      <Unreadable reading={list.rows} what="Jobs" />
      {list.rows.ok && rows.length === 0 ? <Empty>{list.before ? "No job was created before that time." : "No job has run on this engine yet."}</Empty> : null}
      {rows.length > 0 ? (
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Jobs, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">State</th>
                <th scope="col">App</th>
                <th scope="col">Actor</th>
                <th scope="col">Paid</th>
                <th scope="col" className="r">
                  Attempts
                </th>
                <th scope="col">Why it failed</th>
                <th scope="col">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <Link className="link-btn mono" href={`/jobs?id=${row.id}`} scroll={false}>
                      {row.id.slice(0, 8)}
                      <span className="muted">{row.id.slice(8, 13)}…</span>
                    </Link>
                  </th>
                  <td>
                    <Pill state={JOB_STATES[row.state]}>{row.state}</Pill>
                  </td>
                  <td className="mono table-cell-wrap">
                    <bdi>{row.app}</bdi>
                  </td>
                  <td className="mono">
                    <bdi>{row.actorId}</bdi>
                  </td>
                  <td>{row.paid ? "yes" : "no"}</td>
                  <td className="r num">{row.attempts}</td>
                  <td>{row.failure ? <>{row.failure.title} (<code>{row.failure.code}</code>)</> : "—"}</td>
                  <td>
                    <Ago iso={row.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.before || list.older ? (
        <nav className="row-actions" aria-label="Job pages">
          {list.before ? (
            <Link className="btn" href="/jobs" scroll={false}>
              Newest
            </Link>
          ) : null}
          {list.older ? (
            <Link className="btn" href={`/jobs?before=${encodeURIComponent(list.older)}`} scroll={false}>
              Older jobs
            </Link>
          ) : null}
        </nav>
      ) : null}
      {list.rows.ok ? <ReadFrom reading={list.rows} /> : null}
    </Section>
  );
}
