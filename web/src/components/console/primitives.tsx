/** The console's building blocks, from the accepted mock: page heads, sections, tiles, rings, bars. */
import Link from "next/link";
import type { ReactNode } from "react";

import { gap, type GapId } from "@/domain/gaps";
import { describeProblem, type Reading, type SourceName } from "@/domain/reading";
import type { Breakdown } from "@/domain/views";
import { approximate, share } from "@/utils/decimal";

import { Icon, type IconName } from "./icons";
import { Amount, Ago } from "./values";
import { vars } from "./vars";

const SOURCE_TITLES: Record<SourceName, string> = { engine: "Engine", batteries: "Batteries", signer: "Signer", discovery: "Discovery" };

export function PageHead({
  icon,
  eyebrow,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <header className="page-head">
      <p className="eyebrow">
        <Icon name={icon} />
        <span>{eyebrow}</span>
      </p>
      <h1>{title}</h1>
      <p className="lede">{children}</p>
    </header>
  );
}

/** A titled section; `reveal` fades it in as it scrolls into view where the browser supports that. */
export function Section({
  id,
  title,
  description,
  end,
  reveal = false,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly end?: ReactNode;
  readonly reveal?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className={reveal ? "section reveal" : "section"} aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
        {end ? <span className="end">{end}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** A grid of cards that wrap at `min` (a CSS length) and stagger in. */
export function Grid({ min, stagger = true, start = false, children }: { readonly min: string; readonly stagger?: boolean; readonly start?: boolean; readonly children: ReactNode }) {
  return (
    <div className={["grid", stagger ? "stagger" : "", start ? "grid-start" : ""].filter(Boolean).join(" ")} style={vars({ min })}>
      {children}
    </div>
  );
}

export function Tile({
  label,
  children,
  sub,
  lift = false,
  metric = false,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly sub?: ReactNode;
  readonly lift?: boolean;
  readonly metric?: boolean;
}) {
  return (
    <div className={["tile", lift ? "lift" : "", metric ? "metric" : ""].filter(Boolean).join(" ")}>
      <span className="k">{label}</span>
      <span className="v">{children}</span>
      {sub ? <span className="s">{sub}</span> : null}
    </div>
  );
}

/**
 * A ring gauge: `fraction` fills the outer ring; `inner` (optional) fills a second, inner ring.
 * The label in the middle is decorative; `description` is what assistive tech reads.
 */
export function Ring({
  fraction,
  inner,
  size = 76,
  stroke = 7,
  label,
  sub,
  tone,
  description,
}: {
  readonly fraction: number;
  readonly inner?: number;
  readonly size?: number;
  readonly stroke?: number;
  readonly label: string;
  readonly sub: string;
  readonly tone?: "ok" | "warn";
  readonly description: string;
}) {
  const radius = 50 - stroke / 2 - 1;
  const innerRadius = radius - stroke - 2;
  const pct = (value: number) => Math.max(0, Math.min(100, value * 100)).toFixed(2);
  return (
    <div className="gauge" style={vars({ size: `${size}px` })} role="img" aria-label={description}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="track" cx="50" cy="50" r={radius} strokeWidth={stroke} />
        {inner !== undefined ? <circle className="track" cx="50" cy="50" r={innerRadius} strokeWidth={stroke - 2} /> : null}
        <circle className={tone ? `val ${tone}` : "val"} cx="50" cy="50" r={radius} pathLength={100} strokeWidth={stroke} style={vars({ target: pct(fraction) })} />
        {inner !== undefined ? (
          <circle className="val alt" cx="50" cy="50" r={innerRadius} pathLength={100} strokeWidth={stroke - 2} style={vars({ target: pct(inner) })} />
        ) : null}
      </svg>
      <span className="lbl" aria-hidden="true">
        <b>{label}</b>
        <small>{sub}</small>
      </span>
    </div>
  );
}

/** Ranked fee bars: one row per key, the bar scaled to the largest, the share of the total in words. */
export function Bars({ rows, total, mono = false, emptyText }: { readonly rows: readonly Breakdown[]; readonly total: string; readonly mono?: boolean; readonly emptyText: string }) {
  if (rows.length === 0) return <p className="empty-state">{emptyText}</p>;
  const max = Math.max(...rows.map((row) => approximate(row.feeUsd)), 1e-18);
  return (
    <ul className="bars" role="list">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="row">
            <span className={mono ? "mono" : undefined} title={row.key}>
              {row.label}
            </span>
            <span className="meta">
              <Amount value={row.feeUsd} head={6} /> · {row.events.toLocaleString("en-US")} tickets · {(share(row.feeUsd, total) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bar" aria-hidden="true">
            <i style={vars({ p: ((approximate(row.feeUsd) / max) * 100).toFixed(2) })} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A small area sparkline (decorative: the number next to it is the content). */
export function Spark({ values, max, height = 36 }: { readonly values: readonly number[]; readonly max?: number; readonly height?: number }) {
  if (values.length < 2) return null;
  const width = 160;
  const top = max ?? Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - 3 - (value / top) * (height - 8)] as const);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const [lastX, lastY] = points[points.length - 1] as readonly [number, number];
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" height={height} width="100%">
      <path d={`${line}L${width} ${height}L0 ${height}Z`} fill="url(#g-area)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.6" fill="var(--accent)" />
    </svg>
  );
}

/** A known gap, cited next to the data it limits; opens it on Sources & gaps. */
export function GapChip({ id }: { readonly id: GapId }) {
  const item = gap(id);
  return (
    <Link className="gapchip" href={`/sources#${id.toLowerCase()}`} data-tip={`${item.title}. ${item.impact}`} aria-label={`Known gap ${id}: ${item.title}`}>
      {id}
    </Link>
  );
}

/** A failed reading, named by source and problem. Renders nothing for a successful one. */
export function Unreadable({ reading, what }: { readonly reading: Reading<unknown>; readonly what: string }) {
  if (reading.ok) return null;
  return (
    <p className="problem" role="status">
      <strong>
        {what} could not be read from {SOURCE_TITLES[reading.source]}
      </strong>
      <span>{describeProblem(reading.problem)}</span>
    </p>
  );
}

export function ReadFrom({ reading }: { readonly reading: Reading<unknown> }) {
  return (
    <p className="provenance">
      From {SOURCE_TITLES[reading.source]}, read <Ago iso={reading.readAt} />
    </p>
  );
}

export function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}

/** A Batteries list stopped at the row cap (gap G6): say the totals are partial. */
export function Truncated({ truncated }: { readonly truncated: boolean }) {
  if (!truncated) return null;
  return (
    <p className="note" role="status">
      <Icon name="gap" />
      <span>
        A Batteries list reached the console&apos;s row cap before its last page, so totals here cover only the rows read. <GapChip id="G6" />
      </span>
    </p>
  );
}

/** The shimmer placeholder while a page's reads are in flight. */
export function PageSkeleton({ tiles = 4 }: { readonly tiles?: number }) {
  return (
    <div className="view-body" aria-busy="true" role="status" aria-label="Loading">
      <Grid min="12rem" stagger={false}>
        {Array.from({ length: tiles }, (_, index) => (
          <div key={index} className="skel skel-tile" />
        ))}
      </Grid>
      <div className="skel skel-panel" />
    </div>
  );
}
