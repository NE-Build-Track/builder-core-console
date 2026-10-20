import type { Metadata } from "next";

import { GapOpener } from "@/components/console/ambient";
import { PageView } from "@/components/console/page-view";
import { Grid, PageHead, Section, Tile } from "@/components/console/primitives";
import { CATALOG } from "@/domain/catalog";
import { GAPS } from "@/domain/gaps";
import { PINS, shortCommit } from "@/domain/pins";

export const metadata: Metadata = { title: "Sources & gaps" };

const SOURCE_TITLES = { engine: "Engine", batteries: "Batteries", signer: "Signer" } as const;

export default function SourcesPage() {
  const counts = Object.entries(SOURCE_TITLES).map(([key, title]) => ({ title, routes: CATALOG.filter((entry) => entry.source === key).length }));
  return (
    <PageView>
      <PageHead icon="sources" eyebrow="Sources & gaps" title="Sources and gaps">
        Where every number in this console comes from, and what the stack cannot tell us yet. The console only reads: every route below is a GET, and
        nothing is stored.
      </PageHead>
      <Grid min="10rem">
        {counts.map((count) => (
          <Tile key={count.title} label={count.title} sub="routes read">
            {count.routes}
          </Tile>
        ))}
        <Tile label="Known gaps" sub={`G1–G${GAPS.length}`}>
          {GAPS.length}
        </Tile>
      </Grid>

      <Section id="h-catalog" title="What the console reads" reveal>
        <div className="table-scroll">
          <table className="data">
            <caption>Upstream routes the console reads</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Route</th>
                <th scope="col">Credential</th>
                <th scope="col">Used for</th>
              </tr>
            </thead>
            <tbody>
              {CATALOG.map((entry) => (
                <tr key={`${entry.source} ${entry.route}`}>
                  <th scope="row">{SOURCE_TITLES[entry.source]}</th>
                  <td>
                    <code translate="no">{entry.route}</code>
                  </td>
                  <td>{entry.credential}</td>
                  <td className="table-cell-wrap">{entry.usedFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="h-pins" title="Pinned versions" description="The commits deploy/compose.yaml builds.">
        <div className="pins stagger">
          {Object.entries(PINS).map(([name, pin]) => (
            <dl key={name} className="pin lift">
              <dt>{SOURCE_TITLES[name as keyof typeof SOURCE_TITLES]}</dt>
              <dd>
                <a className="mono" href={`https://github.com/${pin.repository}/commit/${pin.commit}`} rel="external noopener" target="_blank">
                  {pin.repository}@{shortCommit(pin.commit)}
                </a>
                <span className="muted">{pin.note}</span>
              </dd>
            </dl>
          ))}
        </div>
      </Section>

      <Section id="h-gaps" title="Known gaps" description="Each is tracked in docs/references/gaps.md with the change that would close it.">
        <div className="pins stagger">
          {GAPS.map((item) => (
            <details key={item.id} className="gap" name="gaps" id={item.id.toLowerCase()}>
              <summary>
                <span className="gapchip">{item.id}</span>
                <span className="t">{item.title}</span>
                <span className="owner">owner: {item.owner}</span>
              </summary>
              <div className="body">
                <p>{item.impact}</p>
                <p className="fix">
                  <strong>Fix:</strong> {item.fix}
                </p>
              </div>
            </details>
          ))}
        </div>
      </Section>
      <GapOpener />
    </PageView>
  );
}
