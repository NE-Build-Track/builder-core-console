"use client";

import { useEffect, useState } from "react";

import { formatAge } from "@/utils/time";

function relative(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return seconds < 5 ? "just now" : `${formatAge(seconds)} ago`;
}

/** A relative time that stays current. The server renders it once; the browser ticks it every second. */
export function RelativeTime({ iso }: { readonly iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()} suppressHydrationWarning>
      {relative(iso, now)}
    </time>
  );
}
