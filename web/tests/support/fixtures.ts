/**
 * Fixture sources for service tests. The Batteries and signer rows are copied from a live read of
 * ChatLPT's stack on 20 October 2026 (same pins as this repository), so tests run on real shapes.
 */
import type { Allocation, ApiKey, Grant, LedgerRow, PaymentSession, UsageEvent } from "@/domain/batteries";
import type { AccessKey, CostSummary, EngineHealth, Job, JobCost, Reconciliation } from "@/domain/engine";
import { failed, ok, type Problem, type Reading, type SourceName } from "@/domain/reading";
import { PINS, shortCommit } from "@/domain/pins";
import type { DiscoveredOrchestrator } from "@/domain/discovery";
import type { SignerMetrics, SignerReadiness } from "@/domain/signer";
import type { BatteriesReader, DiscoveryReader, EngineReader, SignerReader, Sources } from "@/ports/sources";

export const NOW = new Date("2026-10-20T18:00:00.000Z");
const AT = NOW.toISOString();

export const read = <T>(source: SourceName, value: T): Reading<T> => ok(source, value, AT);
export const broken = <T>(source: SourceName, problem: Problem = { kind: "unreachable", detail: "connect ECONNREFUSED" }): Reading<T> =>
  failed(source, problem, AT);

export const grant: Grant = {
  created_at_ms: 1792445348702,
  currency: "usd",
  ends_at_ms: null,
  id: "AaFWEXteeuCF5BRhhChWNg",
  metadata: "",
  name: "ChatLPT",
  sponsor: "ChatLPT",
  starts_at_ms: null,
  status: "active",
  total_usd: "2",
};

export const allocation: Allocation = {
  allocated_usd: "2",
  available_usd: "1.955046250933067972",
  beneficiary: "",
  created_at_ms: 1792445414300,
  currency: "usd",
  grant_id: "AaFWEXteeuCF5BRhhChWNg",
  id: "AaFWEnucfhuOCn95t02zMw",
  name: "chatlpt",
  spent_usd: "0.044953749066932028",
  status: "active",
};

export const apiKey: ApiKey = {
  allocation_id: "AaFWEnucfhuOCn95t02zMw",
  created_at_ms: 1792445414301,
  id: "AaFWExampleKeyPrefixZZ",
  last_used_at_ms: 1792507911551,
  name: "chatlpt",
  prefix: "lpg_AaFWExampleKeyPrefixZZ",
  revoked_at_ms: null,
};

export const ledger: LedgerRow[] = [
  { account_id: "AaFWEnucfhuOCn95t02zMw", account_type: "allocation_available", balance_usd: "1.955046250933067972", currency: "usd" },
  { account_id: "AaFWEnucfhuOCn95t02zMw", account_type: "allocation_spent", balance_usd: "0.044953749066932028", currency: "usd" },
  { account_id: "AaFWEXteeuCF5BRhhChWNg", account_type: "grant_funding_source", balance_usd: "-2", currency: "usd" },
  { account_id: "AaFWEXteeuCF5BRhhChWNg", account_type: "grant_unallocated", balance_usd: "0", currency: "usd" },
];

export const session: PaymentSession = {
  allocation_id: "AaFWEnucfhuOCn95t02zMw",
  api_key_id: "AaFWExampleKeyPrefixZZ",
  app: "blueclaw/chat/qwen3.8-27b",
  created_at_ms: 1792445475959,
  id: "AaFWE2x3eK-5vLFI1BMpdw",
  last_seen_at_ms: 1792445475959,
  orchestrator: "0xd00354656922168815fcd1e51cbddb9e359e3c7f",
  payment_type: "live",
  state_id: "6ad4dc7decf83638ad045b8fbaa1ee32",
  status: "active",
};

export function usageEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    allocation_id: "AaFWEnucfhuOCn95t02zMw",
    computed_fee_eth: "0.00000004634466808",
    computed_fee_usd: "0.000111360982738132",
    created_at_ms: NOW.getTime() - 3600_000,
    currency: "usd",
    error: "",
    event_id: "b507ff0c-5454-47b4-9bcb-25a9d6159ade",
    id: "AaFWE3BXfFueVw6DydT4sA",
    manifest_id: "e7621a15",
    payment_session_id: "AaFWE2x3eK-5vLFI1BMpdw",
    pipeline: "live",
    request_id: "b47da0c2825659aab3cd96b86f64acc8",
    status: "applied",
    ...overrides,
  };
}

