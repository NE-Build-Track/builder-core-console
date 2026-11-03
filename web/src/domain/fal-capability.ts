import { z } from "zod";

import type { Runner } from "./engine";

const profileSchema = z.object({
  id: z.string(), app: z.string(), method: z.literal("POST"), path: z.literal("/"),
  content_type: z.literal("application/json"), provider: z.literal("fal"),
  endpoint_id: z.string(), contract_hash: z.string().regex(/^[a-f0-9]{64}$/),
  schema_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  input_schema: z.record(z.string(), z.unknown()), defaults: z.record(z.string(), z.unknown()),
});
export type FalRequestProfile = z.infer<typeof profileSchema>;
export type FalRequestContract = Pick<FalRequestProfile, "app" | "endpoint_id" | "contract_hash" | "schema_digest" | "input_schema" | "defaults">;

export function parseFalRequestProfile(value: unknown): FalRequestProfile | null {
  const parsed = profileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The registration URL already ends in /fal/<capability>; Core's relative '/' reaches that handler. */
export function falRequestProfile(app: string, contracts: readonly FalRequestContract[], runners: readonly Runner[]): FalRequestProfile | null {
  const contract = contracts.find(item => item.app === app);
  if (!contract) return null;
  const matches = runners.some(runner => {
    if (runner.app !== app) return false;
    try {
      const metadata = JSON.parse(runner.metadata ?? "{}") as Record<string, unknown>;
      return metadata.provider === "fal" && metadata.endpoint_id === contract.endpoint_id && metadata.schema_sha256 === contract.contract_hash && metadata.transport === "queue";
    } catch { return false; }
  });
  return matches ? { ...contract, id: contract.app, method: "POST", path: "/", content_type: "application/json", provider: "fal" } : null;
}
