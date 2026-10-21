import type { Metadata } from "next";
import { connection } from "next/server";

import { SessionBar } from "@/components/console/act/session-bar";
import { SignIn } from "@/components/console/act/sign-in";
import { PageView, Streamed } from "@/components/console/page-view";
import { GapChip, PageHead } from "@/components/console/primitives";
import { viewOf } from "@/domain/session";
import { consoleSettings } from "@/runtime/console";
import { loadOperator } from "@/runtime/operator";
import { signInEnabled } from "@/runtime/session";

import { signInOperator, signOutOperator } from "../actions";
import { sessionFor } from "../session-cookies";
import { ActorsSection, GrantsSection, KeysSection } from "./sections";

export const metadata: Metadata = { title: "Operator actions" };

export default function OperatorPage() {
  return (
    <PageView>
      <PageHead icon="pen" eyebrow="Operator" title="Operator actions">
        Change the stack through the engine&apos;s admin API: fund grants, provision actors and issue their keys. Every action shows what it will change
        and the exact REST call before anything is sent, and the call and response after.
      </PageHead>
      <Streamed tiles={3}>
        <Operator />
      </Streamed>
    </PageView>
  );
}

async function Operator() {
  await connection();
  const session = await sessionFor("operator");
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
      <KeysSection view={view} applicationId={settings.applicationId} />
      <p className="provenance">
        Actors are listed from their access keys; an actor with an allocation but no key does not appear <GapChip id="G2" />. Allocations read in the admin
        key&apos;s own application <GapChip id="G9" />.
      </p>
    </>
  );
}
