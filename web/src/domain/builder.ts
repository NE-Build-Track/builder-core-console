/**
 * The Builder area's job form (decision D19): one generic form for any offering, plus example inputs for
 * the two M3 jobs. Presets are the app's own, not the engine's: once the engine describes each
 * capability's inputs (builder-core #18) the form can take them from there.
 */
import type { components } from "./engine-schema";
import type { Job, JobCost } from "./engine";

type Schemas = components["schemas"];

export type JobMethod = "POST" | "GET";

export type Preset = {
  readonly id: "chat" | "image" | "empty";
  readonly label: string;
  /** The offering this example was written for; the form still lets the builder choose another. */
  readonly app: string | null;
  readonly path: string;
  readonly method: JobMethod;
  readonly stream: boolean;
  readonly input: Record<string, unknown>;
  readonly note: string;
};

export const PRESETS: readonly Preset[] = [
  {
    id: "chat",
    label: "Chat",
    app: "blueclaw/chat/qwen3.8-27b",
    path: "/v1/chat/completions",
    method: "POST",
    stream: true,
    input: {
      messages: [{ role: "user", content: "In two sentences, what is the Livepeer network?" }],
      max_tokens: 200,
      stream: true,
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: false },
    },
    note: "An OpenAI-style chat completion, streamed as server-sent events.",
  },
  {
    id: "image",
    label: "Image",
    app: "comfystream/fal-flux-schnell",
    path: "/",
    method: "POST",
    stream: false,
    input: { prompt: "A lighthouse on a cliff at dusk, watercolour", image_size: "landscape_4_3", num_images: 1, enable_safety_checker: true },
    note: "One FLUX schnell picture; the runner answers with JSON holding a temporary image URL.",
  },
  { id: "empty", label: "Empty", app: null, path: "/", method: "POST", stream: false, input: {}, note: "Start from an empty object." },
];

/** What the Builder sends to `POST /v1/jobs`, built from the form. */
export type RunInput = {
  readonly app: string;
  readonly path: string;
  readonly method: JobMethod;
  readonly payload: Record<string, unknown>;
  readonly stream: boolean;
  readonly timeoutS: number;
  readonly maxAttempts: number;
  readonly operationRef: string;
};

/** The fields the console sets; the engine fills the rest with its defaults (mode, first-byte and idle limits). */
export type JobRequestBody = Pick<Schemas["JobRequest"], "app" | "path" | "method" | "payload" | "timeout_s" | "max_attempts" | "operation_ref">;

export function jobRequestOf(input: RunInput): JobRequestBody {
  return {
    app: input.app,
    path: input.path,
    method: input.method,
    payload: input.payload,
    timeout_s: input.timeoutS,
    max_attempts: input.maxAttempts,
    operation_ref: input.operationRef,
  };
}

/** The response headers the console passes from the engine to the browser. */
export const RUN_HEADERS = { jobId: "x-job-id", operationRef: "x-operation-ref", status: "x-engine-status" } as const;

/** States a job does not leave. Cost can still be pending after one of these. */
export const FINAL_JOB_STATES = ["succeeded", "failed", "uncertain"] as const;

export function isFinalState(state: string): boolean {
  return (FINAL_JOB_STATES as readonly string[]).includes(state);
}

/** A job and its cost, as the Builder polls them after a run (JSON for the browser). */
export type JobState = {
  readonly job: Job | null;
  readonly cost: JobCost | null;
  readonly problem: string | null;
  /** Nothing more will change: the job is final and its cost is no longer pending, or nothing was paid. */
  readonly settled: boolean;
};