export const healthyMetrics: SignerMetrics = {
  livepeer_signer_up: 1,
  livepeer_signer_kafka_outbox_healthy: 1,
  livepeer_signer_kafka_pending_events: 0,
  livepeer_signer_kafka_pending_bytes: 0,
  livepeer_signer_kafka_oldest_event_age_seconds: 0,
  livepeer_signer_kafka_publish_errors_total: 0,
  livepeer_signer_kafka_enqueue_errors_total: 0,
  livepeer_signer_kafka_storage_errors_total: 0,
};

export const orchestrator: DiscoveredOrchestrator = {
  address: "https://orch-us-central.xodeapp.xyz:18935",
  score: 1,
  last_seen: "2026-10-20T17:33:02.784512125Z",
  runners: [
    {
      url: "https://orch-us-central.xodeapp.xyz:18935/apps/runner_ogm53upg/app",
      app: "blueclaw/chat/qwen3.8-27b",
      mode: "single-shot",
      capacity: 8,
      capacity_used: 0,
      capacity_available: 8,
      metadata: null,
      price_info: { price: 4534062178, currency: "wei", unit: "seconds" },
    },
  ],
};

export function engineHealth(overrides: Partial<EngineHealth> = {}): EngineHealth {
  return {
    ready: true,
    discovery_fresh: true,
    discovery_observed_at: new Date(NOW.getTime() - 5_000).toISOString(),
    discovery_error: null,
    cost_sync_at: new Date(NOW.getTime() - 20_000).toISOString(),
    cost_sync_error: null,
    running_jobs: 0,
    allocation_mode: "per_actor",
    version: `0.1.1.dev37+g${shortCommit(PINS.engine.commit)}`, // the pinned build
    ...overrides,
  };
}

const noFees = { fee_eth: "0", fee_usd: "0", row_count: 0 };

export function reconciliation(overrides: Partial<Reconciliation> = {}): Reconciliation {
  return {
    application_id: "default",
    actor_id: null,
    allocation_id: "AaFWEnucfhuOCn95t02zMw",
    provider_spent: { amount: "0.044953749066932028", currency: "USD" },
    by_class: { delivered: { fee_eth: "0", fee_usd: "0.044953749066932028", row_count: 404 } },
    unattributed: noFees,
    balanced: true,
    ...overrides,
  };
}

export function accessKey(overrides: Partial<AccessKey> = {}): AccessKey {
  return {
    key_id: "key-1",
    kind: "actor",
    actor_id: "customer-42",
    application_id: "default",
    permissions: ["discover", "jobs.run", "jobs.read", "costs.read"],
    label: "",
    created_at: "2026-10-19T12:00:00Z",
    revoked_at: null,
    ...overrides,
  };
}

export const costSummary: CostSummary = {
  start: "2026-10-13T18:00:00Z",
  end: AT,
  by_class: { delivered: { fee_eth: "0", fee_usd: "0.04", row_count: 3 }, failed_after_payment: { fee_eth: "0", fee_usd: "0.0049", row_count: 1 } },
  jobs_with_cost: 4,
  jobs_pending: 1,
};

export const job: Job = {
  id: "0b0c8f6e-6a59-4d55-9a3c-2f0e8a3d6b1c",
  actor_id: "customer-42",
  application_id: "default",
  operation_ref: null,
  mode: "immediate",
  app: "blueclaw/chat/qwen3.8-27b",
  capability: null,
  model: null,
  state: "succeeded",
  attempts: [
    {
      job_id: "0b0c8f6e-6a59-4d55-9a3c-2f0e8a3d6b1c",
      number: 1,
      runner_url: "https://orch-us-central.xodeapp.xyz:18935/apps/runner_ogm53upg/app",
      orchestrator_url: "https://orch-us-central.xodeapp.xyz:18935",
      allocation_id: "AaFWEnucfhuOCn95t02zMw",
      sessions: [{ manifest_id: "e7621a15", match: "matched", payment_session_id: "AaFWE2x3eK-5vLFI1BMpdw" }],
      payment_sent: true,
      outcome: "succeeded",
      status_code: 200,
      started_at: "2026-10-20T17:00:00Z",
      ended_at: "2026-10-20T17:00:03Z",
    },
  ],
  failure: null,
  result: null,
  usage: null,
  created_at: "2026-10-20T17:00:00Z",
  completed_at: "2026-10-20T17:00:03Z",
};

