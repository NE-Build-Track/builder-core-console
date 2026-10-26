/** The Operator page's three sections; each row carries the actions that change it (decision D15). */
import { ActionDialog } from "@/components/console/act/action-dialog";
import { Empty, Section, Unreadable } from "@/components/console/primitives";
import { Ago, Id, Pill, Usd } from "@/components/console/values";
import { ALLOCATION_STATUSES, type FieldSpec } from "@/domain/operator";
import type { OperatorActor, OperatorView } from "@/services/operator";

import { operate, signInBuilderWithKey } from "../actions";

const ids = (applicationId: string, actorId: string): FieldSpec[] => [
  { type: "hidden", name: "application_id", value: applicationId },
  { type: "hidden", name: "actor_id", value: actorId },
];

function grantOptions(view: OperatorView, blank: string | null): { value: string; label: string }[] {
  const grants = view.grants.ok ? view.grants.value : [];
  return [
    ...(blank === null ? [] : [{ value: "", label: blank }]),
    ...grants.map((grant) => {
      const free = view.unallocated[grant.id];
      return { value: grant.id, label: `${grant.name || "(no name)"} · $${grant.total || "?"} total${free === undefined ? "" : ` · $${free} unallocated`}` };
    }),
  ];
}

const common = { operate, signInWithKey: signInBuilderWithKey };

