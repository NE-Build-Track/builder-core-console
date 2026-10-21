/** The inputs of an Operator action, drawn from the server's description (decision D17). */
import type { FieldSpec, ReviewLine } from "@/domain/operator";

export function Fields({
  idPrefix,
  fields,
  values,
  error,
}: {
  /** Unique per dialog: a page holds many action dialogs with the same field names. */
  readonly idPrefix: string;
  readonly fields: readonly FieldSpec[];
  readonly values?: Readonly<Record<string, string>>;
  readonly error?: { readonly field?: string; readonly message: string };
}) {
  return (
    <div className="act-fields">
      {fields.map((field, index) => {
        if (field.type === "hidden") return <input key={field.name} type="hidden" name={field.name} value={values?.[field.name] ?? field.value} />;
        const id = `${idPrefix}-${field.name}`;
        const value = values?.[field.name] ?? field.value ?? "";
        const wrong = error?.field === field.name;
        // A modal dialog focuses its autofocus element: the first field, or the one that is wrong.
        const focus = error?.field ? wrong : index === fields.findIndex((item) => item.type !== "hidden");
        const describedBy = [field.hint ? `${id}-hint` : null, wrong ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
        return (
          <div key={field.name} className="field">
            <label htmlFor={id}>{field.label}</label>
            {field.type === "select" ? (
              <select id={id} name={field.name} defaultValue={value} autoFocus={focus} aria-invalid={wrong || undefined} aria-describedby={describedBy}>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={field.type === "usd" ? "money-input" : undefined}>
                {field.type === "usd" ? <span aria-hidden="true">$</span> : null}
                <input
                  id={id}
                  name={field.name}
                  defaultValue={value}
                  autoFocus={focus}
                  placeholder={field.placeholder}
                  inputMode={field.type === "usd" ? "decimal" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={wrong || undefined}
                  aria-describedby={describedBy}
                />
              </span>
            )}
            {field.hint ? (
              <span id={`${id}-hint`} className="hint">
                {field.hint}
              </span>
            ) : null}
            {wrong ? (
              <span id={`${id}-error`} className="form-error" role="alert">
                {error?.message}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ReviewLines({ lines }: { readonly lines: readonly ReviewLine[] }) {
  return (
    <dl className="review">
      {lines.map((line) => (
        <div key={line.label}>
          <dt>{line.label}</dt>
          <dd className={line.mono ? "mono" : undefined}>
            {line.before !== undefined && line.after !== undefined ? (
              <>
                <span className="before">{line.before}</span>
                <span aria-label="becomes"> → </span>
                <b>{line.after}</b>
              </>
            ) : (
              line.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
