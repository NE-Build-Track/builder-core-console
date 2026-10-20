/** Time helpers. Every instant crosses layers as an ISO-8601 string in UTC. */

export function isoFromMillis(ms: number): string {
  return new Date(ms).toISOString();
}

/** Seconds from `then` to `now`, or null when `then` is not a valid instant. */
export function ageSeconds(then: string | null, now: Date): number | null {
  if (!then) return null;
  const at = Date.parse(then);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((now.getTime() - at) / 1000));
}

/** "4 s", "12 min", "3 h", "2 d": a compact age for status lines. */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} d`;
}

/** The UTC calendar day of an instant, as YYYY-MM-DD. */
export function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

/** A human date and time in UTC, stable across server and client renders. */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export const WINDOWS = {
  "24h": 86_400,
  "7d": 7 * 86_400,
  "30d": 30 * 86_400,
} as const;

export type WindowName = keyof typeof WINDOWS;

export function isWindowName(value: unknown): value is WindowName {
  return typeof value === "string" && Object.hasOwn(WINDOWS, value);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * The [start, end) bounds of a named window ending at `now`. "24h" is rolling; "7d" and "30d" are whole
 * UTC calendar days ending today, so a chart's last day is today, not a slice that started yesterday.
 */
export function windowBounds(name: WindowName, now: Date): { readonly start: string; readonly end: string } {
  const end = now.toISOString();
  if (name === "24h") return { start: new Date(now.getTime() - WINDOWS[name] * 1000).toISOString(), end };
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = WINDOWS[name] / 86_400;
  return { start: new Date(today - (days - 1) * DAY_MS).toISOString(), end };
}

/** The chart slots for a window: 24 hours, or one per calendar day. */
export function slotsOf(name: WindowName): { readonly size: number; readonly count: number; readonly by: "hour" | "day" } {
  return name === "24h" ? { size: HOUR_MS, count: 24, by: "hour" } : { size: DAY_MS, count: WINDOWS[name] / 86_400, by: "day" };
}