export function GrantsSection({ view }: { readonly view: OperatorView }) {
  return (
    <Section
      id="h-op-grants"
      title="Grants"
      description="Money the operator puts up. Allocations draw on a grant."
      end={
        <ActionDialog
          {...common}
          action="createGrant"
          label="Create a grant"
          fields={[
            { type: "text", name: "name", label: "Name", placeholder: "Pilot" },
            { type: "usd", name: "amount", label: "Amount", placeholder: "5", hint: "Dollars. The grant can be funded further later." },
          ]}
        />
      }
    >
      <Unreadable reading={view.grants} what="Grants" />
      {view.grants.ok && view.grants.value.length === 0 ? <Empty>No grants yet. Create one to start.</Empty> : null}
      {view.grants.ok && view.grants.value.length > 0 ? (
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Grants with their total and status</caption>
            <thead>
              <tr>
                <th scope="col">Grant</th>
                <th scope="col">Id</th>
                <th scope="col" className="r">
                  Total
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.grants.value.map((grant) => (
                <tr key={grant.id}>
                  <td>
                    <bdi>{grant.name || "(no name)"}</bdi>
                  </td>
                  <td className="mono">
                    <Id value={grant.id} />
                  </td>
                  <td className="r num">
                    <Usd value={grant.total} places={2} />
                  </td>
                  <td>
                    <Pill state={grant.status === "active" ? "ok" : "warn"}>{grant.status || "unknown"}</Pill>
                  </td>
                  <td className="r">
                    <ActionDialog
                      {...common}
                      quiet
                      action="fundGrant"
                      label="Fund"
                      fields={[{ type: "hidden", name: "grant_id", value: grant.id }, { type: "usd", name: "amount", label: `Add to ${grant.name || grant.id}`, placeholder: "1" }]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

function AllocationCells({ actor }: { readonly actor: OperatorActor }) {
  const allowance = actor.allowance;
  if (!allowance?.ok) {
    const missing = allowance && !allowance.ok && allowance.problem.kind === "http" && allowance.problem.status === 404;
    return (
      <>
        <td>
          <Pill state="unknown">{missing ? "not provisioned" : "unreadable"}</Pill>
        </td>
        <td className="r num">—</td>
        <td className="r num">—</td>
      </>
    );
  }
  return (
    <>
      <td>
        <Pill state={allowance.value.status === "active" ? "ok" : "warn"}>{allowance.value.status}</Pill>
      </td>
      <td className="r num">
        <Usd value={allowance.value.granted?.amount ?? null} places={4} />
      </td>
      <td className="r num">
        <Usd value={allowance.value.available?.amount ?? null} places={4} />
      </td>
    </>
  );
}

function ActorActions({ actor, view }: { readonly actor: OperatorActor; readonly view: OperatorView }) {
  const base = ids(actor.applicationId, actor.actorId);
  const provisioned = actor.allowance?.ok === true;
  if (!provisioned) {
    return (
      <ActionDialog
        {...common}
        quiet
        action="provision"
        label="Provision"
        fields={[
          ...base,
          { type: "select", name: "grant_id", label: "From grant", options: grantOptions(view, null) },
          { type: "usd", name: "amount", label: "Allocation", placeholder: "0.25" },
          { type: "text", name: "label", label: "Label (optional)" },
        ]}
      />
    );
  }
  return (
    <div className="row-actions">
      <ActionDialog
        {...common}
        quiet
        action="fundAllocation"
        label="Fund"
        fields={[
          ...base,
          { type: "usd", name: "amount", label: "Add", placeholder: "0.25" },
          { type: "select", name: "grant_id", label: "From grant", options: grantOptions(view, "The allocation's own grant") },
        ]}
      />
      <ActionDialog
        {...common}
        quiet
        action="setStatus"
        label="Status"
        fields={[...base, { type: "select", name: "status", label: "New status", options: ALLOCATION_STATUSES.filter((s) => s !== "revoked").map((s) => ({ value: s, label: s })) }]}
      />
      <ActionDialog {...common} quiet action="rotatePaymentKey" label="Rotate payment key" fields={base} />
      <ActionDialog {...common} quiet danger action="revokeAllocation" label="Revoke" fields={base} />
    </div>
  );
}

export function ActorsSection({ view, applicationId }: { readonly view: OperatorView; readonly applicationId: string }) {
  return (
    <Section
      id="h-op-actors"
      title="Actors and allocations"
      description="Each actor spends from its own allocation (per_actor mode). Provisioning moves money from a grant into it."
      end={
        <ActionDialog
          {...common}
          action="provision"
          label="Provision an actor"
          fields={[
            { type: "text", name: "application_id", label: "Application", value: applicationId },
            { type: "text", name: "actor_id", label: "Actor id", placeholder: "acme-studio", hint: "Letters, digits and . _ : @ -" },
            { type: "select", name: "grant_id", label: "From grant", options: grantOptions(view, null) },
            { type: "usd", name: "amount", label: "Allocation", placeholder: "0.25" },
            { type: "text", name: "label", label: "Label (optional)" },
          ]}
        />
      }
    >
      <Unreadable reading={view.provisioned} what="Provisioned actors" />
      {view.keys ? <Unreadable reading={view.keys} what="Access keys" /> : null}
      {view.actors.length === 0 ? <Empty>{view.keys ? "No actors yet. Provision one, then issue it a key." : "No actors yet. A person who signs in as a builder is the actor their identity provider's sub names; provision that id."}</Empty> : null}
      {view.actors.length > 0 ? (
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Actors with their allocation status and balance</caption>
            <thead>
              <tr>
                <th scope="col">Actor</th>
                <th scope="col">Application</th>
                <th scope="col" className="r">
                  Keys
                </th>
                <th scope="col">Allocation</th>
                <th scope="col" className="r">
                  Granted
                </th>
                <th scope="col" className="r">
                  Available
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.actors.map((actor) => (
                <tr key={`${actor.applicationId}/${actor.actorId}`}>
                  <td>
                    {actor.label ? (
                      <>
                        <bdi>{actor.label}</bdi>
                        <br />
                      </>
                    ) : null}
                    <span className="mono muted">
                      <bdi>{actor.actorId}</bdi>
                    </span>
                  </td>
                  <td className="mono">{actor.applicationId}</td>
                  <td className="r num">{actor.activeKeys}</td>
                  <AllocationCells actor={actor} />
                  <td className="r">
                    <ActorActions actor={actor} view={view} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

export function KeysSection({ view, applicationId }: { readonly view: OperatorView & { readonly keys: NonNullable<OperatorView["keys"]> }; readonly applicationId: string }) {
  const keys = view.keys.ok ? [...view.keys.value].sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  return (
    <Section
      id="h-op-keys"
      title="Access keys"
      description="Engine keys (lpk_). A builder needs an actor key; the engine keeps only a hash, so a key is shown once."
      end={
        <ActionDialog
          {...common}
          action="issueKey"
          label="Issue a key"
          fields={[
            { type: "text", name: "actor_id", label: "Actor id", placeholder: "acme-studio" },
            { type: "text", name: "application_id", label: "Application", value: applicationId },
            { type: "select", name: "kind", label: "Kind", options: [{ value: "actor", label: "actor (runs and reads its own jobs)" }, { value: "admin", label: "admin (everything)" }] },
            { type: "text", name: "label", label: "Label (optional)" },
          ]}
        />
      }
    >
      {keys.length > 0 ? (
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Access keys, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Key id</th>
                <th scope="col">Actor</th>
                <th scope="col">Kind</th>
                <th scope="col">Label</th>
                <th scope="col">Issued</th>
                <th scope="col">State</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.key_id}>
                  <td className="mono">
                    <Id value={key.key_id} short />
                  </td>
                  <td className="mono">
                    <bdi>{key.actor_id}</bdi> · {key.application_id}
                  </td>
                  <td>{key.kind}</td>
                  <td>{key.label ? <bdi>{key.label}</bdi> : <span className="muted">—</span>}</td>
                  <td>
                    <Ago iso={key.created_at} />
                  </td>
                  <td>{key.revoked_at ? <Pill state="unknown">revoked</Pill> : <Pill state="ok">active</Pill>}</td>
                  <td className="r">
                    {key.revoked_at ? null : (
                      <div className="row-actions">
                        <ActionDialog
                          {...common}
                          quiet
                          action="rotateKey"
                          label="Rotate"
                          fields={[
                            { type: "hidden", name: "key_id", value: key.key_id },
                            { type: "text", name: "label", label: "New label (optional)", placeholder: key.label || undefined, hint: "Leave empty to keep the current label." },
                          ]}
                        />
                        <ActionDialog {...common} quiet danger action="revokeKey" label="Revoke" fields={[{ type: "hidden", name: "key_id", value: key.key_id }]} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}
