/**
 * The pins in src/domain/pins.ts, deploy/compose.yaml and the engine spec must agree, so the console's
 * types, the images it runs against and the footer it shows all describe the same commits.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PINS, shortCommit } from "@/domain/pins";

import { read, REPO } from "../support/source-files";

const compose = read(path.join(REPO, "deploy", "compose.yaml"));

describe("pins", () => {
  it("builds every pinned component from its pinned commit", () => {
    for (const [name, pin] of Object.entries(PINS)) {
      expect(compose, `${name}: deploy/compose.yaml must build ${pin.repository}@${pin.commit}`).toContain(
        `https://github.com/${pin.repository}.git#${pin.commit}`,
      );
      expect(compose, `${name}: tag the image with the short commit`).toContain(`:${shortCommit(pin.commit)}`);
    }
  });

  it("documents the same pins in the payment-stack reference", () => {
    const reference = read(path.join(REPO, "docs", "references", "payment-stack.md"));
    for (const pin of Object.values(PINS)) expect(reference).toContain(pin.commit);
  });

  it("generates engine types from the spec of the pinned engine", () => {
    const spec = JSON.parse(read(path.join(REPO, "openapi", "engine.openapi.json"))) as { paths: Record<string, unknown> };
    // a89216d is the first commit with `?stream=` on POST /v1/jobs; an older spec would lack it.
    const runJob = spec.paths["/v1/jobs"] as { post?: { parameters?: { name: string }[] } };
    expect(runJob.post?.parameters?.map((parameter) => parameter.name)).toContain("stream");
  });
});
