/**
 * Who is signed in to a writing area (decision D16). The Operator actions take an admin key and the
 * Builder area an actor key; each area has its own session, so an operator can issue a key and try it
 * as a builder without signing out. The key itself lives only in the sealed cookie, server-side.
 */

export type Area = "operator" | "builder";
export type KeyKind = "admin" | "actor";

export type Session = {
  readonly area: Area;
  readonly token: string;
  readonly kind: KeyKind;
  /** Known for a builder once the key has run a job; the engine has no "who am I" call (gap G13). */
  readonly actorId: string | null;
  readonly applicationId: string | null;
  readonly prefix: string;
  readonly signedInAt: string;
  readonly expiresAt: string;
};

/** What pages may show about a session: everything but the key. */
export type SessionView = Omit<Session, "token">;

export const SESSION_HOURS = 8;

export const AREA_TITLES: Record<Area, string> = { operator: "Operator actions", builder: "Builder" };

/** Enough of a key to recognise it, never enough to use it: `lpk_Ab3dE…`. */
export function keyPrefix(token: string): string {
  return `${token.slice(0, 9)}…`;
}

export function viewOf(session: Session): SessionView {
  return { area: session.area, kind: session.kind, actorId: session.actorId, applicationId: session.applicationId, prefix: session.prefix, signedInAt: session.signedInAt, expiresAt: session.expiresAt };
}

export function isExpired(session: Pick<Session, "expiresAt">, now: Date): boolean {
  return Date.parse(session.expiresAt) <= now.getTime();
}

/** Keys the engine issues start `lpk_`; anything else is not worth a round trip. */
export function looksLikeKey(text: string): boolean {
  return /^lpk_[A-Za-z0-9_-]{16,}$/.test(text);
}

/** What a sign-in form shows after a try: nothing, or why the key was not accepted. */
export type SignInState = { readonly message: string | null };
