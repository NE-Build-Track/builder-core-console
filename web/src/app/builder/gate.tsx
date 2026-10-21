/** The Builder area's door (decision D16): sign in with an actor key, or the signed-in bar and area tabs. */
import Link from "next/link";

import { SessionBar } from "@/components/console/act/session-bar";
import { SignIn } from "@/components/console/act/sign-in";
import { viewOf, type Session } from "@/domain/session";
import { signInEnabled } from "@/runtime/session";

import { signInBuilder, signOutBuilder } from "../actions";

const TABS = [
  { href: "/builder", label: "Catalog and run" },
  { href: "/builder/jobs", label: "My jobs" },
  { href: "/builder/usage", label: "Usage and cost" },
] as const;

export function BuilderSignIn({ message }: { readonly message: string | null }) {
  const enabled = signInEnabled();
  return (
    <SignIn area="builder" action={signInBuilder} enabled={enabled}>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      {enabled ? (
        <>
          <p>
            The Builder area is the journey a builder takes: one <b>actor key</b>, the live catalog with its rates, a paid job, its result, and what it
            cost. The builder never holds a wallet or a payment key; the operator funds the network.
          </p>
          <p>
            No key yet? An operator issues one in <Link href="/operator">Operator actions</Link> and can take it straight here.
          </p>
        </>
      ) : (
        <p className="note" role="note">
          Sign-in is off because <code>CONSOLE_SESSION_SECRET</code> is not set. Run <code>deploy/first-run.sh</code>, then restart the console.
        </p>
      )}
    </SignIn>
  );
}

export function BuilderBar({ session, actorId, current }: { readonly session: Session; readonly actorId: string | null; readonly current: (typeof TABS)[number]["href"] }) {
  return (
    <>
      <SessionBar session={{ ...viewOf(session), actorId }} signOut={signOutBuilder} />
      <nav className="area-nav" aria-label="Builder">
        {TABS.map((tab) => (
          <Link key={tab.href} className="btn" href={tab.href} aria-current={tab.href === current ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
