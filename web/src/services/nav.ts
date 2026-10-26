/** The counts beside each page in the rail, from the same cached reads the pages use. */
import { GAPS } from "@/domain/gaps";
import type { NavCounts } from "@/domain/views";
import type { Sources } from "@/ports/sources";

import { stackHealth } from "./stack-health";
import { groupKeys } from "./users";

export async function navCounts(sources: Sources): Promise<NavCounts> {
  const [health, discovery, grants, keys, projections, usage] = await Promise.all([
    stackHealth(sources),
    sources.discovery.inventory(),
    sources.batteries.grants(),
    sources.engine.keys(),
    sources.engine.costProjections(),
    sources.batteries.usage(),
  ]);
  const dayAgo = sources.now().getTime() - 86_400_000;
  return {
    health: health.state,
    network: discovery.ok ? discovery.value.length : null,
    money: grants.ok ? grants.value.items.length : null,
    users: keys.ok ? groupKeys(keys.value).actors.length : null,
    usage: usage.ok ? usage.value.items.filter((event) => event.status === "applied" && event.created_at_ms >= dayAgo).length : null,
    jobs: projections.ok ? projections.value.length : null,
    sources: GAPS.length,
    operator: null,
    builder: null,
  };
}
