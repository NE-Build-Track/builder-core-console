/** Switching operations replaces previous input; required fields without defaults stay unfilled. */
import type { CapabilityProfile } from "./engine";

export function capabilityInput(app: string, profiles: readonly CapabilityProfile[]): {
  readonly path: string; readonly method: CapabilityProfile["method"]; readonly stream: false;
  readonly input: Record<string, unknown>; readonly profile: CapabilityProfile;
} | null {
  const profile = profiles.find((entry) => entry.app === app && entry.content_type === "application/json");
  if (!profile) return null;
  return { path: profile.path, method: profile.method, stream: false,
    input: structuredClone(profile.defaults), profile };
}
