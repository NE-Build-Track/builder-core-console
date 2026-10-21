import { loadJobState } from "@/runtime/builder";

import { sessionFor } from "../../../../session-cookies";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A job and its cost as JSON, read with the builder's key: the run panel polls this until both settle. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!JOB_ID.test(id)) return Response.json({ problem: "Not a job id." }, { status: 400 });
  const session = await sessionFor("builder");
  if (!session) return Response.json({ problem: "Your builder session ended. Sign in again." }, { status: 401 });
  return Response.json(await loadJobState(session, id), { headers: { "cache-control": "no-store" } });
}
