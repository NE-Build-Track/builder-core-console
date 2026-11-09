import { describe, expect, it } from "vitest";

import { capabilityInput, capabilityInputIssues } from "./capability-input";
import type { CapabilityProfile } from "./engine";

const image: CapabilityProfile = {
  id: "flux-image", app: "image", model: "exact-image-model", method: "POST",
  deployment_revision: "sha256:" + "a".repeat(64), path: "/v1/images/generations",
  content_type: "application/json", input_schema: { type: "object" },
  defaults: { model: "exact-image-model", seed: 0, enabled: false, settings: { steps: 4 } },
  schema_digest: "sha256:" + "b".repeat(64),
};

describe("capability request initialization", () => {
  it.each([
    ["flux", "prompt", "A red teapot", { type: "string", minLength: 1 }],
    ["music", "prompt", "Acoustic guitar", { type: "string", minLength: 1 }],
    ["birefnet", "image", "data:image/png;base64,aW1hZ2U=", { type: "string", pattern: "^data:image/[^,]+;base64," }],
    ["triposr", "image", "data:image/png;base64,aW1hZ2U=", { type: "string", pattern: "^data:image/[^,]+;base64," }],
    ["whisper", "file", "data:audio/wav;base64,YXVkaW8=", { type: "string", pattern: "^data:audio/[^,]+;base64," }],
  ])("shows and validates required input for %s", (name, field, valid, fieldSchema) => {
    const profile: CapabilityProfile = { ...image, app: String(name), schema_digest: `test-${String(name)}`, defaults: { model: image.model }, input_schema: { type: "object", properties: { model: { const: image.model }, [String(field)]: fieldSchema }, required: ["model", field], additionalProperties: false } };
    const selected = capabilityInput(String(name), [profile])!;
    expect(selected.input[String(field)]).toBe("");
    expect(capabilityInputIssues(profile, selected.input).length).toBeGreaterThan(0);
    expect(capabilityInputIssues(profile, { ...selected.input, [String(field)]: valid })).toEqual([]);
    expect(capabilityInputIssues(profile, { ...selected.input, [String(field)]: valid, unknown: true }).length).toBeGreaterThan(0);
  });
  it("loads the selected path and false/zero defaults without fabricating prompt or media", () => {
    const selected = capabilityInput("image", [image]);
    expect(selected?.path).toBe("/v1/images/generations");
    expect(selected?.input).toEqual(image.defaults);
    expect(selected?.stream).toBe(false);
    expect(selected?.input).not.toHaveProperty("prompt");
  });

  it("replaces previous model inputs when another operation is selected", () => {
    const transcript: CapabilityProfile = { ...image, id: "whisper", app: "audio", model: "transcriber",
      path: "/v1/audio/transcriptions", defaults: { model: "transcriber", language: "" } };
    const first = capabilityInput("image", [image, transcript]);
    if (first) first.input.prompt = "private previous prompt";
    expect(capabilityInput("audio", [image, transcript])?.input).toEqual(transcript.defaults);
    expect(capabilityInput("image", [image])?.input).not.toHaveProperty("prompt");
    expect(capabilityInput("unknown", [image])).toBeNull();
  });
});
