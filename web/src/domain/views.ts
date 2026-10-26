/**
 * The view models services build and pages render. Pages never reach into raw source shapes for
 * anything computed; they get these. Amounts stay exact decimal strings; `share` fields are display
 * ratios in [0, 1] for rings, bars and meters only.
 */
import type { Allocation, ApiKey, EscrowRow, Grant, LedgerRow, Listing, UsageEvent } from "./batteries";
import type {
  AccessKey,
  Allowance,
  CostClass,
  CostSummary,
  EngineGrant,
  EngineHealth,
  Fees,
  Job,
  JobCost,
  Offering,
  Reconciliation,
  Runner,
} from "./engine";
import type { Reading } from "./reading";
import type { DiscoveredOrchestrator } from "./discovery";
import type { SignerMetrics, SignerReadiness } from "./signer";

export type State = "ok" | "warn" | "bad" | "unknown";

/** One check on the health page: a verdict, a one-line reason, and the reading it came from. */
export type Check = {
  readonly id: string;
  readonly label: string;
  readonly state: State;
  readonly summary: string;
};

export type ComponentHealth = {
  readonly component: "engine" | "batteries" | "signer";
  readonly title: string;
  /** What the component is, in a few words, under its title. */
  readonly role: string;
  readonly state: State;
  readonly checks: readonly Check[];
};

export type Verdict = {
  readonly state: State;
  /** "Operational", "Impaired"…: the one word at the top of the page. */
  readonly headline: string;
  /** The short form for the top bar pill: "Operational, 1 warning". */
  readonly short: string;
  /** One or two sentences: what is wrong, or that nothing is. */
  readonly why: string;
  readonly passing: number;
  readonly total: number;
  readonly warnings: number;
  readonly failing: number;
};

export type TopologyNode = { readonly state: State; readonly detail: string };

/** The flow diagram on the health page: engine → signer → Batteries, and the orchestrators being paid. */
export type Topology = {
  readonly engine: TopologyNode;
  readonly signer: TopologyNode;
  readonly batteries: TopologyNode;
  readonly orchestrators: readonly { readonly label: string; readonly stale: boolean }[];
};

/** One signed ticket as the ticker shows it. */
export type TickerItem = {
  readonly id: string;
  readonly feeUsd: string;
  readonly app: string;
  readonly orchestrator: string;
  readonly at: string;
};

export type StackHealth = {
  readonly state: State;
  readonly verdict: Verdict;
  readonly components: readonly ComponentHealth[];
  readonly topology: Topology;
  readonly engine: Reading<EngineHealth>;
  readonly signerMetrics: Reading<SignerMetrics>;
  readonly ticker: Reading<readonly TickerItem[]>;
  readonly checkedAt: string;
};

export type OrchestratorView = {
  readonly address: string;
  readonly lastSeen: string | null;
  readonly stale: boolean;
  readonly runners: number;
  readonly capacity: number;
  readonly capacityAvailable: number;
  readonly apps: readonly string[];
};

export type OfferingStats = {
  readonly runners: number;
  readonly orchestrators: number;
  readonly free: number;
  readonly total: number;
  readonly priceLow: string | null;
  readonly priceHigh: string | null;
  readonly priceUnit: string | null;
};

export type AppNetwork = {
  readonly offering: Offering;
  readonly runners: Reading<readonly Runner[]>;
  readonly stats: OfferingStats;
};

export type NetworkView = {
  readonly apps: Reading<readonly AppNetwork[]>;
  readonly orchestrators: Reading<readonly OrchestratorView[]>;
  readonly discovery: Reading<EngineHealth>;
  readonly totals: {
    readonly apps: number;
    readonly orchestrators: number;
    readonly freshOrchestrators: number;
    readonly runners: number;
    readonly free: number;
    readonly slots: number;
  };
};

export type AllocationView = {
  readonly allocation: Allocation;
  readonly keys: readonly ApiKey[];
  readonly allocated: string;
  readonly spent: string;
  readonly available: string;
  /** Days of balance left at the last 7 days' pace; null when nothing was spent in that time. */
  readonly runwayDays: number | null;
};

export type GrantView = {
  readonly grant: Grant;
  readonly total: string;
  readonly allocated: string;
  readonly spent: string;
  readonly unallocated: string | null;
  readonly allocations: readonly AllocationView[];
};

