"use client";

import type { ReactNode } from "react";

import type { ShownOnce as Secret } from "@/domain/operator";

import { CopyAction } from "../copy-button";

/**
 * A new key, shown this once (decision D17): the engine keeps only its hash, and the console keeps
 * nothing. An actor key can be taken straight into the Builder area, which is outcome 1 of the journey.
 */
export function ShownOnce({ secret, signInWithKey }: { readonly secret: Secret & { readonly token: string }; readonly signInWithKey: (form: FormData) => Promise<void> }) {
  return (
    <div className="shown-once" role="status">
      <p className="shown-once-k">
        <b>Copy this key now.</b> You will not see it again; if it is lost, revoke it and issue another.
      </p>
      <code className="secret" translate="no">
        {secret.token}
      </code>
      <div className="row-actions">
        <CopyAction value={secret.token} label="the key" primary />
        {secret.kind === "actor" ? (
          <form action={signInWithKey}>
            <input type="hidden" name="key" value={secret.token} />
            <button type="submit" className="btn">
              Use it in the Builder area
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A key the engine issued for an earlier request under the same operation reference (builder-core D57):
 * the engine answered the repeat from its record and keeps only the key's hash, so the token cannot be
 * shown again. `rotate` is the way back to a usable key: rotating it under a new reference.
 */
export function NotShownAgain({ secret, rotate }: { readonly secret: Secret; readonly rotate: ReactNode }) {
  return (
    <div className="shown-once" role="status">
      <p className="shown-once-k">
        <b>This key was already issued under this operation reference.</b> The engine never shows a token twice, so it cannot be shown here.
        If nobody copied it, rotate the key: that gives a new token and stops the old one at once.
      </p>
      <code className="secret" translate="no">
        {secret.keyId}
      </code>
      <div className="row-actions">{rotate}</div>
    </div>
  );
}
