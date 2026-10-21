"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import type { ActionState, FieldSpec, OperatorAction } from "@/domain/operator";

import { toast } from "../toast";
import { ExchangePanel } from "./exchange-panel";
import { Fields, ReviewLines } from "./fields";
import { ShownOnce } from "./shown-once";

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
 * made once per attempt and kept through Back and retries, so a repeat cannot apply twice where the
 * engine takes one.
 */
export function ActionDialog({ action, label, fields, operate, signInWithKey, quiet = false, danger = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, formAction, pending] = useActionState(operate, { step: "fill" });
  const [ref, setRef] = useState(() => newRef(action));

  useEffect(() => {
    if (state.step === "done" && state.ok) toast(state.title);
  }, [state]);

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
      <dialog ref={dialog} className="act-dialog" aria-labelledby={titleId} onClose={() => setRef(newRef(action))}>
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
            <Fields fields={fields} values={values} error={state.error} />
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
          <form action={formAction} className="act-form">
            {state.ok ? (
              <>
                <p className="pill" data-state="ok">
                  <i className="glyph" />
                  {state.title}
                </p>
                <ReviewLines lines={state.lines} />
                {state.secret ? <ShownOnce secret={state.secret} signInWithKey={signInWithKey} /> : null}
              </>
            ) : (
              <div className="problem" role="alert">
                <strong>{state.title}</strong>
                <span>{state.message}</span>
              </div>
            )}
            <ExchangePanel call={state.exchange} open={!state.ok} />
            {Object.entries(state.values).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <div className="act-buttons">
              {state.ok ? (
                <button type="submit" name="intent" value="again" className="btn" onClick={() => setRef(newRef(action))}>
                  Do another
                </button>
              ) : (
                <button type="submit" name="intent" value="back" className="btn">
                  Try again (same reference)
                </button>
              )}
              <button type="button" className="btn primary" onClick={close}>
                Done
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
