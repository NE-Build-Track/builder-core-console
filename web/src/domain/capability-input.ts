/** Required fields appear as empty placeholders; validation prevents paying for incomplete input. */
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import type { CapabilityProfile } from "./engine";
import type { FalRequestProfile } from "./fal-capability";

export type CapabilityRequestProfile = CapabilityProfile | FalRequestProfile;

const validator = new Ajv2020({ allErrors: true, strict: false, validateFormats: false, addUsedSchema: false });
const compiled = new Map<string, ValidateFunction>();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function template(schema: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(defaults);
  const properties = record(schema.properties) ?? {};
  for (const key of Array.isArray(schema.required) ? schema.required : []) {
    if (typeof key !== "string" || Object.hasOwn(result, key)) continue;
    const field = record(properties[key]) ?? {};
    result[key] = Object.hasOwn(field, "const") ? structuredClone(field.const) : field.type === "object" ? template(field, {}) : field.type === "array" ? [] : field.type === "string" ? "" : null;
  }
  return result;
}

export function capabilityInputIssues(profile: CapabilityRequestProfile, input: unknown): readonly string[] {
  try {
    const value = record(input);
    const empty = capabilityRequiredFields(profile).filter(key => typeof value?.[key] === "string" && !(value[key] as string).trim());
    if (empty.length) return empty.map(key => `${key}: fill this required field`);
    let check = compiled.get(profile.schema_digest);
    if (!check) {
      if (compiled.size >= 64) { compiled.clear(); validator.removeSchema(); }
      check = validator.compile(profile.input_schema);
      compiled.set(profile.schema_digest, check);
    }
    return check(input) ? [] : (check.errors ?? []).slice(0, 8).map(error => `${error.instancePath || "Input"}: ${error.message ?? "invalid value"}${error.keyword === "required" ? ` (${String(error.params.missingProperty)})` : ""}`);
  } catch {
    return ["The engine's input schema could not be validated. No job was sent."];
  }
}

export function capabilityRequiredFields(profile: CapabilityRequestProfile): readonly string[] {
  const required = profile.input_schema.required;
  return Array.isArray(required) ? required.filter((value): value is string => typeof value === "string") : [];
}

export function capabilityInput(app: string, profiles: readonly CapabilityRequestProfile[]): {
  readonly path: string; readonly method: CapabilityProfile["method"]; readonly stream: false;
  readonly input: Record<string, unknown>; readonly profile: CapabilityRequestProfile;
} | null {
  const profile = profiles.find((entry) => entry.app === app && entry.content_type === "application/json");
  if (!profile) return null;
  return { path: profile.path, method: profile.method, stream: false,
    input: template(profile.input_schema, profile.defaults), profile };
}
