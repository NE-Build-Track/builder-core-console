import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CountUp } from "@/components/console/count-up";
import { PageView, Streamed } from "@/components/console/page-view";
import { Bars, Empty, GapChip, Grid, PageHead, ReadFrom, Section, Tile, Truncated, Unreadable } from "@/components/console/primitives";
import { Ticker } from "@/components/console/ticker";
import { UsageChart } from "@/components/console/usage-chart";
import { Ago, AgoMs, Amount, Pill } from "@/components/console/values";
import { vars } from "@/components/console/vars";
import { COST_CLASS_LABELS, type CostClass } from "@/domain/engine";
import { loadUsage } from "@/runtime/console";
import { approximate, roundForDisplay, share, sumDecimals } from "@/utils/decimal";
import { isWindowName, WINDOWS, type WindowName } from "@/utils/time";

export const metadata: Metadata = { title: "Usage" };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const WINDOW_LABELS: Record<WindowName, string> = { "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days" };
const CLASS_STYLE: Record<CostClass, string> = { delivered: "c-delivered", failed_after_payment: "c-failed", uncertain: "c-uncertain", pending: "c-pending" };
const CLASS_NOTES: Record<CostClass, string> = {
  delivered: "Paid, and the runner returned a result.",
  failed_after_payment: "Paid, then the runner failed.",
  uncertain: "Paid; the outcome is unknown (a stream that ended early).",
  pending: "Paid; the engine has not classified it yet.",
};

export default function UsagePage({ searchParams }: Props) {
  return (
    <PageView>
      <PageHead icon="usage" eyebrow="Usage" title="Usage">
        What the stack paid orchestrators, ticket by ticket, from the Batteries usage feed. <GapChip id="G6" />
      </PageHead>
      <Streamed tiles={4} keyed="usage">
        <Usage searchParams={searchParams} />
      </Streamed>
    </PageView>
  );
}

