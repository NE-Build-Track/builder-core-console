import "server-only";

import type { ErrorHistory, ErrorSample } from "@/ports/sources";

/**
 * The signer's error totals this console process has read, in memory only (decision D22): the readings
 * inside the window, plus the last one before it as the baseline. A console restart starts it empty.
 */
export function errorHistory(windowMs: number, maxSamples = 1000): ErrorHistory {
  let samples: ErrorSample[] = [];
  return {
    record(sample) {
      samples.push(sample);
      const cutoff = sample.atMs - windowMs;
      const inside = samples.findIndex((kept) => kept.atMs >= cutoff);
      samples = samples.slice(Math.max(0, inside - 1)).slice(-maxSamples);
      return [...samples];
    },
  };
}