export const jobCost: JobCost = {
  job_id: job.id,
  status: "observed",
  fees: { fee_eth: "0.00000004634466808", fee_usd: "0.000111360982738132", row_count: 1 },
  attempts: [{ attempt_number: 1, cost_class: "delivered", fees: { fee_eth: "0.00000004634466808", fee_usd: "0.000111360982738132", row_count: 1 } }],
  first_observed_at: "2026-10-20T17:00:30Z",
  updated_at: "2026-10-20T17:00:30Z",
};

const listing = <T>(items: readonly T[]) => read("batteries", { items, truncated: false });

export function engineFake(overrides: Partial<EngineReader> = {}): EngineReader {
  return {
    health: async () => read("engine", engineHealth()),
    offerings: async () =>
      read("engine", [
        {
          app: "blueclaw/chat/qwen3.8-27b",
          modes: ["single-shot"],
          rate_low: { amount: "4534062178", currency: "wei", unit: "seconds" },
          rate_high: { amount: "4534062178", currency: "wei", unit: "seconds" },
          runner_count: 1,
          ready_count: 1,
          observed_at: AT,
        },
      ]),
    runners: async (app) =>
      read("engine", [
        {
          url: "https://orch-us-central.xodeapp.xyz:18935/apps/runner_ogm53upg/app",
          app,
          runner_id: "runner_ogm53upg",
          mode: "single-shot",
          orchestrator_url: "https://orch-us-central.xodeapp.xyz:18935",
          capacity: 8,
          capacity_available: 6,
          rate: { amount: "4534062178", currency: "wei", unit: "seconds" },
          gpu: { id: "0", name: "NVIDIA RTX 4090", vram_mb: 24564 },
          metadata: null,
          version: "1.0.2",
        },
      ]),
    grants: async () => read("engine", [{ id: grant.id, name: "ChatLPT", status: "active", currency: "USD", total: "2" }]),
    keys: async () => read("engine", [accessKey(), accessKey({ key_id: "admin-1", kind: "admin", actor_id: "admin", label: "console" })]),
    allowance: async () =>
      read("engine", {
        allocation_id: allocation.id,
        status: "active",
        granted: { amount: "2", currency: "USD" },
        spent: { amount: "0.044953749066932028", currency: "USD" },
        available: { amount: "1.955046250933067972", currency: "USD" },
      }),
    costSummary: async () => read("engine", costSummary),
    costProjections: async () => read("engine", [jobCost]),
    reconciliation: async () => read("engine", reconciliation()),
    job: async () => read("engine", job),
    jobCost: async () => read("engine", jobCost),
    ...overrides,
  };
}

export function batteriesFake(overrides: Partial<BatteriesReader> = {}): BatteriesReader {
  return {
    ready: async () => read("batteries", true as const),
    grants: async () => listing([grant]),
    allocations: async () => listing([allocation]),
    apiKeys: async () => listing([apiKey]),
    sessions: async () => listing([session]),
    usage: async () => listing([usageEvent()]),
    usageForManifest: async (manifest) => listing([usageEvent({ manifest_id: manifest })]),
    ledger: async () => read("batteries", ledger),
    escrow: async () => read("batteries", []),
    ...overrides,
  };
}

export function signerFake(overrides: Partial<SignerReader> = {}): SignerReader {
  return {
    readiness: async () => read<SignerReadiness>("signer", { ready: true, detail: "ready" }),
    metrics: async () => read("signer", healthyMetrics),
    ...overrides,
  };
}

export function discoveryFake(overrides: Partial<DiscoveryReader> = {}): DiscoveryReader {
  return {
    inventory: async () => read<readonly DiscoveredOrchestrator[]>("discovery", [orchestrator]),
    ...overrides,
  };
}

export function fakeSources(
  overrides: {
    engine?: Partial<EngineReader>;
    batteries?: Partial<BatteriesReader>;
    signer?: Partial<SignerReader>;
    discovery?: Partial<DiscoveryReader>;
  } = {},
): Sources {
  return {
    engine: engineFake(overrides.engine),
    batteries: batteriesFake(overrides.batteries),
    signer: signerFake(overrides.signer),
    discovery: discoveryFake(overrides.discovery),
    applicationId: "default",
    now: () => NOW,
  };
}
