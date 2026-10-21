"use client";

import type { ShownOnce as Secret } from "@/domain/operator";

import { CopyAction } from "../copy-button";

/**
 * A new key, shown this once (decision D17): the engine keeps only its hash, and the console keeps
 * nothing. An actor key can be taken straight into the Builder area, which is outcome 1 of the journey.
 */
export function ShownOnce({ secret, signInWithKey }: { readonly secret: Secret; readonly signInWithKey: (form: FormData) => Promise<void> }) {
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
