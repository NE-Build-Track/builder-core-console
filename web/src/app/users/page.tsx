import type { Metadata } from "next";
import { connection } from "next/server";

import { CountUp } from "@/components/console/count-up";
import { Icon } from "@/components/console/icons";
import { PageView, Streamed } from "@/components/console/page-view";
import { Empty, GapChip, Grid, PageHead, ReadFrom, Section, Tile, Unreadable } from "@/components/console/primitives";
import { Ago, Amount, Id, Pill } from "@/components/console/values";
import { vars } from "@/components/console/vars";
import type { Reconciliation } from "@/domain/engine";
import { describeProblem, type Reading } from "@/domain/reading";
import type { ActorView } from "@/domain/views";
import { loadUsers } from "@/runtime/console";
import { reconciliationVerdict } from "@/services/reconciliation";
import { approximate } from "@/utils/decimal";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <PageView>
      <PageHead icon="users" eyebrow="Engine actors" title="Users">
        Every actor the engine knows (provisioned, signed in, or holding a key), the allocation behind it, and whether the engine&apos;s cost for that actor matches Batteries.{" "}
        <GapChip id="G9" />
      </PageHead>
      <Streamed tiles={4}>
        <Users />
      </Streamed>
    </PageView>
  );
}

function missing(reading: Reading<unknown>): boolean {
  return !reading.ok && reading.problem.kind === "http" && reading.problem.status === 404;
}

function Reconciled({ reading }: { readonly reading: Reading<Reconciliation> }) {
  if (missing(reading)) return <Pill state="unknown">No allocation</Pill>;
  if (!reading.ok) return <Pill state="unknown">{describeProblem(reading.problem)}</Pill>;
  const verdict = reconciliationVerdict(reading.value);
  const { unattributed } = reading.value;
  switch (verdict.kind) {
    case "no_spend":
      return <Pill state="unknown">No spend yet</Pill>;
    case "balanced":
      return <Pill state="ok">Balanced</Pill>;
    case "catching_up":
      return (
        <span className="chip-row" data-tip="Batteries has charged tickets the engine's next cost sync will read. Nothing is unattributed.">
          <Pill state="ok">Syncing</Pill>
          <Amount value={verdict.gapUsd} head={6} />
        </span>
      );
    case "unattributed":
      return (
        <span className="chip-row">
          <Pill state="warn">Unattributed spend</Pill>
          <Amount value={unattributed.fee_usd ?? unattributed.fee_eth} currency={unattributed.fee_usd ? "USD" : "ETH"} head={6} />
        </span>
      );
    case "mismatch":
      return (
        <span className="chip-row">
          <Pill state="warn">Engine ahead of Batteries</Pill>
          <Amount value={verdict.gapUsd} head={6} />
        </span>
      );
  }
}

