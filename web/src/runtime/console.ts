import "server-only";

import { batteriesReader } from "@/adapters/batteries/reader";
import { discoveryReader } from "@/adapters/discovery/reader";
import { engineReader } from "@/adapters/engine/reader";
import { readerTokens } from "@/adapters/oidc/provider";
import { signerReader } from "@/adapters/signer/reader";
import { readConfig } from "@/config/config";
import type { Sources } from "@/ports/sources";
import { jobs } from "@/services/jobs";
import { money } from "@/services/money";
import { navCounts } from "@/services/nav";
import { network } from "@/services/network";
import { stackHealth } from "@/services/stack-health";
import { usage } from "@/services/usage";
import { users } from "@/services/users";
import type { WindowName } from "@/utils/time";

import { cached, ttlCache, type TtlCache } from "./ttl-cache";

/**
 * App wiring: settings → adapters → cached readers → services. Pages call only these functions.
 * The sources are built once per server process, so the cache is shared by every request.
 */
let cache: TtlCache | null = null;

function build(): Sources {
  const config = readConfig();
  const now = () => new Date();
  cache = ttlCache(config.cacheTtlMs);
  const options = { timeoutMs: config.timeoutMs, now };
  // With CONSOLE_AUTH=oidc the background reads hold no admin key: they use the console's own read-only
  // client-credentials token, which the engine maps to an auditor (builder-core D46).
  const auth = config.auth;
  const tokens =
    auth.mode === "oidc" && auth.oidc.ok && auth.reader.ok
      ? readerTokens(auth.oidc.value.issuer, auth.reader.value, auth.oidc.value.allowHttp, options, auth.oidc.value.audience)
      : null;
  return {
    engine: cached("engine", engineReader(config.engine, options, tokens), cache),
    batteries: cached("batteries", batteriesReader(config.batteries, { ...options, maxRows: config.maxListRows }), cache),
    signer: cached("signer", signerReader(config.signer, options), cache),
    discovery: cached("discovery", discoveryReader(config.discovery, options), cache),
    applicationId: config.applicationId,
    now,
  };
}

let sources: Sources | null = null;

function current(): Sources {
  sources ??= build();
  return sources;
}

/** The shared sources, for the writing areas' review reads. */
export const sharedSources = (): Sources => current();

/** After a write, forget every cached read so the next page shows the change, not a 15 s old copy. */
export function forgetReads(): void {
  cache?.clear();
}

export const loadStackHealth = () => stackHealth(current());
export const loadNetwork = () => network(current());
export const loadMoney = () => money(current());
export const loadUsers = () => users(current());
export const loadUsage = (window: WindowName) => usage(current(), window);
export const loadJobs = (lookupId: string | null) => jobs(current(), lookupId);
export const loadNavCounts = () => navCounts(current());
export const consoleSettings = () => {
  const config = readConfig();
  return {
    /** "keys" or "oidc": with oidc the engine's API keys are off, so key actions are hidden. */
    authMode: config.auth.mode,
    applicationId: config.applicationId,
    cacheTtlS: config.cacheTtlMs / 1000,
    maxListRows: config.maxListRows,
    /** How often open pages re-read the stack: never faster than the cache. */
    refreshS: Math.max(15, config.cacheTtlMs / 1000),
  };
};
