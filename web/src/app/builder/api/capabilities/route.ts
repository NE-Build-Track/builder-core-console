import { loadCapabilityProfiles } from "@/runtime/builder";

import { sessionFor } from "../../../session-cookies";

export async function GET(request: Request): Promise<Response> {
  const session = await sessionFor("builder");
  if (!session) return Response.json({ problem: "Your Builder session ended." }, { status: 401 });
  const app = new URL(request.url).searchParams.get("app");
  if (!app || app.length > 256) return Response.json({ problem: "Choose an offering." }, { status: 400 });
  const profiles = await loadCapabilityProfiles(session, app);
  if (!profiles.ok) return Response.json({ problem: "The operation schema could not be verified through Engine." }, { status: 503 });
  return Response.json(profiles.value.filter(profile => profile.app === app), { headers: { "cache-control": "no-store" } });
}