async function Users() {
  await connection();
  const view = await loadUsers();
  const { counts } = view;
  const actors = view.actors.ok ? view.actors.value : [];
  const maxSpent = Math.max(...actors.map((actor) => approximate(actor.spentUsd ?? "0")), 0);
  const unbalanced = actors.filter((actor) => actor.reconciliation.ok && reconciliationVerdict(actor.reconciliation.value).kind === "unattributed");
  return (
    <>
      <Grid min="10rem">
        <Tile label="Actors" sub={`in ${counts.applications} ${counts.applications === 1 ? "application" : "applications"}`}>
          <CountUp to={counts.actors} format="int">
            {String(counts.actors)}
          </CountUp>
        </Tile>
        <Tile label="Active keys" sub={view.keysOn ? undefined : "engine keys are off"}>
          {view.keysOn ? (
            <CountUp to={counts.activeKeys} format="int">
              {String(counts.activeKeys)}
            </CountUp>
          ) : (
            "—"
          )}
        </Tile>
        <Tile label="Balanced" sub={<Pill state="ok">engine = Batteries</Pill>}>
          {counts.balanced}
        </Tile>
        <Tile label="Needs a look" sub={counts.unbalanced ? <Pill state="warn">unattributed spend</Pill> : <Pill state="ok">none</Pill>}>
          {counts.unbalanced}
        </Tile>
      </Grid>

      <Section
        id="h-actors"
        title="Actors"
        description={`From GET /v1/admin/actors${view.keysOn ? " and GET /v1/admin/keys" : " (engine keys are off: people sign in through the identity provider)"}. Allocation, balance and 30-day spend read for application “${view.applicationId}”.`}
        reveal
      >
        <Unreadable reading={view.actors} what="Actors" />
        {view.actors.ok && actors.length === 0 ? (
          <Empty>{view.keysOn ? "No actors yet. Provision one, or issue an actor key, in Operator actions." : "No actors yet. A builder appears here after their first sign-in."}</Empty>
        ) : null}
        {actors.length > 0 ? (
          <div className="table-scroll">
            <table className="data">
              <caption>Actors with their allocation, balance and reconciliation</caption>
              <thead>
                <tr>
                  <th scope="col">Actor</th>
                  <th scope="col">Application</th>
                  {view.keysOn ? (
                    <th scope="col" className="r">
                      Keys
                    </th>
                  ) : null}
                  <th scope="col">Allocation</th>
                  <th scope="col" className="r">
                    Available
                  </th>
                  <th scope="col">30-day spend</th>
                  <th scope="col">Reconciled</th>
                </tr>
              </thead>
              <tbody>
                {actors.map((actor) => (
                  <ActorRow key={`${actor.applicationId}/${actor.actorId}`} actor={actor} maxSpent={maxSpent} keysOn={view.keysOn} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {unbalanced.map((actor) => (
          <p key={actor.actorId} className="note">
            <Icon name="gap" />
            <span>
              <bdi className="mono">{actor.actorId}</bdi>: Batteries applied tickets the engine cannot tie to a job. Usually a gateway key used outside the
              engine.
            </span>
          </p>
        ))}
        {view.actors.ok ? <ReadFrom reading={view.actors} /> : null}
      </Section>

      <Section id="h-application" title={`Application “${view.applicationId}”`} description="GET /v1/admin/reconciliation for the whole application.">
        {missing(view.applicationReconciliation) ? (
          <p className="note">
            <Icon name="gap" />
            <span>
              In per_actor mode the engine reconciles each actor on its own (the Reconciled column above), and the Health page sums them. <GapChip id="G10" />
            </span>
          </p>
        ) : (
          <>
            <Unreadable reading={view.applicationReconciliation} what="Reconciliation" />
            {view.applicationReconciliation.ok ? <Reconciled reading={view.applicationReconciliation} /> : null}
          </>
        )}
      </Section>

      <Section id="h-admins" title="Admin keys" end={<GapChip id="G8" />}>
        {view.admins.length === 0 ? <Empty>No admin keys listed.</Empty> : null}
        {view.admins.map((key) => (
          <div key={key.key_id} className="panel admin-row">
            <Id value={key.key_id} />
            <span className="chip">application {key.application_id}</span>
            {key.revoked_at ? <Pill state="bad">Revoked</Pill> : <Pill state="ok">Active</Pill>}
            <span className="muted">
              {key.label ? `“${key.label}” · ` : ""}created <Ago iso={key.created_at} />
            </span>
          </div>
        ))}
      </Section>
    </>
  );
}

function ActorRow({ actor, maxSpent, keysOn }: { readonly actor: ActorView; readonly maxSpent: number; readonly keysOn: boolean }) {
  const spent = approximate(actor.spentUsd ?? "0");
  return (
    <tr>
      <th scope="row">
        {actor.label ? (
          <>
            <bdi>{actor.label}</bdi>
            <br />
          </>
        ) : null}
        <bdi className={actor.label ? "mono muted" : "mono"}>{actor.actorId}</bdi>
      </th>
      <td className="mono">
        <bdi>{actor.applicationId}</bdi>
      </td>
      {keysOn ? (
        <td className="r num">
          {actor.activeKeys}
          {actor.keys.length > actor.activeKeys ? <span className="muted"> +{actor.keys.length - actor.activeKeys} revoked</span> : null}
        </td>
      ) : null}
      <td className="mono">
        {actor.allowance === null ? (
          <span className="muted">not readable (G9)</span>
        ) : actor.allowance.ok ? (
          <>
            <Id value={actor.allowance.value.allocation_id} short /> {actor.allowance.value.status}
          </>
        ) : (
          <span className="muted">{missing(actor.allowance) ? "no allocation" : describeProblem(actor.allowance.problem)}</span>
        )}
      </td>
      <td className="r">
        {actor.allowance?.ok ? <Amount value={actor.allowance.value.available?.amount} currency={actor.allowance.value.available?.currency} head={4} /> : "—"}
      </td>
      <td>
        {actor.spentUsd === null ? (
          "—"
        ) : (
          <span className="bar-cell">
            <span className="bar" aria-hidden="true">
              <i style={vars({ p: maxSpent ? ((spent / maxSpent) * 100).toFixed(2) : 0 })} />
            </span>
            <Amount value={actor.spentUsd} head={6} />
          </span>
        )}
      </td>
      <td>
        <Reconciled reading={actor.reconciliation} />
      </td>
    </tr>
  );
}
