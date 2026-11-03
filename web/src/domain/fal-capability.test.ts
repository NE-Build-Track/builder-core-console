import { describe, expect, it } from "vitest";

import contracts from "../config/fal-request-contracts.json";
import { capabilityInput, capabilityInputIssues } from "./capability-input";
import type { Runner } from "./engine";
import { falRequestProfile, parseFalRequestProfile } from "./fal-capability";

function runner(app: string, endpoint: string, hash: string): Runner {
  return { app, url: "https://orch.example/apps/runner/app", orchestrator_url: "https://orch.example", mode: "single-shot", capacity: 1, capacity_available: 1, rate: null, runner_id: "runner", metadata: JSON.stringify({ provider: "fal", endpoint_id: endpoint, schema_sha256: hash, transport: "queue", schema_url: "http://untrusted.invalid/schema" }) };
}

describe("FAL native request profiles", () => {
  it("restores the registered root path and provider fields without a fabricated model parameter", () => {
    const contract = contracts.find(item => item.app === "fal-flux-schnell")!;
    const profile = falRequestProfile(contract.app, contracts, [runner(contract.app, contract.endpoint_id, contract.contract_hash)])!;
    expect(profile.path).toBe("/");
    expect(profile.method).toBe("POST");
    expect(profile.input_schema).toHaveProperty("properties.prompt");
    const selected = capabilityInput(profile.app, [profile])!;
    expect(selected.input.prompt).toBe("");
    expect(selected.input).not.toHaveProperty("model");
    expect(capabilityInputIssues(profile, selected.input)).toContain("prompt: fill this required field");
    expect(capabilityInputIssues(profile, { ...selected.input, prompt: "A red teapot" })).toEqual([]);
    expect(parseFalRequestProfile(profile)).toEqual(profile);
  });

  it("rejects a changed hash, endpoint or app and never follows metadata schema URLs", () => {
    const contract = contracts[0]!;
    expect(falRequestProfile(contract.app, contracts, [runner(contract.app, contract.endpoint_id, "0".repeat(64))])).toBeNull();
    expect(falRequestProfile(contract.app, contracts, [runner(contract.app, "other/model", contract.contract_hash)])).toBeNull();
    expect(falRequestProfile("unknown", contracts, [])).toBeNull();
  });

  it("materializes every reviewed FAL input schema with usable required placeholders", () => {
    expect(contracts).toHaveLength(73);
    for (const contract of contracts) {
      const profile = falRequestProfile(contract.app, contracts, [runner(contract.app, contract.endpoint_id, contract.contract_hash)])!;
      const selected = capabilityInput(profile.app, [profile])!;
      const issues = capabilityInputIssues(profile, selected.input);
      expect(issues.join(" "), contract.app).not.toContain("could not be validated");
      expect(JSON.stringify(profile.input_schema), contract.app).not.toContain('"$ref"');
      expect(parseFalRequestProfile(profile), contract.app).not.toBeNull();
    }
  });
});
