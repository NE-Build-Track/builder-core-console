/** Process liveness for the container healthcheck. It reads no upstream: a down engine is not a down console. */
export function GET(): Response {
  return new Response("ok\n", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
