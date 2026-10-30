import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ExchangePanel } from "@/components/console/act/exchange-panel";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, Grid, PageHead, ReadFrom, Section, Tile, Unreadable } from "@/components/console/primitives";
import { Amount, Pill, Usd } from "@/components/console/values";
import { COST_CLASS_LABELS, COST_CLASSES, type Fees } from "@/domain/engine";
import { loadMyJobs, loadMyUsage } from "@/runtime/builder";
import { isWindowName, WINDOWS, type WindowName } from "@/utils/time";

import { endedMessage, sessionFor } from "../../session-cookies";
import { BuilderBar, BuilderSignIn } from "../gate";

export const metadata: Metadata = { title: "Usage and cost" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const NAMES = Object.keys(WINDOWS) as WindowName[];

export default function MyUsagePage({ searchParams }: { readonly searchParams: Search }) {
  return (
    <PageView>
      <PageHead icon="usage" eyebrow="Builder" title="Usage and cost">
        What this actor may spend and what its jobs cost on the network. These are wholesale network costs, what orchestrators were paid; an app that
        charges its users sets its own retail price on top.
      </PageHead>
      <Streamed tiles={3}>
        <MyUsage searchParams={searchParams} />
      </Streamed>
    </PageView>
  );
}

async function MyUsage({ searchParams }: { readonly searchParams: Search }) {
  await connection();
  const search = await searchParams;
  const window: WindowName = isWindowName(search.window) ? search.window : "7d";
  const session = await sessionFor("builder");
  if (!session) return <BuilderSignIn message={await endedMessage("builder")} />;
  const [view, mine] = await Promise.all([loadMyUsage(session, window), loadMyJobs(session)]);
  const allowance = view.allowance.ok ? view.allowance.value : null;
  const pending = view.summary.ok ? view.summary.value.jobs_pending : null;
  return (
    <>
      <BuilderBar session={session} actorId={mine.actorId} current="/builder/usage" />
      <Section id="h-allowance" title="My allowance" description="Set by the operator. Jobs are refused before anything is paid once it runs out.">
        <Unreadable reading={view.allowance} what="Your allowance" />
        {allowance ? (
          <Grid min="12rem">
            <Tile label="Granted" sub={<Pill state={allowance.status === "active" ? "ok" : "warn"}>{allowance.status}</Pill>}>
              <Usd value={allowance.granted?.amount ?? null} places={4} />
            </Tile>
            <Tile label="Spent" sub={<Amount value={allowance.spent?.amount ?? null} head={6} />}>
              <Usd value={allowance.spent?.amount ?? null} places={4} />
            </Tile>
            <Tile label="Available">
              <Usd value={allowance.available?.amount ?? null} places={4} />
            </Tile>
          </Grid>
        ) : null}
        <ExchangePanel call={{ method: "GET", path: "/v1/allowance" }} title="How this is read" />
      </Section>
      <Section
        id="h-costs"
        title="Network cost by class"
        description="Each paid attempt is classed once Batteries reports it: delivered, failed after payment, uncertain, or still pending."
        end={
          <nav className="seg" data-i={NAMES.indexOf(window)} aria-label="Window">
            {NAMES.map((name) => (
              <Link key={name} href={`/builder/usage?window=${name}`} aria-current={name === window ? "page" : undefined} scroll={false}>
                {name}
              </Link>
            ))}
          </nav>
        }
      >
        <Unreadable reading={view.summary} what="Your cost summary" />
        {view.summary.ok ? (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Wholesale network cost by class in the window</caption>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col" className="r">
                    Cost (USD)
                  </th>
                  <th scope="col" className="r">
                    Tickets
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.classes.map((row) => (
                  <tr key={row.costClass}>
                    <td>{COST_CLASS_LABELS[row.costClass]}</td>
                    <td className="r num">{row.fees?.fee_usd ? <Amount value={row.fees.fee_usd} head={6} /> : <span className="muted">—</span>}</td>
                    <td className="r num">{row.fees?.row_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {pending ? <p className="note">{pending} job(s) paid but not yet reported by Batteries; their cost arrives within a minute or so.</p> : null}
        <ReadFrom reading={view.summary} />
        <ExchangePanel call={{ method: "GET", path: `/v1/costs/summary?start=${view.window.start}&end=${view.window.end}` }} title="How this is read" />
      </Section>
      <Section
        id="h-cost-apps"
        title="Network cost by app"
        description="The same fees, per offering and class (builder-core D60). Delivered, failed after payment and uncertain are final; pending can still grow, so it is never added to them."
      >
        <Unreadable reading={view.summary} what="Your cost summary" />
        {view.summary.ok && view.apps.length === 0 ? <Empty>No costed job in this window.</Empty> : null}
        {view.apps.length > 0 ? (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Wholesale network cost per app and class in the window, in USD</caption>
              <thead>
                <tr>
                  <th scope="col">App</th>
                  {COST_CLASSES.map((costClass) => (
                    <th key={costClass} scope="col" className="r">
                      {costClass === "pending" ? "Pending (can still grow)" : COST_CLASS_LABELS[costClass]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.apps.map((row) => (
                  <tr key={row.app}>
                    <th scope="row" className="mono">
                      <bdi>{row.app}</bdi>
                    </th>
                    {row.classes.map((cell) => (
                      <td key={cell.costClass} className="r num">
                        <Fee fees={cell.fees} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All apps</th>
                  {view.classes.map((cell) => (
                    <td key={cell.costClass} className="r num">
                      <Fee fees={cell.fees} />
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
        {view.appsUnbalanced.length > 0 ? (
          <p className="note">
            The apps do not add up to the class total for {view.appsUnbalanced.map((costClass) => COST_CLASS_LABELS[costClass].toLowerCase()).join(", ")}, though the engine
            promises they do. Both figures are shown as the engine sent them.
          </p>
        ) : null}
        <ExchangePanel call={{ method: "GET", path: `/v1/costs/summary?start=${view.window.start}&end=${view.window.end}` }} title="How this is read (by_app, from the same summary)" />
      </Section>
    </>
  );
}

/** One class's fees in USD, or a dash when the class has none. */
function Fee({ fees }: { readonly fees: Fees | null }) {
  if (!fees || fees.row_count === 0) return <span className="muted">—</span>;
  return fees.fee_usd ? <Amount value={fees.fee_usd} head={6} /> : <span className="muted">{fees.row_count} tickets, no USD yet</span>;
}
