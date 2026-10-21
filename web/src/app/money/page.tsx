import type { Metadata } from "next";
import { connection } from "next/server";

import { CopyButton } from "@/components/console/copy-button";
import { CountUp } from "@/components/console/count-up";
import { Icon } from "@/components/console/icons";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, GapChip, Grid, PageHead, ReadFrom, Ring, Section, Tile, Truncated, Unreadable } from "@/components/console/primitives";
import { AgoMs, Amount, Id, Pill, Usd } from "@/components/console/values";
import type { AllocationView, GrantView } from "@/domain/views";
import { loadMoney } from "@/runtime/console";
import { approximate, difference, roundForDisplay, share, toUnits, weiToEth } from "@/utils/decimal";

export const metadata: Metadata = { title: "Money" };

export default function MoneyPage() {
  return (
    <PageView>
      <PageHead icon="money" eyebrow="Money" title="Money">
        Grants fund allocations; each allocation carries gateway keys and spends through signed tickets. Amounts come from the Batteries ledger, to 18
        decimals.
      </PageHead>
      <Streamed tiles={4}>
        <Money />
      </Streamed>
    </PageView>
  );
}

/** A tile headline: counts up for show, while the exact amount stays in the <data> around it. */
function Headline({ value, format, places }: { readonly value: string; readonly format: "usd2" | "usd4"; readonly places: number }) {
  return (
    <data value={value}>
      <CountUp to={approximate(value)} format={format}>{`$${roundForDisplay(value, places)}`}</CountUp>
    </data>
  );
}

