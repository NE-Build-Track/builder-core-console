import { describe, expect, it, vi } from "vitest";

import { broken, fakeSources, job } from "../../tests/support/fixtures";

import { isJobId, jobs, manifestsOf } from "./jobs";

describe("jobs", () => {
  it("recognises job ids", () => {
    expect(isJobId(job.id)).toBe(true);
    expect(isJobId(` ${job.id} `)).toBe(true);
    expect(isJobId("e7621a15")).toBe(false);
  });

  it("lists each manifest a job was signed under once", () => {
    const twice = { ...job, attempts: [...job.attempts, { ...job.attempts[0]!, number: 2 }] };
    expect(manifestsOf(twice)).toEqual(["e7621a15"]);
  });

  it("looks a job up with its cost and the Batteries events of its sessions", async () => {
    const view = await jobs(fakeSources(), job.id);
    expect(view.invalidId).toBe(false);
    expect(view.lookup?.job.ok).toBe(true);
    expect(view.lookup?.cost?.ok).toBe(true);
    expect(view.lookup?.providerEvents?.ok && view.lookup.providerEvents.value.map((event) => event.manifest_id)).toEqual(["e7621a15"]);
  });

  it("does not call the engine for something that is not a job id", async () => {
    const lookup = vi.fn();
    const view = await jobs(fakeSources({ engine: { job: lookup } }), "not-a-job");
    expect(view).toMatchObject({ invalidId: true, lookup: null });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("skips cost and provider reads when the job cannot be read", async () => {
    const view = await jobs(fakeSources({ engine: { job: async () => broken("engine", { kind: "http", status: 404, detail: "no such job" }) } }), job.id);
    expect(view.lookup).toMatchObject({ cost: null, providerEvents: null });
  });
});
