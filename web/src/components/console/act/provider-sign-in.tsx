/**
 * Sign in to a writing area through the identity provider (CONSOLE_AUTH=oidc). The button leaves for the
 * provider's login page; the console finishes the sign-in on the server and never shows a token.
 */
import type { ReactNode } from "react";

import type { Area } from "@/domain/session";

import { Icon } from "../icons";

export function ProviderSignIn({
  area,
  enabled,
  message,
  children,
}: {
  readonly area: Area;
  readonly enabled: boolean;
  readonly message: string | null;
  readonly children: ReactNode;
}) {
  const id = `provider-${area}`;
  return (
    <section className="panel signin" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <Icon name="pen" />
        Sign in {area === "operator" ? "as an operator" : "as a builder"}
      </h2>
      <div className="signin-why">{children}</div>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="row-actions">
        {enabled ? (
          <a className="btn primary" href={`/auth/login?area=${area}`}>
            Sign in with the identity provider
          </a>
        ) : (
          <button type="button" className="btn primary" disabled>
            Sign in with the identity provider
          </button>
        )}
      </div>
    </section>
  );
}
