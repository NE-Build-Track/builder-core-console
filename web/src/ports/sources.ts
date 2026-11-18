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
import type { AccessKey, Allowance, CostSummary, EngineGrant, EngineHealth, Job, JobCost, KnownActor, Offering, Reconciliation, Runner } from "@/domain/engine";
import type { Reading } from "@/domain/reading";
import type { DiscoveredOrchestrator } from "@/domain/discovery";
import type { SignerMetrics, SignerReadiness } from "@/domain/signer";

export interface EngineReader {
  /** GET /readyz. A 503 still carries the health body, so it is a successful reading of an unready engine. */
  health(): Promise<Reading<EngineHealth>>;
  offerings(): Promise<Reading<readonly Offering[]>>;
  runners(app: string): Promise<Reading<readonly Runner[]>>;
  grants(): Promise<Reading<readonly EngineGrant[]>>;
  keys(): Promise<Reading<readonly AccessKey[]>>;
  /** GET /v1/admin/actors: provisioned actors and people who signed in (builder-core #69, D48). */
  actors(): Promise<Reading<readonly KnownActor[]>>;
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
  /** GET /v1/jobs: every actor's jobs in the reader's application, newest first, paged by `before` (builder-core D44, D59). */
  jobs(query: { readonly limit: number; readonly before?: string }): Promise<Reading<readonly Job[]>>;
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
}

/** The discovery service (livepeer/node's livepeer-discovery): the orchestrators it serves and their runners. */
export interface DiscoveryReader {
  inventory(): Promise<Reading<readonly DiscoveredOrchestrator[]>>;
}

/** One reading of the signer's delivery errors: publish, enqueue and storage, summed. */
export type ErrorSample = { readonly atMs: number; readonly total: number };

/**
 * The signer's error totals as this console process has read them (decision D22). The signer only
 * counts since it started, so without these an error from hours ago looks the same as one just now.
 */
export interface ErrorHistory {
  /** Keep this reading; return the readings inside the window, after the last one before it, oldest first. */
  record(sample: ErrorSample): readonly ErrorSample[];
}

export type Sources = {
  readonly engine: EngineReader;
  readonly batteries: BatteriesReader;
  readonly signer: SignerReader;
  readonly discovery: DiscoveryReader;
  /** The engine application the admin key reads (CONSOLE_APPLICATION_ID, gap G9). */
  readonly applicationId: string;
  readonly now: () => Date;
  readonly signerErrors: ErrorHistory;
};