export type CurrencyTotals = {
  readonly currency: string;
  readonly granted: string;
  readonly allocated: string;
  readonly spent: string;
  readonly available: string;
};

export type MoneyView = {
  readonly grants: Reading<readonly GrantView[]>;
  readonly allocations: Reading<Listing<Allocation>>;
  readonly keys: Reading<Listing<ApiKey>>;
  /** Allocations whose grant is not in the grant list (should be none; shown if it happens). */
  readonly orphanAllocations: readonly AllocationView[];
  readonly totals: readonly CurrencyTotals[];
  readonly engineGrants: Reading<readonly EngineGrant[]>;
  readonly ledger: Reading<readonly LedgerRow[]>;
  /** The sum of every ledger balance in USD; zero when the books balance. Null without a ledger. */
  readonly ledgerSum: string | null;
  readonly escrow: Reading<readonly EscrowRow[]>;
  /** A Batteries list stopped at the row cap (gap G6): totals are partial. */
  readonly truncated: boolean;
};

export type ActorView = {
  readonly applicationId: string;
  readonly actorId: string;
  readonly keys: readonly AccessKey[];
  readonly activeKeys: number;
  /** Null when the actor is outside CONSOLE_APPLICATION_ID (gap G9). */
  readonly allowance: Reading<Allowance> | null;
  readonly costs: Reading<CostSummary> | null;
  /** The 30-day spend summed across cost classes, in USD; null when it could not be read. */
  readonly spentUsd: string | null;
  readonly reconciliation: Reading<Reconciliation>;
};

export type UsersView = {
  readonly actors: Reading<readonly ActorView[]>;
  readonly admins: readonly AccessKey[];
  readonly applicationId: string;
  readonly applicationReconciliation: Reading<Reconciliation>;
  readonly counts: {
    readonly actors: number;
    readonly applications: number;
    readonly activeKeys: number;
    readonly balanced: number;
    readonly unbalanced: number;
  };
};

export type Breakdown = {
  readonly key: string;
  readonly label: string;
  readonly feeUsd: string;
  readonly events: number;
};

/** One point of the usage chart: an hour (24 h window) or a UTC day. */
export type Bucket = {
  readonly start: string;
  readonly feeUsd: string;
  readonly events: number;
};

export type UsageView = {
  readonly window: { readonly start: string; readonly end: string };
  readonly by: "hour" | "day";
  readonly events: Reading<Listing<UsageEvent>>;
  /** The session list stopped at the row cap: some events show as "unknown session" (gap G6). */
  readonly sessionsTruncated: boolean;
  readonly feeUsd: string;
  readonly eventCount: number;
  readonly averageFeeUsd: string;
  readonly quarantined: readonly UsageEvent[];
  readonly buckets: readonly Bucket[];
  readonly byApp: readonly Breakdown[];
  readonly byOrchestrator: readonly Breakdown[];
  readonly byAllocation: readonly Breakdown[];
  readonly recent: readonly (TickerItem & { readonly manifestId: string; readonly allocation: string })[];
  readonly engineCosts: Reading<CostSummary>;
  readonly classes: readonly { readonly costClass: CostClass; readonly fees: Fees | null }[];
};

export type JobLookup = {
  readonly id: string;
  readonly job: Reading<Job>;
  readonly cost: Reading<JobCost> | null;
  readonly providerEvents: Reading<readonly UsageEvent[]> | null;
};

export type JobsView = {
  readonly projections: Reading<readonly JobCost[]>;
  readonly lookup: JobLookup | null;
  /** The id given was not a job id (a UUID). */
  readonly invalidId: boolean;
};

export type NavCounts = {
  readonly health: State;
  readonly network: number | null;
  readonly money: number | null;
  readonly users: number | null;
  /** Signed tickets applied in the last 24 hours. */
  readonly usage: number | null;
  readonly jobs: number | null;
  readonly sources: number;
  /** The writing areas carry no count. */
  readonly operator: null;
  readonly builder: null;
};

export type SignerView = {
  readonly readiness: Reading<SignerReadiness>;
  readonly metrics: Reading<SignerMetrics>;
  readonly discovery: Reading<readonly DiscoveredOrchestrator[]>;
};
