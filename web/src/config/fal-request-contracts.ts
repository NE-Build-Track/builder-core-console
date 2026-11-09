import "server-only";

import type { FalRequestContract } from "@/domain/fal-capability";

import contracts from "./fal-request-contracts.json";

export const FAL_REQUEST_CONTRACTS: readonly FalRequestContract[] = contracts;
