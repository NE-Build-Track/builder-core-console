import { describe, expect, it } from "vitest";

import { allocation, apiKey, broken, fakeSources, grant, ledger, read } from "../../tests/support/fixtures";

import { grantViews, money } from "./money";

describe("money", () => {
  it("rolls allocations and keys up under their grant, from the live sample", () => {
    const [view] = grantViews([grant], [allocation], [apiKey], ledger);
    expect(view).toMatchObject({
      total: "2",
      allocated: "2",
      spent: "0.044953749066932028",
      unallocated: "0",
    });
    expect(view?.allocations[0]).toMatchObject({ available: "1.955046250933067972", keys: [apiKey] });
  });

  it("estimates runway from the last 7 days of spend", async () => {
    const view = await money(fakeSources());
    // One ticket of 0.000111360982738132 USD in the last week against 1.955046250933067972 available.
    expect(view.grants.ok && view.grants.value[0]?.allocations[0]?.runwayDays).toBe(122_892);
    expect(view.ledgerSum).toBe("0");
  });

  it("totals by currency", async () => {
    const view = await money(fakeSources());
    expect(view.totals).toEqual([{ currency: "USD", granted: "2", allocated: "2", spent: "0.044953749066932028", available: "1.955046250933067972" }]);
    expect(view.orphanAllocations).toEqual([]);
    expect(view.truncated).toBe(false);
  });

  it("surfaces an allocation whose grant is not listed", async () => {
    const stray = { ...allocation, id: "stray", grant_id: "missing" };
    const view = await money(fakeSources({ batteries: { allocations: async () => read("batteries", { items: [allocation, stray], truncated: false }) } }));
    expect(view.orphanAllocations.map((row) => row.allocation.id)).toEqual(["stray"]);
  });

  it("keeps the page when the ledger cannot be read", async () => {
    const view = await money(fakeSources({ batteries: { ledger: async () => broken("batteries", { kind: "http", status: 403, detail: "Forbidden" }) } }));
    expect(view.grants.ok).toBe(true);
    expect(view.ledger.ok).toBe(false);
    expect(view.grants.ok && view.grants.value[0]?.unallocated).toBeNull();
  });
});
