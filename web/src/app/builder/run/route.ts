import { RUN_HEADERS } from "@/domain/builder";
import { hideSecrets } from "@/domain/exchange";
import { describeProblem } from "@/domain/reading";
import { startRun } from "@/runtime/builder";
import { parseRun } from "@/services/builder";

import { sessionFor } from "../../session-cookies";

/**
 * The Builder's job run (decisions D19, D20): the browser posts the form here, and the console runs the
 * job with the builder's own key and streams the runner's response back unchanged. When the browser goes
 * away, the engine call is aborted with it, which the engine treats as a client disconnect.
 *
 * Only same-origin posts are taken (the session cookie is also SameSite=Strict).
 */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ problem: "Only the console itself may start a run." }, { status: 403 });
  const session = await sessionFor("builder");
  if (!session) return Response.json({ problem: "Your builder session ended. Sign in again." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ problem: "The run request was not JSON." }, { status: 400 });
  }
  const input = parseRun(body);
  if (!input.ok) return Response.json({ problem: input.message, field: input.field }, { status: 400 });
  const started = await startRun(session, input.value, request.signal);
  if (!started) return Response.json({ problem: "The console has no engine URL (CONSOLE_ENGINE_URL)." }, { status: 503 });
  if (started.ok) {
    return new Response(started.body, {
      status: started.status,
      headers: {
        "content-type": started.contentType,
        "cache-control": "no-store",
        [RUN_HEADERS.jobId]: started.jobId ?? "",
        [RUN_HEADERS.operationRef]: input.value.operationRef,
      },
    });
  }
  return Response.json(
    { problem: describeProblem(started.problem), response: hideSecrets(started.response), exchange: hideSecrets(started.exchange) },
    { status: started.status ?? 502, headers: { "cache-control": "no-store", [RUN_HEADERS.status]: String(started.status ?? "") } },
  );
}
