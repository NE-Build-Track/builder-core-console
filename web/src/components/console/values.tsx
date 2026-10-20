/**
 * Small value renderers. Each wraps a value in the element that carries its meaning:
 * amounts in <data>, instants in <time>, identifiers in <code>, statuses as a word and a glyph shape.
 */
import type { ReactNode } from "react";

import type { State } from "@/domain/views";
import { fromUnits, roundForDisplay, toUnits } from "@/utils/decimal";
import { formatInstant, isoFromMillis } from "@/utils/time";

import { RelativeTime } from "./relative-time";

export const STATE_WORDS: Record<State, string> = { ok: "OK", warn: "Warning", bad: "Failing", unknown: "Unknown" };

/** A status: a glyph whose shape differs by state (circle, triangle, diamond, ring) and a word. */
export function Pill({ state, children, live = false, quiet = false }: { readonly state: State; readonly children?: ReactNode; readonly live?: boolean; readonly quiet?: boolean }) {
  return (
    <span className={quiet ? "pill quiet" : "pill"} data-state={state}>
      <i className={live ? "glyph live" : "glyph"} />
      {children ?? STATE_WORDS[state]}
    </span>
  );
}

export function Glyph({ state, live = false }: { readonly state: State; readonly live?: boolean }) {
  return <i className={live ? "glyph live" : "glyph"} data-state={state} />;
}

/**
 * An exact amount: the significant head bright, the remaining digits dim, the full value in `value`.
 * `head` is how many fractional digits stay bright. Currency USD prints a leading "$".
 */
export function Amount({ value, currency = "USD", head = 4 }: { readonly value: string | null | undefined; readonly currency?: string; readonly head?: number }) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  const units = toUnits(value);
  if (units === null) return <span className="amt">{value}</span>;
  const exact = fromUnits(units < 0n ? -units : units);
  const [whole = "0", fraction = ""] = exact.split(".");
  const sign = units < 0n ? "−" : "";
  const unit = currency.toUpperCase();
  const prefix = unit === "USD" ? "$" : "";
  const suffix = unit === "USD" ? "" : ` ${unit}`;
  const bright = fraction.slice(0, head).padEnd(Math.min(head, 2), "0");
  const dim = fraction.slice(head);
  return (
    <data className="amt" value={value} title={`${value}${unit === "USD" ? " USD" : suffix}`}>
      {sign}
      {prefix}
      {BigInt(whole).toLocaleString("en-US")}
      {bright ? `.${bright}` : ""}
      {dim ? <span className="tail">{dim}</span> : null}
      {suffix}
    </data>
  );
}

/** A rounded amount for tiles and headlines: "$1.00", "$0.0450". The exact value stays in `value`. */
export function Usd({ value, places = 2 }: { readonly value: string | null | undefined; readonly places?: number }) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  const shown = roundForDisplay(value, places);
  return (
    <data value={value} title={`${value} USD`} data-num="">
      {shown.startsWith("-") ? `−$${shown.slice(1)}` : `$${shown}`}
    </data>
  );
}

export function Instant({ iso }: { readonly iso: string | null | undefined }) {
  if (!iso) return <span className="muted">never</span>;
  return <time dateTime={iso}>{formatInstant(iso)}</time>;
}

/** "31 s ago", kept current in the browser; the absolute time is in `dateTime` and the hover title. */
export function Ago({ iso }: { readonly iso: string | null | undefined }) {
  if (!iso) return <span className="muted">never</span>;
  return <RelativeTime iso={iso} />;
}

export function AgoMs({ ms }: { readonly ms: number | null | undefined }) {
  return <Ago iso={ms === null || ms === undefined ? null : isoFromMillis(ms)} />;
}

export function Id({ value, short = false }: { readonly value: string; readonly short?: boolean }) {
  const shown = short && value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  return (
    <code className="id" title={short ? value : undefined} translate="no">
      {shown}
    </code>
  );
}

export function Count({ value }: { readonly value: number }) {
  return (
    <data value={value} data-num="">
      {value.toLocaleString("en-US")}
    </data>
  );
}
