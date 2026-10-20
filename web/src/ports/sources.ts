/**
 * Providers layer: the read-only interfaces services depend on. Adapters implement them over HTTP; tests
 * implement them with fixtures (src/services/fixtures.ts). There is deliberately no write method on any
 * of them (decision D1, tests/structure/read-only.test.ts).
 */
import type {
  Allocation,
  ApiKey,
  EscrowRow,
  Grant,
  LedgerRow,
  Listing,
  PaymentSession,
  UsageEvent,
} from "@/domain/batteries";
import type {
  AccessKey,
  Allowance,
  CostSummary,
  EngineGrant,
  EngineHealth,
  Job,
  JobCost,
  Offering,
  Reconciliation,
  Runner,
} from "@/domain/engine";
import type { Reading } from "@/domain/reading";
import type { DiscoveredOrchestrator, SignerMetrics, SignerReadiness } from "@/domain/signer";

export interface EngineReader {
  /** GET /readyz. A 503 still carries the health body, so it is a successful reading of an unready engine. */
  health(): Promise<Reading<EngineHealth>>;
  offerings(): Promise<Reading<readonly Offering[]>>;
  runners(app: string): Promise<Reading<readonly Runner[]>>;
  grants(): Promise<Reading<readonly EngineGrant[]>>;
  keys(): Promise<Reading<readonly AccessKey[]>>;
  allowance(actorId: string): Promise<Reading<Allowance>>;
  costSummary(query: {
    readonly start: string;
    readonly end: string;
    readonly actorId?: string;
  }): Promise<Reading<CostSummary>>;
  costProjections(): Promise<Reading<readonly JobCost[]>>;
  reconciliation(query: {
    readonly applicationId: string;
    readonly actorId?: string;
  }): Promise<Reading<Reconciliation>>;
  job(id: string): Promise<Reading<Job>>;
  jobCost(id: string): Promise<Reading<JobCost>>;
}

export interface BatteriesReader {
  ready(): Promise<Reading<true>>;
  grants(): Promise<Reading<Listing<Grant>>>;
  allocations(): Promise<Reading<Listing<Allocation>>>;
  apiKeys(): Promise<Reading<Listing<ApiKey>>>;
  sessions(): Promise<Reading<Listing<PaymentSession>>>;
  usage(): Promise<Reading<Listing<UsageEvent>>>;
  usageForManifest(manifestId: string): Promise<Reading<Listing<UsageEvent>>>;
  ledger(): Promise<Reading<readonly LedgerRow[]>>;
  escrow(): Promise<Reading<readonly EscrowRow[]>>;
}

export interface SignerReader {
  readiness(): Promise<Reading<SignerReadiness>>;
  metrics(): Promise<Reading<SignerMetrics>>;
  discovery(): Promise<Reading<readonly DiscoveredOrchestrator[]>>;
}

export type Sources = {
  readonly engine: EngineReader;
  readonly batteries: BatteriesReader;
  readonly signer: SignerReader;
  /** The engine application the admin key reads (CONSOLE_APPLICATION_ID, gap G9). */
  readonly applicationId: string;
  readonly now: () => Date;
};