async function Usage({ searchParams }: Props) {
  const params = await searchParams;
  await connection();
  const window: WindowName = isWindowName(params.window) ? params.window : "7d";
  const view = await loadUsage(window);
  const names = Object.keys(WINDOWS) as WindowName[];
  const classTotal = sumDecimals(view.classes.map(({ fees }) => fees?.fee_usd ?? "0")).total;
  return (
    <>
      <div className="window-row">
        <nav className="seg" data-i={names.indexOf(window)} aria-label="Window">
          {names.map((name) => (
            <Link key={name} href={`/usage?window=${name}`} aria-current={name === window ? "page" : undefined} scroll={false}>
              {name}
            </Link>
          ))}
        </nav>
        {view.recent.length > 0 ? <Ticker items={view.recent} className="ticker-wrap" /> : null}
      </div>

      <Unreadable reading={view.events} what="Usage events" />
      <Truncated truncated={(view.events.ok && view.events.value.truncated) || view.sessionsTruncated} />

      <Grid min="12rem">
        <Tile label="Paid to the network" lift sub={<Amount value={view.feeUsd} head={6} />}>
          <data value={view.feeUsd}>
            <CountUp to={approximate(view.feeUsd)} format="usd4">{`$${roundForDisplay(view.feeUsd, 4)}`}</CountUp>
          </data>
        </Tile>
        <Tile
          label="Signed tickets applied"
          lift
          sub={
            <>
              avg <Amount value={view.averageFeeUsd} head={6} /> each
            </>
          }
        >
          <CountUp to={view.eventCount} format="int">
            {view.eventCount.toLocaleString("en-US")}
          </CountUp>
        </Tile>
        <Tile label="Quarantined events" lift sub={view.quarantined.length ? <Pill state="warn">not applied to the ledger</Pill> : <Pill state="ok">none</Pill>}>
          {view.quarantined.length}
        </Tile>
        <Tile label="Jobs with a cost" lift sub={view.engineCosts.ok ? `${view.engineCosts.value.jobs_pending} still pending` : "engine unreadable"}>
          {view.engineCosts.ok ? view.engineCosts.value.jobs_with_cost.toLocaleString("en-US") : "—"}
        </Tile>
      </Grid>

      <section className="panel" aria-labelledby="h-chart">
        <div className="panel-head">
          <h2 id="h-chart">Paid per {view.by}</h2>
          <span className="sub">{WINDOW_LABELS[window]}, USD, times in UTC</span>
        </div>
        <UsageChart buckets={view.buckets} by={view.by} windowLabel={WINDOW_LABELS[window]} />
        <details className="numbers">
          <summary>Show the numbers</summary>
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Paid per {view.by}</caption>
              <thead>
                <tr>
                  <th scope="col">{view.by === "hour" ? "Hour (UTC)" : "Day (UTC)"}</th>
                  <th scope="col" className="r">
                    Paid
                  </th>
                  <th scope="col" className="r">
                    Tickets
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.buckets.map((bucket) => (
                  <tr key={bucket.start}>
                    <th scope="row">
                      <time dateTime={bucket.start}>{view.by === "hour" ? bucket.start.slice(0, 16).replace("T", " ") : bucket.start.slice(0, 10)}</time>
                    </th>
                    <td className="r">
                      <Amount value={bucket.feeUsd} head={6} />
                    </td>
                    <td className="r num">{bucket.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel" aria-labelledby="h-classes">
        <div className="panel-head">
          <h2 id="h-classes">How the engine classifies that cost</h2>
          <span className="end">
            <GapChip id="G9" />
          </span>
        </div>
        <Unreadable reading={view.engineCosts} what="The cost summary" />
        <div className="stack" aria-hidden="true">
          {view.classes
            .filter(({ fees }) => approximate(fees?.fee_usd ?? "0") > 0)
            .map(({ costClass, fees }) => (
              <i key={costClass} className={CLASS_STYLE[costClass]} style={vars({ p: (share(fees?.fee_usd ?? "0", classTotal) * 100).toFixed(3) })} />
            ))}
        </div>
        <ul className="legend" role="list">
          {view.classes.map(({ costClass, fees }) => (
            <li key={costClass}>
              <span className={`swatch ${CLASS_STYLE[costClass]}`} />
              <span className="what">
                <span className="name">{COST_CLASS_LABELS[costClass]}</span>
                <span className="fig">
                  <Amount value={fees?.fee_usd ?? "0"} head={6} /> <span className="muted">· {(share(fees?.fee_usd ?? "0", classTotal) * 100).toFixed(1)}% · {fees?.row_count ?? 0} rows</span>
                </span>
                <span className="note-text">{CLASS_NOTES[costClass]}</span>
              </span>
            </li>
          ))}
        </ul>
        {view.engineCosts.ok ? <ReadFrom reading={view.engineCosts} /> : null}
      </section>

      <Grid min="min(22rem, 100%)">
        <section className="panel lift" aria-labelledby="h-by-app">
          <div className="panel-head">
            <h2 id="h-by-app">By app</h2>
          </div>
          <Bars rows={view.byApp} total={view.feeUsd} mono emptyText="No usage in this window." />
        </section>
        <section className="panel lift" aria-labelledby="h-by-orch">
          <div className="panel-head">
            <h2 id="h-by-orch">By orchestrator</h2>
          </div>
          <Bars rows={view.byOrchestrator} total={view.feeUsd} mono emptyText="No usage in this window." />
        </section>
        <section className="panel lift" aria-labelledby="h-by-alloc">
          <div className="panel-head">
            <h2 id="h-by-alloc">By allocation</h2>
          </div>
          <Bars rows={view.byAllocation} total={view.feeUsd} emptyText="No usage in this window." />
        </section>
      </Grid>

      <Section id="h-recent" title="Newest signed tickets" description="Individual ticket fees in USD, 18 decimals." reveal>
        {view.recent.length === 0 ? (
          <Empty>No signed tickets in the {WINDOW_LABELS[window]}.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Newest usage events in the window</caption>
              <thead>
                <tr>
                  <th scope="col">Manifest</th>
                  <th scope="col">Applied</th>
                  <th scope="col">App</th>
                  <th scope="col">Orchestrator</th>
                  <th scope="col">Allocation</th>
                  <th scope="col" className="r">
                    Fee (USD)
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.recent.map((item) => (
                  <tr key={item.id}>
                    <th scope="row" className="mono">
                      {item.manifestId || "—"}
                    </th>
                    <td>
                      <Ago iso={item.at} />
                    </td>
                    <td className="mono">{item.app}</td>
                    <td className="mono">{item.orchestrator}</td>
                    <td className="mono">{item.allocation}</td>
                    <td className="r">
                      <Amount value={item.feeUsd} head={6} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.events.ok ? <ReadFrom reading={view.events} /> : null}
      </Section>

      <Section id="h-quarantined" title="Quarantined events" description="Batteries kept these out of the ledger." reveal>
        {view.quarantined.length === 0 ? (
          <Empty>No quarantined events in the {WINDOW_LABELS[window]}.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Quarantined events</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Received</th>
                  <th scope="col">Allocation</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {view.quarantined.map((event) => (
                  <tr key={event.id}>
                    <th scope="row" className="mono">
                      {event.event_id}
                    </th>
                    <td>
                      <AgoMs ms={event.created_at_ms} />
                    </td>
                    <td className="mono">{event.allocation_id}</td>
                    <td className="table-cell-wrap">{event.error || event.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
