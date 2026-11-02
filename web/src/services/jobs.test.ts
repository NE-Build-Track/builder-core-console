import { describe, expect, it, vi } from "vitest";

import { broken, fakeSources, job, read } from "../../tests/support/fixtures";

import { isJobId, JOB_PAGE, jobs, manifestsOf } from "./jobs";

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

  it("lists the application's jobs from the engine, newest first, with who ran each (gap G1)", async () => {
    const list = vi.fn(async () => read("engine", [job]));
    const view = await jobs(fakeSources({ engine: { jobs: list } }), null);
    expect(list).toHaveBeenCalledWith({ limit: JOB_PAGE });
    expect(view.list.rows.ok && view.list.rows.value.map((row) => [row.id, row.actorId, row.app, row.state])).toEqual([[job.id, job.actor_id, job.app, job.state]]);
    expect(view.list.older).toBeNull();
  });

  it("offers the next older page from the oldest job on a full page, and pages with before", async () => {
    const page = Array.from({ length: JOB_PAGE }, (_, index) => ({ ...job, id: `${index}`.padStart(8, "0") + job.id.slice(8), created_at: new Date(Date.UTC(2026, 10, 2, 12, 0, JOB_PAGE - index)).toISOString() }));
    const list = vi.fn(async () => read("engine", page));
    const view = await jobs(fakeSources({ engine: { jobs: list } }), null, "2026-11-02T13:00:00Z");
    expect(list).toHaveBeenCalledWith({ limit: JOB_PAGE, before: "2026-11-02T13:00:00Z" });
    expect(view.list.before).toBe("2026-11-02T13:00:00Z");
    expect(view.list.older).toBe(page.at(-1)!.created_at);
  });

  it("does not ask the engine for a page before a time with no offset, which it refuses (builder-core D59)", async () => {
    const list = vi.fn(async () => read("engine", [job]));
    const view = await jobs(fakeSources({ engine: { jobs: list } }), null, "2026-11-02T13:00:00");
    expect(view.list.invalidBefore).toBe(true);
    expect(list).toHaveBeenCalledWith({ limit: JOB_PAGE });
  });

  it("skips cost and provider reads when the job cannot be read", async () => {
    const view = await jobs(fakeSources({ engine: { job: async () => broken("engine", { kind: "http", status: 404, detail: "no such job" }) } }), job.id);
    expect(view.lookup).toMatchObject({ cost: null, providerEvents: null });
  });
});
