/**
 * The pins in src/domain/pins.ts, deploy/compose.yaml and the engine spec must agree, so the console's
 * types, the images it runs against and the footer it shows all describe the same commits.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PINS, shortCommit } from "@/domain/pins";

import { read, REPO } from "../support/source-files";

// Both stacks build the same components: the default one and the Keycloak test stack.
const STACKS = [path.join("deploy", "compose.yaml"), path.join("deploy", "keycloak", "compose.yaml")];

describe("pins", () => {
  it.each(STACKS)("%s builds every pinned component from its pinned commit", (file) => {
    const compose = read(path.join(REPO, file));
    for (const [name, pin] of Object.entries(PINS)) {
      expect(compose, `${name}: ${file} must build ${pin.repository}@${pin.commit}`).toContain(
        `https://github.com/${pin.repository}.git#${pin.commit}`,
      );
      expect(compose, `${name}: tag the image with the short commit`).toContain(`:${shortCommit(pin.commit)}`);
    }
  });

  it.each(STACKS)("%s builds nothing from an NE-Build-Track fork of a livepeer repository", (file) => {
    const compose = read(path.join(REPO, file));
    for (const fork of ["NE-Build-Track/node", "NE-Build-Track/clearinghouse-batteries", "NE-Build-Track/livepeer-python-gateway"]) {
      expect(compose, `${file} builds the fork ${fork}; build the livepeer/* repository at the same commit`).not.toContain(fork);
    }
  });

  it("documents the same pins in the payment-stack reference", () => {
    const reference = read(path.join(REPO, "docs", "references", "payment-stack.md"));
    for (const pin of Object.values(PINS)) expect(reference).toContain(pin.commit);
  });

  it("records the same pins in the M3 jobs document (ISS-19)", () => {
    const journey = read(path.join(REPO, "docs", "product-specs", "m3-journey.md"));
    for (const [name, pin] of Object.entries(PINS)) expect(journey, `${name}: put ${pin.commit} in m3-journey.md's pinned versions`).toContain(pin.commit);
  });

  it("generates engine types from the spec of the pinned engine", () => {
    const spec = JSON.parse(read(path.join(REPO, "openapi", "engine.openapi.json"))) as { paths: Record<string, unknown> };
    // a89216d is the first commit with `?stream=` on POST /v1/jobs; an older spec would lack it.
    const runJob = spec.paths["/v1/jobs"] as { post?: { parameters?: { name: string }[] } };
    expect(runJob.post?.parameters?.map((parameter) => parameter.name)).toContain("stream");
    // the actor collection and the auditor (builder-core #69) are what the console reads in OIDC mode
    expect(Object.keys(spec.paths)).toContain("/v1/admin/actors");
  });

  it("generates engine types from a spec that requires an operation reference on every repeat-safe command (D57)", () => {
    type Spec = {
      paths: Record<string, { post?: { requestBody?: { required?: boolean; content: Record<string, { schema: { $ref?: string } }> } } }>;
      components: { schemas: Record<string, { required?: string[] }> };
    };
    const spec = JSON.parse(read(path.join(REPO, "openapi", "engine.openapi.json"))) as Spec;
    const allocation = "/v1/admin/applications/{application_id}/actors/{actor_id}/allocation";
    const commands = [allocation, `${allocation}/fund`, `${allocation}/rotate-key`, "/v1/admin/grant/fund", "/v1/admin/grants", "/v1/admin/keys", "/v1/admin/keys/{key_id}/rotate"];
    const lacking = commands.filter((route) => {
      const body = spec.paths[route]?.post?.requestBody;
      const schema = body?.content["application/json"]?.schema.$ref?.split("/").pop() ?? "";
      return !body?.required || !spec.components.schemas[schema]?.required?.includes("operation_ref");
    });
    expect(lacking, "copy the pinned engine's docs/generated/openapi.json to openapi/ and run make gen-api").toEqual([]);
  });
});
