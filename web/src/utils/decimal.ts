/**
 * Exact decimal arithmetic for money strings (docs/design-docs/core-beliefs.md#money).
 *
 * Batteries and the engine report amounts as decimal strings with up to 18 fractional digits. Floats
 * would lose cents when summing thousands of ticket fees, so amounts are held as bigint units of 1e-18.
 */

export const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);
const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parse a decimal string into 1e-18 units. Returns null for anything that is not a plain decimal. */
export function toUnits(text: string): bigint | null {
  const match = DECIMAL.exec(text.trim());
  if (!match) return null;
  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > SCALE) return null;
  const units = BigInt(whole) * ONE + BigInt(fraction.padEnd(SCALE, "0") || "0");
  return sign ? -units : units;
}

/** Render 1e-18 units as the shortest exact decimal string. */
export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  const whole = magnitude / ONE;
  const fraction = (magnitude % ONE).toString().padStart(SCALE, "0").replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${text}` : text;
}

/** Sum decimal strings exactly. Unparseable values are skipped and counted. */
export function sumDecimals(values: Iterable<string>): { readonly total: string; readonly skipped: number } {
  let total = 0n;
  let skipped = 0;
  for (const value of values) {
    const units = toUnits(value);
    if (units === null) skipped += 1;
    else total += units;
  }
  return { total: fromUnits(total), skipped };
}

/** `part / whole` as a number in [0, 1] for meters. A zero or unparseable whole gives 0. */
export function share(part: string, whole: string): number {
  const p = toUnits(part);
  const w = toUnits(whole);
  if (p === null || w === null || w <= 0n) return 0;
  const ratio = Number((p * 1_000_000n) / w) / 1_000_000;
  return Math.min(1, Math.max(0, ratio));
}

/** Compare two decimal strings; unparseable values sort first. */
export function compareDecimals(left: string, right: string): number {
  const l = toUnits(left);
  const r = toUnits(right);
  if (l === null || r === null) return (l === null ? -1 : 0) - (r === null ? -1 : 0);
  return l < r ? -1 : l > r ? 1 : 0;
}

/**
 * Round a decimal string for display, keeping at least `places` digits and enough significant digits
 * that a small non-zero amount never reads as zero (0.000011 stays 0.000011, not 0.0000).
 */
export function roundForDisplay(text: string, places = 4): string {
  const units = toUnits(text);
  if (units === null) return text;
  if (units === 0n) return "0";
  const magnitude = units < 0n ? -units : units;
  // 1-based position of the first significant fractional digit, when the whole part is zero.
  const firstSignificant = SCALE - magnitude.toString().length + 1;
  const keep = Math.min(SCALE, magnitude >= ONE ? places : Math.max(places, firstSignificant + 1));
  const step = 10n ** BigInt(SCALE - keep);
  const rounded = ((magnitude + step / 2n) / step) * step;
  const [whole = "0", fraction = ""] = fromUnits(rounded).split(".");
  const shown = keep > 0 ? `${whole}.${fraction.padEnd(keep, "0")}` : whole;
  return units < 0n ? `-${shown}` : shown;
}

/** Wei (an integer string) as an exact ETH decimal string. Anything else is returned unchanged. */
export function weiToEth(wei: string): string {
  if (!/^\d+$/.test(wei)) return wei;
  return fromUnits(BigInt(wei));
}

/** `total / count` as an exact decimal string (rounded down at 18 places); "0" for no items. */
export function averageDecimal(total: string, count: number): string {
  const units = toUnits(total);
  if (units === null || count <= 0) return "0";
  return fromUnits(units / BigInt(count));
}

/** How many times `part` fits into `whole` (e.g. days of runway), or null when `part` is zero or unparseable. */
export function times(whole: string, part: string): number | null {
  const w = toUnits(whole);
  const p = toUnits(part);
  if (w === null || p === null || p <= 0n) return null;
  return Number((w * 1000n) / p) / 1000;
}

/** A decimal string as a float, for drawing only (chart heights, ring fills). Never for money math. */
export function approximate(text: string): number {
  const units = toUnits(text);
  return units === null ? 0 : Number(units) / 1e18;
}

/** `left - right`, exactly. Unparseable inputs count as zero. */
export function difference(left: string, right: string): string {
  return fromUnits((toUnits(left) ?? 0n) - (toUnits(right) ?? 0n));
}
