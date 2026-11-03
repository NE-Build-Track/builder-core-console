import type { Metadata } from "next";
import { connection } from "next/server";

import { ExchangePanel } from "@/components/console/act/exchange-panel";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, GapChip, PageHead, ReadFrom, Section, Unreadable } from "@/components/console/primitives";
import { JobRunner } from "@/components/console/run/job-runner";
import { Ago, Pill } from "@/components/console/values";
import { loadAllocationNotice, loadCapabilityProfiles, loadCatalog, loadMyJobs } from "@/runtime/builder";
import { rangeText, runChoices } from "@/services/builder";

import { endedMessage, sessionFor } from "../session-cookies";
import { BuilderBar, BuilderSignIn } from "./gate";

export const metadata: Metadata = { title: "Builder" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function BuilderPage({ searchParams }: { readonly searchParams: Search }) {
  return (
    <PageView>
      <PageHead icon="bolt" eyebrow="Builder" title="Builder">
        The builder&apos;s journey over the engine&apos;s REST API, with an actor key: see what the network offers and at what rate, run a job, get its
        result or an understandable failure, and see what it cost. Every call is shown as it is made.
      </PageHead>
      <Streamed tiles={2}>
        <Builder searchParams={searchParams} />
      </Streamed>
    </PageView>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

async function Builder({ searchParams }: { readonly searchParams: Search }) {
  await connection();
  const search = await searchParams;
  const session = await sessionFor("builder");
  if (!session) return <BuilderSignIn message={first(search.signin) ?? (await endedMessage("builder"))} />;
  const [view, jobs, profiles] = await Promise.all([loadCatalog(session), loadMyJobs(session), loadCapabilityProfiles(session)]);
  const notice = await loadAllocationNotice(session, jobs.actorId);
  const entries = view.entries.ok ? view.entries.value : [];
  const choices = runChoices(entries);
  const asked = first(search.app);
  return (
    <>
      <BuilderBar session={session} actorId={jobs.actorId} current="/builder" />
      {notice ? (
        <p className="note" role="note">
          {notice.message} Your actor id: <code>{notice.actorId}</code>
        </p>
      ) : null}
      <Section
        id="h-catalog"
        title="What the network offers"
        description={
          <>
            Read live from the orchestrators on the engine&apos;s list. Rates are the orchestrators&apos; wholesale network rates, exactly as advertised in
            their own currency and unit; an app sets its own retail price. No USD rate yet <GapChip id="G14" />.
          </>
        }
        end={view.discovery.ok ? <Pill state={view.discovery.value.discovery_fresh ? "ok" : "warn"}>{view.discovery.value.discovery_fresh ? "Discovery fresh" : "Discovery stale"}</Pill> : null}
      >
        <Unreadable reading={view.entries} what="Offerings" />
        {view.entries.ok && entries.length === 0 ? <Empty>The engine sees no offerings. Is the discovery service serving and discovery fresh?</Empty> : null}
        {entries.length > 0 ? (
          <div className="table-scroll catalog-scroll">
            <table className="data">
              <caption className="sr-only">Offerings with ready runners, rate range and when they were read</caption>
              <thead>
                <tr>
                  <th scope="col">Offering</th>
                  <th scope="col" className="r">
                    Ready
                  </th>
                  <th scope="col">Wholesale rate</th>
                  <th scope="col">Read</th>
                  <th scope="col">
                    <span className="sr-only">Run</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.key}>
                    <td className="mono table-cell-wrap">
                      <bdi>{entry.app}</bdi>
                      {entry.notes.length > 0 ? <span className="hint"> · {entry.notes.join(" ")}</span> : null}
                    </td>
                    <td className="r num">
                      {entry.ready}/{entry.runners}
                    </td>
                    <td className="table-cell-wrap">
                      {rangeText(entry)}
                      {entry.source ? <span className="hint"> · {entry.source}</span> : null}
                    </td>
                    <td>{entry.stale ? <Pill state="warn">stale</Pill> : <Ago iso={entry.observedAt} />}</td>
                    <td className="r">
                      <a className="btn" href={`/builder?app=${encodeURIComponent(entry.app)}#run`}>
                        Run
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <ReadFrom reading={view.entries} />
        <ExchangePanel call={{ method: "GET", path: "/v1/offerings" }} title="How this list is read" />
      </Section>
      <Section id="run" title="Run a job" description="Pick an offering, give the runner its input, and run it. The job is paid from your allocation; you hold no crypto.">
        <Unreadable reading={profiles} what="Capability schemas" />
        <JobRunner
          key={asked ?? "default"}
          offerings={choices}
          initialApp={asked && choices.some((choice) => choice.app === asked) ? asked : null}
          actorId={jobs.actorId}
          profiles={profiles.ok ? profiles.value : []}
        />
      </Section>
    </>
  );
}
