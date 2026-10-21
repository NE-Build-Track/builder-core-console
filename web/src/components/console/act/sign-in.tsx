"use client";

import { useActionState, type ReactNode } from "react";

import type { Area, SignInState } from "@/domain/session";

import { Icon } from "../icons";

/**
 * Sign in to a writing area by pasting a key (decision D16). The key goes to the server once, in this
 * form's POST; the server checks it with the engine and keeps it sealed in an httpOnly cookie.
 */
export function SignIn({
  area,
  action,
  enabled,
  children,
}: {
  readonly area: Area;
  readonly action: (previous: SignInState, form: FormData) => Promise<SignInState>;
  readonly enabled: boolean;
  readonly children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { message: null });
  const id = `key-${area}`;
  return (
    <form action={formAction} className="panel signin" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <Icon name="pen" />
        Sign in with {area === "operator" ? "an admin key" : "an actor key"}
      </h2>
      <div className="signin-why">{children}</div>
      <div className="field">
        <label htmlFor={id}>{area === "operator" ? "Admin key" : "Actor key"}</label>
        <input
          id={id}
          name="key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          pattern="lpk_[A-Za-z0-9_\-]{16,}"
          placeholder="lpk_…"
          disabled={!enabled}
          aria-describedby={state.message ? `${id}-error` : undefined}
        />
      </div>
      {state.message ? (
        <p id={`${id}-error`} className="form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="row-actions">
        <button type="submit" className="btn primary" disabled={pending || !enabled}>
          {pending ? "Checking the key…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
