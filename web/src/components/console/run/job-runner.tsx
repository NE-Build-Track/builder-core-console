"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { jobRequestOf, PRESETS, RUN_HEADERS, type JobMethod, type JobState, type Preset, type RunInput } from "@/domain/builder";
import { fillPath } from "@/domain/exchange";
import { outputKind } from "@/domain/output";

import { ExchangePanel, type ShownCall } from "../act/exchange-panel";
import { JobRecord } from "./job-record";
import { OutputView, type Output } from "./output-view";

export type OfferingChoice = { readonly app: string; readonly label: string };

type Run =
  | { readonly phase: "running" | "finished" | "stopped"; readonly call: ShownCall; readonly jobId: string | null; readonly output: Output }
  | { readonly phase: "refused"; readonly call: ShownCall; readonly jobId: string | null; readonly message: string };

const POLL_MS = 2000;
const POLL_LIMIT = 120; // four minutes: long enough for Batteries to report a paid job's cost

function presetFor(id: Preset["id"]): Preset {
  return PRESETS.find((preset) => preset.id === id) ?? (PRESETS[PRESETS.length - 1] as Preset);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * One generic job form for any offering (decision D19), its request shown before it is sent (D18), and
 * the output and job record as they arrive (D20). Example inputs are the console's own presets.
 */
export function JobRunner({
  offerings,
  initialApp,
  actorId = null,
}: {
  readonly offerings: readonly OfferingChoice[];
  readonly initialApp: string | null;
  /** Named in a 402 refusal, so the builder can pass it to an operator. */
  readonly actorId?: string | null;
}) {
  const firstPreset = presetFor(initialApp && initialApp === presetFor("image").app ? "image" : "chat");
  const startApp = initialApp ?? (offerings.some((item) => item.app === firstPreset.app) ? firstPreset.app : offerings[0]?.app) ?? "";
  const [presetId, setPresetId] = useState<Preset["id"]>(firstPreset.id);
  const [app, setApp] = useState(startApp);
  const [path, setPath] = useState(firstPreset.path);
  const [method, setMethod] = useState<JobMethod>(firstPreset.method);
  const [inputText, setInputText] = useState(JSON.stringify(firstPreset.input, null, 2));
  const [stream, setStream] = useState(firstPreset.stream);
  const [timeoutS, setTimeoutS] = useState(120);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  /** Each run gets fresh output views: a tab chosen for the last response may not exist for this one. */
  const [runs, setRuns] = useState(0);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const abort = useRef<AbortController | null>(null);

  function choosePreset(preset: Preset): void {
    setPresetId(preset.id);
    if (preset.app && offerings.some((item) => item.app === preset.app)) setApp(preset.app);
    setPath(preset.path);
    setMethod(preset.method);
    setStream(preset.stream);
    setInputText(JSON.stringify(preset.input, null, 2));
  }

  const preview = useMemo((): ShownCall => {
    let payload: unknown = inputText;
    try {
      payload = JSON.parse(inputText) as unknown;
    } catch {
      // shown as typed until it parses
    }
    const body = jobRequestOf({ app, path, method, payload: (record(payload) ?? {}) as Record<string, unknown>, stream, timeoutS, maxAttempts, operationRef: "console-run-<made when you press Run>" });
    return { method: "POST", path: fillPath("/v1/jobs", {}, { stream: String(stream) }), body: record(payload) ? body : { ...body, payload } };
  }, [app, path, method, inputText, stream, timeoutS, maxAttempts]);

  const jobId = run?.jobId ?? null;
  useEffect(() => {
    if (!jobId) return;
    let polls = 0;
    let stopped = false;
    async function poll(): Promise<void> {
      if (stopped) return;
      polls += 1;
      try {
        const response = await fetch(`/builder/api/jobs/${jobId}`, { cache: "no-store" });
        const state = (await response.json()) as JobState;
        setJobState(state);
        if (state.settled || polls >= POLL_LIMIT) return;
      } catch {
        if (polls >= POLL_LIMIT) return;
      }
      timer = window.setTimeout(poll, POLL_MS);
    }
    let timer = window.setTimeout(poll, 500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    let payload: Record<string, unknown> | null = null;
    try {
      payload = record(JSON.parse(inputText || "{}"));
    } catch (problem) {
      setError(`The input is not valid JSON: ${problem instanceof Error ? problem.message : "parse error"}.`);
      return;
    }
    if (!payload) return setError("The input must be a JSON object, like {}.");
    if (!app) return setError("Choose an offering.");
    const input: RunInput = { app, path, method, payload, stream, timeoutS, maxAttempts, operationRef: `console-run-${crypto.randomUUID()}` };
    const call: ShownCall = { method: "POST", path: fillPath("/v1/jobs", {}, { stream: String(stream) }), body: jobRequestOf(input) };
    setJobState(null);
    setRun(null);
    setRuns((count) => count + 1);
    abort.current = new AbortController();
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch("/builder/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: abort.current.signal });
    } catch (problem) {
      setRun({ phase: "refused", call: { ...call, status: null, problem: "the console did not answer" }, jobId: null, message: problem instanceof Error ? problem.message : "network error" });
      return;
    }
    if (!response.ok) {
      const data = record(await response.json().catch(() => null));
      const job = record(record(data?.response)?.job);
      const exchange = record(data?.exchange) as ShownCall | null;
      setRun({
        phase: "refused",
        call: exchange ?? { ...call, status: response.status, response: data, ms: Date.now() - started },
        jobId: typeof job?.id === "string" ? job.id : null,
        message: typeof data?.problem === "string" ? data.problem : `HTTP ${response.status}`,
      });
      return;
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const id = response.headers.get(RUN_HEADERS.jobId) || null;
    const binary = ["image", "binary"].includes(outputKind(contentType));
    const sent: ShownCall = { ...call, status: response.status, response: `(${stream ? "streaming" : "returned"} ${contentType}; Livepeer-Job-Id ${id ?? "unknown"})`, ms: Date.now() - started };
    let output: Output = { contentType, text: "", bytes: 0, blobUrl: null, streaming: true };
    setRun({ phase: "running", call: sent, jobId: id, output });
    const chunks: Uint8Array[] = [];
    const decoder = new TextDecoder();
    const reader = response.body?.getReader();
    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        if (binary) chunks.push(value);
        output = { ...output, bytes: output.bytes + value.byteLength, text: binary ? output.text : output.text + decoder.decode(value, { stream: true }) };
        setRun({ phase: "running", call: sent, jobId: id, output });
      }
      const blobUrl = binary ? URL.createObjectURL(new Blob(chunks as BlobPart[], { type: contentType })) : null;
      setRun({ phase: "finished", call: sent, jobId: id, output: { ...output, text: binary ? "" : output.text + decoder.decode(), blobUrl, streaming: false } });
    } catch {
      setRun({ phase: "stopped", call: sent, jobId: id, output: { ...output, streaming: false } });
    }
  }

  const running = run?.phase === "running";
  return (
    <div className="run-form">
      <form className="run-form" onSubmit={submit} aria-label="Run a job">
        <div className="preset-row">
          <span className="muted">Example input:</span>
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="btn" aria-pressed={preset.id === presetId} onClick={() => choosePreset(preset)}>
              {preset.label}
            </button>
          ))}
          <span className="hint">{presetFor(presetId).note}</span>
        </div>
        <div className="run-row">
          <div className="field">
            <label htmlFor="run-app">Offering</label>
            <select id="run-app" value={app} onChange={(event) => setApp(event.target.value)}>
              {offerings.map((offering) => (
                <option key={offering.app} value={offering.app}>
                  {offering.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="run-path">Path on the runner</label>
            <input id="run-path" value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="run-method">Method</label>
            <select id="run-method" value={method} onChange={(event) => setMethod(event.target.value === "GET" ? "GET" : "POST")}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="run-input">Input (JSON, sent to the runner as the request body)</label>
          <textarea id="run-input" value={inputText} onChange={(event) => setInputText(event.target.value)} spellCheck={false} />
        </div>
        <div className="run-options">
          <label>
            <input type="checkbox" checked={stream} onChange={(event) => setStream(event.target.checked)} /> Stream the response as it arrives
          </label>
          <label>
            Timeout <input type="number" min={5} max={600} value={timeoutS} onChange={(event) => setTimeoutS(Number(event.target.value))} /> s
          </label>
          <label>
            Attempts <input type="number" min={1} max={5} value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} />
          </label>
        </div>
        <ExchangePanel call={preview} />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="act-buttons">
          {running ? (
            <button type="button" className="btn" data-danger onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : null}
          <button type="submit" className="btn primary" disabled={running || offerings.length === 0}>
            {running ? "Running…" : "Run (paid)"}
          </button>
        </div>
      </form>
      {run ? <RunResult key={runs} run={run} jobState={jobState} actorId={actorId} /> : null}
    </div>
  );
}

function RunResult({ run, jobState, actorId }: { readonly run: Run; readonly jobState: JobState | null; readonly actorId: string | null }) {
  return (
    <section className="panel run-result" aria-labelledby="run-result-title">
      <h3 id="run-result-title">{run.phase === "refused" ? "The engine did not run it" : run.phase === "stopped" ? "Stopped" : run.phase === "running" ? "Running" : "Finished"}</h3>
      {run.phase === "refused" ? (
        <div className="problem" role="alert">
          <strong>{run.message}</strong>
          <span>The response below has the engine&apos;s own words, and the job when there is one.</span>
          {run.call.status === 402 && actorId ? (
            <span>
              An operator provisions an allocation for your actor id <code>{actorId}</code> in Operator actions; then run again.
            </span>
          ) : null}
        </div>
      ) : (
        <OutputView key={run.output.contentType} output={run.output} />
      )}
      {run.jobId ? <JobRecord jobId={run.jobId} state={jobState} /> : null}
      <ExchangePanel call={run.call} open={run.phase === "refused"} />
    </section>
  );
}