async function Money() {
  await connection();
  const view = await loadMoney();
  const usd = view.totals.find((total) => total.currency === "USD");
  const engineCount = view.engineGrants.ok ? view.engineGrants.value.length : null;
  const batteriesCount = view.grants.ok ? view.grants.value.length : null;
  const balanced = view.ledgerSum !== null && toUnits(view.ledgerSum) === 0n;
  return (
    <>
      <Truncated truncated={view.truncated} />
      {usd ? (
        <Grid min="12rem">
          <Tile label="Granted" sub={`${batteriesCount ?? 0} ${batteriesCount === 1 ? "grant" : "grants"}`} lift>
            <Headline value={usd.granted} format="usd2" places={2} />
          </Tile>
          <Tile
            label="Allocated"
            lift
            sub={
              <>
                <Usd value={difference(usd.granted, usd.allocated)} /> not yet allocated
                <meter className="wide accent" min={0} max={Math.max(approximate(usd.granted), 1e-9)} value={approximate(usd.allocated)} aria-label="Allocated of granted">
                  {usd.allocated}
                </meter>
              </>
            }
          >
            <Headline value={usd.allocated} format="usd2" places={2} />
          </Tile>
          <Tile label="Spent" lift sub={<Amount value={usd.spent} head={6} />}>
            <Headline value={usd.spent} format="usd4" places={4} />
          </Tile>
          <Tile label="Available to spend" lift sub={`${(share(usd.spent, usd.allocated) * 100).toFixed(2)}% of allocations used`}>
            <Headline value={usd.available} format="usd2" places={2} />
          </Tile>
        </Grid>
      ) : null}

      <Section
        id="h-grants"
        title="Grants, allocations and keys"
        description="Outer ring: share of the grant spent. Inner ring: share allocated."
        end={
          engineCount !== null && batteriesCount !== null ? (
            <Pill state={engineCount === batteriesCount ? "ok" : "warn"}>
              {engineCount === batteriesCount
                ? `Engine sees the same ${engineCount === 1 ? "grant" : `${engineCount} grants`}`
                : `Engine sees ${engineCount} of ${batteriesCount} grants`}
            </Pill>
          ) : null
        }
      >
        <Unreadable reading={view.grants} what="Grants" />
        <Unreadable reading={view.allocations} what="Allocations" />
        <Unreadable reading={view.keys} what="Gateway keys" />
        <Unreadable reading={view.engineGrants} what="The engine's grants" />
        {view.grants.ok && view.grants.value.length === 0 ? <Empty>Batteries has no grants yet. Create one from Operator actions, or with the Batteries CLI (deploy/README.md).</Empty> : null}
        {view.grants.ok && view.grants.value.length > 0 ? (
          <Grid min="min(28rem, 100%)" start>
            {view.grants.value.map((grant) => (
              <GrantCard key={grant.grant.id} view={grant} />
            ))}
          </Grid>
        ) : null}
        {view.orphanAllocations.length > 0 ? (
          <article className="panel grant" aria-labelledby="orphans">
            <h3 id="orphans" className="name">
              Allocations with no listed grant
            </h3>
            <ul className="alloc-list" role="list">
              {view.orphanAllocations.map((allocation) => (
                <AllocationItem key={allocation.allocation.id} view={allocation} currency={allocation.allocation.currency} />
              ))}
            </ul>
          </article>
        ) : null}
        {view.grants.ok ? <ReadFrom reading={view.grants} /> : null}
      </Section>

      <Grid min="min(40rem, 100%)" start stagger={false}>
        <Section id="h-ledger" title="Ledger" reveal end={view.ledgerSum !== null ? <Pill state={balanced ? "ok" : "bad"}>{balanced ? "Balances to zero" : "Out of balance"}</Pill> : null}>
          <Unreadable reading={view.ledger} what="The ledger report" />
          {view.ledger.ok && view.ledger.value.length === 0 ? <Empty>The ledger has no accounts yet.</Empty> : null}
          {view.ledger.ok && view.ledger.value.length > 0 ? (
            <div className="table-scroll">
              <table className="data">
                <caption>GET /v1/ledger/report, balances in USD</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="r">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.ledger.value.map((row) => (
                    <tr key={`${row.account_id}-${row.account_type}`}>
                      <th scope="row" className="mono">
                        {row.account_id}
                      </th>
                      <td className="mono">{row.account_type}</td>
                      <td className="r">
                        <Amount value={row.balance_usd ?? row.balance_eth} currency={row.balance_usd !== undefined ? "USD" : "ETH"} head={6} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      Sum of all accounts
                    </th>
                    <td className="r">
                      <Amount value={view.ledgerSum} head={6} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}
        </Section>

        <Section id="h-escrow" title="Payer escrow" reveal end={<GapChip id="G7" />}>
          <Unreadable reading={view.escrow} what="The escrow report" />
          {view.escrow.ok && view.escrow.value.length === 0 ? (
            <div className="panel">
              <p className="note">
                <Icon name="gap" />
                <span>Deposit and reserve appear here when Batteries runs its on-chain listener. This stack, like ChatLPT&apos;s, does not run it yet.</span>
              </p>
            </div>
          ) : null}
          {view.escrow.ok
            ? view.escrow.value.map((row) => {
                const deposit = weiToEth(row.deposit_balance_wei);
                const reserve = weiToEth(row.reserve_balance_wei);
                const total = weiToEth(row.total_balance_wei);
                return (
                  <div key={`${row.chain_id}-${row.sender}`} className="panel">
                    <div className="escrow-head">
                      <Ring
                        fraction={share(reserve, total)}
                        inner={share(deposit, total)}
                        size={92}
                        label={roundForDisplay(total, 3)}
                        sub="ETH total"
                        description={`Deposit ${deposit} ETH, reserve ${reserve} ETH`}
                      />
                      <div className="stack-figs">
                        <span className="label">Deposit</span>
                        <span className="figure">{roundForDisplay(deposit, 4)} ETH</span>
                        <span className="label">Reserve</span>
                        <span className="figure">{roundForDisplay(reserve, 4)} ETH</span>
                      </div>
                    </div>
                    <dl className="facts">
                      <dt>Chain</dt>
                      <dd>{row.chain_id}</dd>
                      <dt>TicketBroker</dt>
                      <dd className="id">{row.contract_address}</dd>
                      <dt>Payer</dt>
                      <dd className="id">{row.sender}</dd>
                      <dt>Confirmed through</dt>
                      <dd className="mono">block {row.confirmed_through_block}</dd>
                    </dl>
                  </div>
                );
              })
            : null}
        </Section>
      </Grid>
    </>
  );
}

function money(value: string, currency: string, places: number): string {
  const shown = roundForDisplay(value, places);
  return currency.toUpperCase() === "USD" ? `$${shown}` : `${shown} ${currency.toUpperCase()}`;
}

function GrantCard({ view }: { readonly view: GrantView }) {
  const { grant } = view;
  const spent = share(view.spent, view.total);
  const allocated = share(view.allocated, view.total);
  return (
    <article className="panel grant lift" aria-labelledby={`g-${grant.id}`}>
      <div className="grant-top">
        <Ring
          fraction={spent}
          inner={allocated}
          size={104}
          label={`${(spent * 100).toFixed(spent < 0.1 ? 2 : 1)}%`}
          sub="spent"
          description={`${(spent * 100).toFixed(2)}% of the grant spent, ${(allocated * 100).toFixed(1)}% allocated`}
        />
        <div className="info">
          <span className="eyebrow quiet">Grant · {grant.status}</span>
          <h3 id={`g-${grant.id}`} className="name">
            {grant.name}
          </h3>
          <Id value={grant.id} />
          <div className="figures">
            <span>
              Total <b>{money(view.total, grant.currency, 2)}</b>
            </span>
            <span>
              Allocated <b>{money(view.allocated, grant.currency, 2)}</b>
            </span>
            <span>
              Spent <b>{money(view.spent, grant.currency, 6)}</b>
            </span>
            <span>
              Unallocated <b>{view.unallocated === null ? "—" : money(view.unallocated, grant.currency, 2)}</b>
            </span>
          </div>
        </div>
      </div>
      {view.allocations.length > 0 ? (
        <ul className="alloc-list" role="list" aria-label={`Allocations from ${grant.name}`}>
          {view.allocations.map((allocation) => (
            <AllocationItem key={allocation.allocation.id} view={allocation} currency={grant.currency} />
          ))}
        </ul>
      ) : (
        <Empty>No allocations from this grant yet.</Empty>
      )}
    </article>
  );
}

function AllocationItem({ view, currency }: { readonly view: AllocationView; readonly currency: string }) {
  const { allocation } = view;
  return (
    <li className="alloc">
      <div className="alloc-head">
        <span className="n">{allocation.name}</span>
        <span className="muted">
          <Id value={allocation.id} short /> · {allocation.status} · created <AgoMs ms={allocation.created_at_ms} />
        </span>
        <span className="end">
          {view.runwayDays === null ? (
            <Pill state="unknown">No spend this week</Pill>
          ) : (
            <Pill state={view.runwayDays < 7 ? "warn" : "ok"}>~{view.runwayDays.toLocaleString("en-US")} days left at 7-day pace</Pill>
          )}
        </span>
      </div>
      <div className="alloc-figs">
        <div>
          <span>Allocated</span>
          <Amount value={view.allocated} currency={currency} head={2} />
        </div>
        <div>
          <span>Spent</span>
          <Amount value={view.spent} currency={currency} head={6} />
        </div>
        <div>
          <span>Available</span>
          <Amount value={view.available} currency={currency} head={6} />
        </div>
      </div>
      <meter
        className="wide accent"
        min={0}
        max={Math.max(approximate(view.allocated), 1e-9)}
        low={approximate(view.allocated) * 0.15}
        optimum={approximate(view.allocated)}
        value={approximate(view.available)}
        aria-label={`Available of allocated for ${allocation.name}`}
      >
        {view.available}
      </meter>
      <div className="keys">
        <span>Gateway keys</span>
        {view.keys.length === 0 ? <span>none</span> : null}
        {view.keys.map((key) => (
          <span key={key.id} className="chip-row">
            <CopyButton value={key.prefix} label="key prefix" />
            {key.revoked_at_ms ? <Pill state="bad">revoked</Pill> : null}
            <span>
              used <AgoMs ms={key.last_used_at_ms} />
            </span>
          </span>
        ))}
      </div>
    </li>
  );
}
