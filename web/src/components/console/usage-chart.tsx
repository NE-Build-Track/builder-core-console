"use client";

import { useRef, useState } from "react";

import type { Bucket } from "@/domain/views";
import { approximate } from "@/utils/decimal";

import { vars } from "./vars";

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const n = value / power;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power;
}

/** Labels in UTC, so the server and every browser print the same thing. */
function label(iso: string, by: "hour" | "day", long = false): string {
  const at = new Date(iso);
  return by === "hour"
    ? at.toLocaleString("en-US", { timeZone: "UTC", ...(long ? { weekday: "short" } : {}), hour: "2-digit", minute: "2-digit", hour12: false })
    : at.toLocaleDateString("en-US", { timeZone: "UTC", ...(long ? { weekday: "short" } : {}), month: "short", day: "numeric" });
}

function tick(value: number): string {
  return value === 0 ? "$0" : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(3)}`;
}

/**
 * Paid per hour or day: an area chart with a crosshair that follows the pointer, and the arrow keys when
 * focused. The exact numbers are in the table under it ("Show the numbers"); this is the picture.
 */
export function UsageChart({ buckets, by, windowLabel }: { readonly buckets: readonly Bucket[]; readonly by: "hour" | "day"; readonly windowLabel: string }) {
  const plot = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const values = buckets.map((bucket) => approximate(bucket.feeUsd));
  const top = niceMax(Math.max(...values, 0) * 1.08);
  const n = values.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (value: number) => 100 - (value / top) * 100;
  const line = `M${values.map((value, i) => `${x(i).toFixed(3)} ${y(value).toFixed(3)}`).join("L")}`;
  const ticks = [0, 0.5, 1];
  const marks = n <= 7 ? buckets.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  const peak = Math.max(...values, 0);
  const shown = index === null ? null : buckets[index];
  const shownValue = index === null ? 0 : (values[index] ?? 0);

  function show(i: number): void {
    setIndex(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div className={index === null ? "chart" : "chart hovering"}>
      <div className="yaxis" aria-hidden="true">
        {ticks.map((fraction) => (
          <span key={fraction} style={vars({ top: `${100 - fraction * 100}%` })} className="ytick">
            {tick(top * fraction)}
          </span>
        ))}
      </div>
      <div
        ref={plot}
        className="plot"
        tabIndex={0}
        role="img"
        aria-label={`Paid to the network per ${by}, ${windowLabel}. Peak $${peak.toFixed(6)}. Use the left and right arrow keys to read each ${by}.`}
        onPointerMove={(event) => {
          const box = plot.current?.getBoundingClientRect();
          if (box) show(Math.round(((event.clientX - box.left) / box.width) * (n - 1)));
        }}
        onPointerLeave={() => setIndex(null)}
        onFocus={() => show(index ?? n - 1)}
        onBlur={() => setIndex(null)}
        onKeyDown={(event) => {
          const current = index ?? n - 1;
          if (event.key === "ArrowLeft") show(current - 1);
          else if (event.key === "ArrowRight") show(current + 1);
          else if (event.key === "Home") show(0);
          else if (event.key === "End") show(n - 1);
          else return;
          event.preventDefault();
        }}
      >
        {ticks.map((fraction) => (
          <div key={fraction} className={fraction === 0 ? "grid-line base" : "grid-line"} style={vars({ top: `${100 - fraction * 100}%` })} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="area" d={`${line}L100 100L0 100Z`} />
          <path className="line" d={line} />
        </svg>
        <span className="dot enddot" style={vars({ x: `${x(n - 1)}%`, y: `${y(values[n - 1] ?? 0)}%` })} />
        <span className="cross" style={vars({ x: `${x(index ?? 0)}%` })} />
        <span className="dot h" style={vars({ x: `${x(index ?? 0)}%`, y: `${y(shownValue)}%` })} />
        <span className="ctip" style={vars({ x: `${Math.min(88, Math.max(12, x(index ?? 0)))}%`, y: `${y(shownValue)}%` })}>
          {shown ? (
            <>
              {label(shown.start, by, true)}
              <b>${shown.feeUsd}</b>
              {shown.events.toLocaleString("en-US")} tickets
            </>
          ) : null}
        </span>
      </div>
      <div className="xaxis" aria-hidden="true">
        {marks.map((i) => (
          <span key={i} style={vars({ x: `${x(i)}%` })}>
            {buckets[i] ? label(buckets[i].start, by) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
