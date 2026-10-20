import { describe, expect, it } from "vitest";

import { compareDecimals, fromUnits, roundForDisplay, share, sumDecimals, toUnits, weiToEth } from "./decimal";

describe("decimal", () => {
  it("round-trips 18 fractional digits exactly", () => {
    const text = "1.955046250933067972";
    expect(fromUnits(toUnits(text) ?? 0n)).toBe(text);
  });

  it("rejects anything that is not a plain decimal", () => {
    for (const text of ["", "1e3", "1.2.3", "abc", "0.1234567890123456789"]) {
      expect(toUnits(text)).toBeNull();
    }
  });

  it("sums ticket fees without float drift and counts what it skipped", () => {
    const fees = Array.from({ length: 1000 }, () => "0.000111360982738132");
    expect(sumDecimals([...fees, "oops"])).toEqual({ total: "0.111360982738132", skipped: 1 });
  });

  it("matches a Batteries allocation: available + spent = allocated", () => {
    expect(sumDecimals(["1.955046250933067972", "0.044953749066932028"]).total).toBe("2");
  });

  it("keeps small amounts visible when rounding for display", () => {
    expect(roundForDisplay("0.044953749066932028")).toBe("0.0450");
    expect(roundForDisplay("0.000111360982738132")).toBe("0.00011");
    expect(roundForDisplay("2", 2)).toBe("2.00");
    expect(roundForDisplay("-1.005", 2)).toBe("-1.01");
    expect(roundForDisplay("0")).toBe("0");
  });

  it("computes a bounded share for meters", () => {
    expect(share("0.5", "2")).toBe(0.25);
    expect(share("3", "2")).toBe(1);
    expect(share("1", "0")).toBe(0);
  });

  it("orders decimals numerically", () => {
    expect(["10", "9.5", "0.01"].sort(compareDecimals)).toEqual(["0.01", "9.5", "10"]);
  });
});

describe("weiToEth", () => {
  it("converts wei exactly", () => {
    expect(weiToEth("1500000000000000000")).toBe("1.5");
    expect(weiToEth("46344668080")).toBe("0.00000004634466808");
    expect(weiToEth("n/a")).toBe("n/a");
  });
});
