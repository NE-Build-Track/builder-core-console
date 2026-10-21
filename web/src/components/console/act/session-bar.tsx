/** Who is signed in to a writing area, until when, and the way out (decision D16). */
import type { ReactNode } from "react";

import type { SessionView } from "@/domain/session";

import { Id, Instant } from "../values";

export function SessionBar({ session, signOut, children }: { readonly session: SessionView; readonly signOut: () => Promise<void>; readonly children?: ReactNode }) {
  return (
    <div className="session-bar" role="status">
      <span className="pill" data-state="ok">
        <i className="glyph" />
        Signed in
      </span>
      <span>
        {session.kind === "admin" ? "Admin key" : "Actor key"} <Id value={session.prefix} />
        {session.actorId ? (
          <>
            {" "}
            · actor <Id value={session.actorId} />
          </>
        ) : null}
      </span>
      <span className="muted">
        until <Instant iso={session.expiresAt} />
      </span>
      {children}
      <form action={signOut} className="session-out">
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>
    </div>
  );
}
