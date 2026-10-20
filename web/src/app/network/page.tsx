import type { Metadata } from "next";
import { connection } from "next/server";

import { CountUp } from "@/components/console/count-up";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, Grid, PageHead, ReadFrom, Ring, Section, Tile, Unreadable } from "@/components/console/primitives";
import { Ago, Pill } from "@/components/console/values";
import type { Runner } from "@/domain/engine";
import { loadNetwork } from "@/runtime/console";

export const metadata: Metadata = { title: "Network" };

export default function NetworkPage() {
  return (
    <PageView>
      <PageHead icon="network" eyebrow="Network" title="Network">
        What the engine can buy right now: apps on offer, the orchestrators the signer discovers, and every runner with its GPU, free slots and
        price.
      </PageHead>
      <Streamed tiles={4}>
        <Network />
      </Streamed>
    </PageView>
  );
}

function host(url: string | null | undefined): string {
  if (!url) return "—";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function price(amount: string): string {
  return /^\d+$/.test(amount) ? BigInt(amount).toLocaleString("en-US") : amount;
}

/** How many offering cards to show before the rest go into a table. Real networks offer ~100 apps. */
const FEATURED = 9;
/** Above this many rows the runners table starts collapsed. */
const RUNNERS_OPEN = 25;
/** App chips per orchestrator card before "+N more". */
const CHIPS = 6;

async function Network() {
  await connection();
  const view = await loadNetwork();
  const { totals } = view;
  const ranked = view.apps.ok
    ? [...view.apps.value].sort((left, right) => right.stats.total - left.stats.total || right.stats.runners - left.stats.runners || left.offering.app.localeCompare(right.offering.app))
    : [];
  const featured = ranked.slice(0, FEATURED);
  const rest = ranked.slice(FEATURED);
  const runners: { readonly app: string; readonly runner: Runner }[] = view.apps.ok
    ? view.apps.value.flatMap((row) => (row.runners.ok ? row.runners.value.map((runner) => ({ app: row.offering.app, runner })) : []))
    : [];
  return (
    <>
      <Grid min="11rem">
        <Tile label="Apps on offer">
          <CountUp to={totals.apps} format="int">
            {String(totals.apps)}
          </CountUp>
        </Tile>
        <Tile
          label="Orchestrators"
          sub={totals.orchestrators ? `${totals.freshOrchestrators} fresh, ${totals.orchestrators - totals.freshOrchestrators} stale` : "none discovered"}
        >
          <CountUp to={totals.orchestrators} format="int">
            {String(totals.orchestrators)}
          </CountUp>
        </Tile>
        <Tile label="Runners">
          <CountUp to={totals.runners} format="int">
            {String(totals.runners)}
          </CountUp>
        </Tile>
        <Tile
          label="Free slots"
          sub={
            <meter className="wide accent" min={0} max={Math.max(1, totals.slots)} value={totals.free} aria-label="Free slots across the network">
              {totals.free}
            </meter>
          }
        >
          <CountUp to={totals.free} format="int">
            {String(totals.free)}
          </CountUp>
          <small>/ {totals.slots}</small>
        </Tile>
      </Grid>

      {view.discovery.ok && !view.discovery.value.discovery_fresh ? (
        <p className="note" role="status">
          <span>
            Engine discovery is stale (last observed <Ago iso={view.discovery.value.discovery_observed_at} />)
            {view.discovery.value.discovery_error ? `: ${view.discovery.value.discovery_error}` : "."}
          </span>
        </p>
      ) : null}

      <Section
        id="h-offerings"
        title="Offerings"
        description={
          rest.length
            ? `GET /v1/offerings, joined with each app's runners. The ${FEATURED} apps with the most capacity first; all ${ranked.length} below.`
            : "GET /v1/offerings, joined with each app's runners."
        }
      >
        <Unreadable reading={view.apps} what="Offerings" />
        {view.apps.ok && view.apps.value.length === 0 ? <Empty>The engine offers no apps yet. Discovery may still be warming up.</Empty> : null}
        {featured.length > 0 ? (
          <Grid min="17rem">
            {featured.map(({ offering, runners: reading, stats }) => (
              <article key={offering.app} className="panel offering lift" aria-labelledby={`app-${offering.app}`}>
                <div className="panel-head">
                  <span className="app-id" id={`app-${offering.app}`}>
                    {offering.app}
                  </span>
                  <span className="end">
                    <Pill state={stats.free > 0 ? "ok" : "warn"} live={stats.free > 0}>
                      {stats.free > 0 ? "Available" : "Saturated"}
                    </Pill>
                  </span>
                </div>
                <p className="muted">
                  {offering.modes.join(", ") || "no modes"} · {offering.ready_count} of {offering.runner_count} runners ready
                </p>
                <dl className="kv">
                  <div>
                    <dt>Runners</dt>
                    <dd>{stats.runners}</dd>
                  </div>
                  <div>
                    <dt>Orchs</dt>
                    <dd>{stats.orchestrators}</dd>
                  </div>
                  <div>
                    <dt>Free</dt>
                    <dd>
                      {stats.free}
                      <small className="muted">/{stats.total}</small>
                    </dd>
                  </div>
                </dl>
                <meter className="wide accent" min={0} max={Math.max(1, stats.total)} low={stats.total * 0.2} optimum={stats.total} value={stats.free} aria-label={`Free slots for ${offering.app}`}>
                  {stats.free} of {stats.total}
                </meter>
                <p className="mono muted">
                  {stats.priceLow ? `${price(stats.priceLow)}${stats.priceHigh && stats.priceHigh !== stats.priceLow ? ` – ${price(stats.priceHigh)}` : ""} ${stats.priceUnit}` : "no price reported"}
                </p>
                <Unreadable reading={reading} what={`Runners for ${offering.app}`} />
              </article>
            ))}
          </Grid>
        ) : null}
        {rest.length > 0 ? (
          <details className="numbers">
            <summary>
              All {ranked.length} apps ({rest.length} more)
            </summary>
            <div className="table-scroll">
              <table className="data">
                <caption className="sr-only">Every app on offer</caption>
                <thead>
                  <tr>
                    <th scope="col">App</th>
                    <th scope="col" className="r">
                      Runners
                    </th>
                    <th scope="col" className="r">
                      Orchs
                    </th>
                    <th scope="col">Free / total slots</th>
                    <th scope="col" className="r">
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(({ offering, stats }) => (
                    <tr key={offering.app}>
                      <th scope="row" className="mono">
                        {offering.app}
                      </th>
                      <td className="r num">{stats.runners}</td>
                      <td className="r num">{stats.orchestrators}</td>
                      <td>
                        <span className="slots">
                          <meter min={0} max={Math.max(1, stats.total)} low={stats.total * 0.25} optimum={stats.total} value={stats.free} aria-label="free slots">
                            {stats.free}
                          </meter>
                          <span className="num">
                            {stats.free}/{stats.total}
                          </span>
                        </span>
                      </td>
                      <td className="r mono">{stats.priceLow ? `${price(stats.priceLow)} ${stats.priceUnit}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </Section>

      <Section id="h-orchs" title="Orchestrators" description="GET /discover-orchestrators on the signer. The ring shows free slots out of capacity.">
        <Unreadable reading={view.orchestrators} what="Orchestrators" />
        {view.orchestrators.ok && view.orchestrators.value.length === 0 ? <Empty>The signer discovers no orchestrators.</Empty> : null}
        {view.orchestrators.ok && view.orchestrators.value.length > 0 ? (
          <Grid min="20rem">
            {view.orchestrators.value.map((orchestrator) => (
              <article key={orchestrator.address} className="panel orch-card lift" aria-label={host(orchestrator.address)}>
                <Ring
                  fraction={orchestrator.capacity ? orchestrator.capacityAvailable / orchestrator.capacity : 0}
                  size={72}
                  label={String(orchestrator.capacityAvailable)}
                  sub={`of ${orchestrator.capacity} free`}
                  tone={orchestrator.capacityAvailable === 0 ? "warn" : undefined}
                  description={`${orchestrator.capacityAvailable} of ${orchestrator.capacity} slots free`}
                />
                <div className="meta">
                  <span className="url">{host(orchestrator.address)}</span>
                  <span className="addr">{orchestrator.address}</span>
                </div>
                <div className="foot">
                  <Pill state={orchestrator.stale ? "warn" : "ok"} live={!orchestrator.stale}>
                    {orchestrator.stale ? "Last seen " : "Seen "}
                    <Ago iso={orchestrator.lastSeen} />
                  </Pill>
                  <span>{orchestrator.runners} runners</span>
                  <span className="chips">
                    {orchestrator.apps.slice(0, CHIPS).map((app) => (
                      <span key={app} className="chip" title={app}>
                        {app.split("/").slice(-1)[0]}
                      </span>
                    ))}
                    {orchestrator.apps.length > CHIPS ? (
                      <span className="chip" title={orchestrator.apps.slice(CHIPS).join(", ")}>
                        +{orchestrator.apps.length - CHIPS} more
                      </span>
                    ) : null}
                  </span>
                </div>
              </article>
            ))}
          </Grid>
        ) : null}
        {view.orchestrators.ok ? <ReadFrom reading={view.orchestrators} /> : null}
      </Section>

      <Section id="h-runners" title="Runners" reveal>
        {runners.length === 0 ? (
          <Empty>No runners right now.</Empty>
        ) : (
          <details className="numbers" open={runners.length <= RUNNERS_OPEN}>
            <summary>
              {runners.length} runners across {totals.orchestrators} orchestrators
            </summary>
          <div className="table-scroll">
            <table className="data">
              <caption>Every runner the engine sees, by orchestrator</caption>
              <thead>
                <tr>
                  <th scope="col">Orchestrator</th>
                  <th scope="col">App</th>
                  <th scope="col">GPU</th>
                  <th scope="col" className="r">
                    VRAM
                  </th>
                  <th scope="col">Free / total slots</th>
                  <th scope="col" className="r">
                    Price
                  </th>
                  <th scope="col">Version</th>
                </tr>
              </thead>
              <tbody>
                {runners.map(({ app, runner }) => (
                  <tr key={runner.url}>
                    <th scope="row" className="mono">
                      {host(runner.orchestrator_url)}
                    </th>
                    <td className="mono">{app}</td>
                    <td>{runner.gpu?.name ?? "—"}</td>
                    <td className="r num">{runner.gpu?.vram_mb ? `${Math.round(runner.gpu.vram_mb / 1024)} GB` : "—"}</td>
                    <td>
                      <span className="slots">
                        <meter min={0} max={Math.max(1, runner.capacity ?? 0)} low={Math.max(0.5, (runner.capacity ?? 0) * 0.25)} optimum={runner.capacity ?? 0} value={runner.capacity_available ?? 0} aria-label="free slots">
                          {runner.capacity_available ?? 0}
                        </meter>
                        <span className="num">
                          {runner.capacity_available ?? "—"}/{runner.capacity ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="r mono">{runner.rate ? `${price(runner.rate.amount)} ${runner.rate.currency}/${runner.rate.unit}` : "—"}</td>
                    <td className="mono">{runner.version ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </details>
        )}
      </Section>
    </>
  );
}
