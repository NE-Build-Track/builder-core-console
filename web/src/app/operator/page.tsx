import type { Metadata } from "next";
import { connection } from "next/server";

import { ProviderSignIn } from "@/components/console/act/provider-sign-in";
import { SessionBar } from "@/components/console/act/session-bar";
import { SignIn } from "@/components/console/act/sign-in";
import { PageView, Streamed } from "@/components/console/page-view";
import { GapChip, PageHead } from "@/components/console/primitives";
import { viewOf } from "@/domain/session";
import { consoleSettings } from "@/runtime/console";
import { loadOperator } from "@/runtime/operator";
import { authMode, signInEnabled, signInOff } from "@/runtime/session";

import { signInOperator, signOutOperator } from "../actions";
import { sessionFor } from "../session-cookies";
import { ActorsSection, GrantsSection, KeysSection } from "./sections";

export const metadata: Metadata = { title: "Operator actions" };

export default function OperatorPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <PageView>
      <PageHead icon="pen" eyebrow="Operator" title="Operator actions">
        Change the stack through the engine&apos;s admin API: fund grants, provision actors and issue their keys. Every action shows what it will change
        and the exact REST call before anything is sent, and the call and response after.
      </PageHead>
      <Streamed tiles={3}>
        <Operator searchParams={searchParams} />
      </Streamed>
    </PageView>
  );
}

async function Operator({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const session = await sessionFor("operator");
  if (!session && authMode() === "oidc") {
    const signin = (await searchParams).signin;
    const off = signInOff();
    return (
      <ProviderSignIn area="operator" enabled={signInEnabled()} message={typeof signin === "string" ? signin : null}>
        {off ? (
          <p className="note" role="note">
            Sign-in is off: {off}.
          </p>
        ) : (
          <p>
            Operators sign in through the organisation&apos;s identity provider. It grants the admin scope only to people with the operator role, and the
            engine checks the token itself; the console keeps it sealed in a cookie and renews it before it expires.
          </p>
        )}
      </ProviderSignIn>
    );
  }
  if (!session) {
    const enabled = signInEnabled();
    return (
      <SignIn area="operator" action={signInOperator} enabled={enabled}>
        {enabled ? (
          <p>
            Operator actions use an <b>admin key</b> (<code>lpk_…</code>, from <code>lpb bootstrap-admin</code> or another admin). It is checked against the
            engine, then kept sealed in a cookie for 8 hours; the page never sees it again.
          </p>
        ) : (
          <p className="note" role="note">
            Sign-in is off because <code>CONSOLE_SESSION_SECRET</code> is not set. Run <code>deploy/first-run.sh</code>, which writes one, then restart
            the console.
          </p>
        )}
      </SignIn>
    );
  }
  const view = await loadOperator(session);
  const settings = consoleSettings();
  return (
    <>
      <SessionBar session={viewOf(session)} signOut={signOutOperator} />
      <GrantsSection view={view} />
      <ActorsSection view={view} applicationId={settings.applicationId} />
      {view.keys ? <KeysSection view={{ ...view, keys: view.keys }} applicationId={settings.applicationId} /> : null}
      <p className="provenance">
        {view.keys
          ? "Actors are the provisioned ones (GET /v1/admin/actors, with their labels) and any actor holding a key. "
          : "Engine API keys are off (the engine runs LPB_AUTH=jwt): people sign in through the identity provider, so there are no keys to issue, rotate or revoke. Actors are the provisioned ones (GET /v1/admin/actors). "}
        Allocations read in the signed-in operator&apos;s own application <GapChip id="G9" />.
      </p>
    </>
  );
}
