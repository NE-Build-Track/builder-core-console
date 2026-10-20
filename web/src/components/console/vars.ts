import type { CSSProperties } from "react";

/**
 * The only way markup sets style: CSS custom properties that carry data into the stylesheet
 * (`--p` for a bar's length, `--target` for a ring's fill, `--min` for a grid's column width).
 * tests/structure/taste.test.ts allows `style={vars(…)}` and nothing else.
 */
export function vars(values: Readonly<Record<string, string | number>>): CSSProperties {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [`--${name}`, value])) as CSSProperties;
}
