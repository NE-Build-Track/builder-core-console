/**
 * Form input parsed at the boundary: a server action turns FormData into these values or a message the
 * form shows next to the field. Nothing past this point sees raw strings.
 */
import { toUnits } from "@/utils/decimal";

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly field: string; readonly message: string };

export const parsed = <T>(value: T): Parsed<T> => ({ ok: true, value });
export const invalid = <T>(field: string, message: string): Parsed<T> => ({ ok: false, field, message });

export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** A positive USD amount with at most 18 decimals, kept as the exact string the user typed. */
export function usd(form: FormData, name: string, label = "Amount"): Parsed<string> {
  const raw = text(form, name);
  if (!/^\d+(\.\d{1,18})?$/.test(raw)) return invalid(name, `${label} must be a number of dollars, like 5 or 0.25.`);
  const units = toUnits(raw);
  if (units === null || units <= 0n) return invalid(name, `${label} must be more than $0.`);
  return parsed(raw);
}

/** An identifier the engine accepts in a path: actors, applications, grants, keys. */
export function ident(form: FormData, name: string, label: string): Parsed<string> {
  const raw = text(form, name);
  if (!raw) return invalid(name, `${label} is required.`);
  if (!/^[A-Za-z0-9._:@-]{1,128}$/.test(raw)) return invalid(name, `${label} may use letters, digits and . _ : @ - (at most 128).`);
  return parsed(raw);
}

export function optionalLabel(form: FormData, name: string): string {
  return text(form, name).slice(0, 120);
}

/** An operation reference made when the form rendered, kept through review and retry (D17). */
export function operationRef(form: FormData): Parsed<string> {
  const raw = text(form, "operation_ref");
  return /^[A-Za-z0-9._:-]{8,200}$/.test(raw) ? parsed(raw) : invalid("operation_ref", "The form lost its operation reference; reload the page.");
}

export function oneOf<const T extends string>(form: FormData, name: string, choices: readonly T[], label: string): Parsed<T> {
  const raw = text(form, name);
  return (choices as readonly string[]).includes(raw) ? parsed(raw as T) : invalid(name, `Choose a ${label}.`);
}

/** A JSON object typed into a textarea. */
export function jsonObject(raw: string, name: string): Parsed<Record<string, unknown>> {
  if (!raw.trim()) return parsed({});
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid(name, "The input must be a JSON object, like {}.");
    return parsed(value as Record<string, unknown>);
  } catch (error) {
    return invalid(name, `The input is not valid JSON: ${error instanceof Error ? error.message : "parse error"}.`);
  }
}

export function wholeNumber(raw: string, name: string, label: string, min: number, max: number): Parsed<number> {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return invalid(name, `${label} must be a whole number from ${min} to ${max}.`);
  return parsed(value);
}
