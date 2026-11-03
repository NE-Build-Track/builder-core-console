import { describe, expect, it } from "vitest";

import { errorHistory } from "./error-history";

const minute = 60_000;

describe("signer error history", () => {
  it("returns the readings inside the window, after the last one before it, oldest first", () => {
    const history = errorHistory(60 * minute);
    history.record({ atMs: 0, total: 0 });
    history.record({ atMs: 10 * minute, total: 1 });
    history.record({ atMs: 40 * minute, total: 1 });
    expect(history.record({ atMs: 80 * minute, total: 2 })).toEqual([
      { atMs: 10 * minute, total: 1 },
      { atMs: 40 * minute, total: 1 },
      { atMs: 80 * minute, total: 2 },
    ]);
  });

  it("keeps at most a bounded number of readings, dropping the oldest", () => {
    const history = errorHistory(60 * minute, 3);
    for (const atMs of [1, 2, 3, 4]) history.record({ atMs, total: 0 });
    expect(history.record({ atMs: 5, total: 0 }).map((sample) => sample.atMs)).toEqual([3, 4, 5]);
  });
});
