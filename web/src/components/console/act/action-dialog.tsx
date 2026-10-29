"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import type { ActionState, FieldSpec, OperatorAction } from "@/domain/operator";

import { toast } from "../toast";
import { ExchangePanel } from "./exchange-panel";
import { Fields, ReviewLines } from "./fields";
import { NotShownAgain, ShownOnce } from "./shown-once";

type Props = {
  readonly action: OperatorAction;
  /** The button that opens the dialog, and the dialog's title. */
  readonly label: string;
  readonly fields: readonly FieldSpec[];
  readonly operate: (previous: ActionState, form: FormData) => Promise<ActionState>;
  readonly signInWithKey: (form: FormData) => Promise<void>;
  readonly quiet?: boolean;
  readonly danger?: boolean;
};

function newRef(action: OperatorAction): string {
  return `console-${action}-${crypto.randomUUID()}`;
}

/**
 * One Operator action in a native modal dialog (decision D17): fill in → review → result. Nothing is
 * sent before the review is confirmed; the review shows the exact call (D18). The operation reference is
 * made when the dialog first renders and kept through Back, a closed and reopened dialog, and Try again,
 * so a double submit or a retry after a lost answer is the same command, which the engine applies once
 * (builder-core D57). Only a new intent makes a new one: Do another, or Start over after the engine
 * said the reference belongs to a different request.
 */
export function ActionDialog({ action, label, fields, operate, signInWithKey, quiet = false, danger = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, formAction, pending] = useActionState(operate, { step: "fill" });
  const [ref, setRef] = useState(() => newRef(action));
  const router = useRouter();
  const changed = useRef(false);

  useEffect(() => {
    if (state.step === "done" && state.ok) {
      changed.current = true;
      toast(state.title);
    }
  }, [state]);

  function closed(): void {
    setRef(newRef(action));
    if (changed.current) {
      changed.current = false;
      router.refresh();
    }
  }

  function close(): void {
    dialog.current?.close();
  }

  const values = state.values;
  const operationRef = values?.operation_ref ?? ref;

  return (
    <>
      <button type="button" className={quiet ? "btn" : "btn primary"} data-danger={danger || undefined} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className="act-dialog" aria-labelledby={titleId} onClose={closed}>
        <div className="act-head">
          <h2 id={titleId}>{label}</h2>
          <ol className="steps" aria-label="Steps">
            <li aria-current={state.step === "fill" ? "step" : undefined}>Fill in</li>
            <li aria-current={state.step === "review" ? "step" : undefined}>Review</li>
            <li aria-current={state.step === "done" ? "step" : undefined}>Result</li>
          </ol>
          <button type="button" className="btn icon" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        {state.step === "fill" ? (
          <form action={formAction} className="act-form">
            <input type="hidden" name="action" value={action} />
            <input type="hidden" name="operation_ref" value={operationRef} />
            <Fields idPrefix={titleId} fields={fields} values={values} error={state.error} />
            {state.error && !state.error.field ? (
              <p className="form-error" role="alert">
                {state.error.message}
              </p>
            ) : null}
            <div className="act-buttons">
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" name="intent" value="review" className="btn primary" disabled={pending}>
                {pending ? "Reading the stack…" : "Review"}
              </button>
            </div>
          </form>
        ) : null}

        {state.step === "review" ? (
          <form action={formAction} className="act-form">
            {Object.entries(state.values).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <ReviewLines lines={state.review.lines} />
            {state.review.warnings.map((warning) => (
              <p key={warning} className="note" role="note">
                {warning}
              </p>
            ))}
            <ExchangePanel call={state.review.call} open />
            {state.review.confirm ? (
              <div className="field">
                <label htmlFor={`${titleId}-confirm`}>{state.review.confirm.prompt}</label>
                <input id={`${titleId}-confirm`} name="confirm" autoComplete="off" spellCheck={false} required />
              </div>
            ) : null}
            {state.error ? (
              <p className="form-error" role="alert">
                {state.error}
              </p>
            ) : null}
            <div className="act-buttons">
              <button type="submit" name="intent" value="back" className="btn" formNoValidate disabled={pending}>
                Back
              </button>
              <button type="submit" name="intent" value="commit" className="btn primary" data-danger={state.review.kind === "irreversible" || undefined} disabled={pending}>
                {pending ? "Sending…" : state.review.button}
              </button>
            </div>
          </form>
        ) : null}

        {state.step === "done" ? (
          <div className="act-form">
            {state.ok ? (
              <>
                <p className="pill" data-state="ok">
                  <i className="glyph" />
                  {state.title}
                </p>
                <ReviewLines lines={state.lines} />
                {state.note ? (
                  <p className="note" role="note">
                    {state.note}
                  </p>
                ) : null}
                {state.secret?.token ? <ShownOnce secret={{ ...state.secret, token: state.secret.token }} signInWithKey={signInWithKey} /> : null}
                {state.secret && !state.secret.token ? (
                  <NotShownAgain
                    secret={state.secret}
                    rotate={
                      <ActionDialog
                        action="rotateKey"
                        label="Rotate this key"
                        fields={[{ type: "hidden", name: "key_id", value: state.secret.keyId }]}
                        operate={operate}
                        signInWithKey={signInWithKey}
                      />
                    }
                  />
                ) : null}
              </>
            ) : (
              <div className="problem" role="alert">
                <strong>{state.title}</strong>
                <span>{state.message}</span>
              </div>
            )}
            <ExchangePanel call={state.exchange} open={!state.ok} />
            <form action={formAction} className="act-buttons">
              {Object.entries(state.values).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {state.ok ? (
                <button type="submit" name="intent" value="again" className="btn" onClick={() => setRef(newRef(action))}>
                  Do another
                </button>
              ) : state.retry === "new-reference" ? (
                <button type="submit" name="intent" value="again" className="btn" onClick={() => setRef(newRef(action))}>
                  Start over (new reference)
                </button>
              ) : (
                <button type="submit" name="intent" value="back" className="btn">
                  Try again (same reference)
                </button>
              )}
              <button type="button" className="btn primary" onClick={close}>
                Done
              </button>
            </form>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
