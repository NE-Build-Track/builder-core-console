import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CountUp } from "@/components/console/count-up";
import { Icon, type IconName } from "@/components/console/icons";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, GapChip, Grid, PageHead, Section, Unreadable } from "@/components/console/primitives";
import { SignerMetricTiles } from "@/components/console/signer-metric-tiles";
import { Ticker } from "@/components/console/ticker";
import { TopologyDiagram } from "@/components/console/topology";
import { Ago, Glyph, Pill, STATE_WORDS } from "@/components/console/values";
import type { ComponentHealth } from "@/domain/views";
import { loadStackHealth } from "@/runtime/console";

export const metadata: Metadata = { title: "Health" };

const COMPONENT_ICONS: Record<ComponentHealth["component"], IconName> = { engine: "engine", batteries: "battery", signer: "pen" };

export default function HealthPage() {
  return (
    <PageView>
      <PageHead icon="health" eyebrow="Stack health" title="Health">
        One verdict for the whole stack, then each component&apos;s checks. The console re-reads every 15 seconds and only reads.
      </PageHead>
      <Streamed tiles={3}>
        <Health />
      </Streamed>
    </PageView>
  );
}

async function Health() {
  await connection();
  const health = await loadStackHealth();
  const { verdict } = health;
  return (
    <>
      <section className="verdict" aria-labelledby="verdict-h">
        <div className="verdict-summary">
          <p className="eyebrow">Overall verdict</p>
          <div className="verdict-word" data-state={verdict.state}>
            <i className="glyph" />
            <h2 id="verdict-h" className="big">
              {verdict.headline}
            </h2>
          </div>
          <p className="why">{verdict.why}</p>
          <div className="stats">
            <span>
              <b>
                <CountUp to={verdict.passing} format="int">
                  {String(verdict.passing)}
                </CountUp>
              </b>{" "}
              of {verdict.total} checks pass
            </span>
            {verdict.warnings ? (
              <span>
                <b>{verdict.warnings}</b> {verdict.warnings === 1 ? "warning" : "warnings"}
              </span>
            ) : null}
            {verdict.failing ? (
              <span>
                <b>{verdict.failing}</b> failing
              </span>
            ) : null}
            <span>
              checked <Ago iso={health.checkedAt} />
            </span>
          </div>
          <div className="row-actions">
            <Link className="btn" href="/usage">
              <Icon name="usage" />
              Usage
            </Link>
            <Link className="btn" href="/jobs">
              <Icon name="jobs" />
              Look up a job
            </Link>
          </div>
        </div>
        <figure className="diagram-scroll figure-plain">
          <TopologyDiagram topology={health.topology} />
        </figure>
      </section>

      <Grid min="19rem">
        {health.components.map((component) => (
          <article key={component.component} className="panel comp-card lift" aria-labelledby={`c-${component.component}`}>
            <div className="panel-head">
              <span className="comp-icon">
                <Icon name={COMPONENT_ICONS[component.component]} />
              </span>
              <div>
                <h2 id={`c-${component.component}`}>{component.title}</h2>
                <span className="sub">{component.role}</span>
              </div>
              <span className="end">
                <Pill state={component.state} live={component.state === "ok"}>
                  {component.state === "ok" ? "Healthy" : STATE_WORDS[component.state]}
                </Pill>
              </span>
            </div>
            <ul className="checks" role="list">
              {component.checks.map((check) => (
                <li key={check.id} data-state={check.state}>
                  <Glyph state={check.state} />
                  <span className="label">{check.label}</span>
                  <span className="word">{STATE_WORDS[check.state]}</span>
                  <span className="sum">
                    {check.summary}
                    {check.id === "batteries.balanced" && health.engine.ok && health.engine.value.allocation_mode === "per_actor" ? (
                      <>
                        {" "}
                        <GapChip id="G10" />
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </Grid>

      <Section
        id="h-signer-metrics"
        title="Signer metrics"
        description={
          <>
            Prometheus, read through the metrics relay <GapChip id="G5" />. No history is kept, so the lines start when this page opens.
          </>
        }
        reveal
      >
        <Unreadable reading={health.signerMetrics} what="Signer metrics" />
        {health.signerMetrics.ok ? <SignerMetricTiles metrics={health.signerMetrics.value} readAt={health.signerMetrics.readAt} /> : null}
      </Section>

      <Section id="h-ticker" title="Latest signed tickets" description="Applied by Batteries from the signer's outbox. Hover or focus to pause.">
        <Unreadable reading={health.ticker} what="Signed tickets" />
        {health.ticker.ok && health.ticker.value.length === 0 ? <Empty>No signed tickets yet. They appear once a paid job runs.</Empty> : null}
        {health.ticker.ok && health.ticker.value.length > 0 ? <Ticker items={health.ticker.value} /> : null}
      </Section>
    </>
  );
}
