/**
 * "The request / The response" (decision D18): the REST call behind an action, with keys hidden, and the
 * same call as curl. A call that has not been sent yet (the review step) shows only its request.
 */
import { curlOf, showBody, type Exchange } from "@/domain/exchange";

import { CopyAction } from "../copy-button";

export type ShownCall = Pick<Exchange, "method" | "path" | "body"> & Partial<Pick<Exchange, "status" | "response" | "problem" | "ms">>;

function statusState(status: number | null | undefined): "ok" | "warn" | "bad" | "unknown" {
  if (status === null || status === undefined) return "unknown";
  if (status < 300) return "ok";
  if (status < 500) return "warn";
  return "bad";
}

export function ExchangePanel({ call, open = false, title }: { readonly call: ShownCall; readonly open?: boolean; readonly title?: string }) {
  const sent = call.status !== undefined;
  const requestBody = showBody(call.body);
  const responseBody = showBody(call.response);
  return (
    <details className="exchange" open={open}>
      <summary>
        <span className="exchange-title">{title ?? (sent ? "The request and response" : "The request that will be sent")}</span>
        <code className="exchange-line" translate="no">
          <b>{call.method}</b> {call.path}
        </code>
        {sent ? (
          <span className="pill" data-state={statusState(call.status)}>
            <i className="glyph" />
            {call.status ?? "no response"}
            {call.ms !== undefined ? ` · ${call.ms} ms` : ""}
          </span>
        ) : null}
      </summary>
      <div className="exchange-body">
        <p className="exchange-k">Headers</p>
        <pre className="code" translate="no">
          {"Authorization: Bearer lpk_…  (your key, never shown)"}
          {call.body !== undefined ? "\ncontent-type: application/json" : ""}
        </pre>
        {call.body !== undefined ? (
          <>
            <p className="exchange-k">Request body</p>
            <pre className="code" translate="no">{requestBody}</pre>
          </>
        ) : null}
        {sent ? (
          <>
            <p className="exchange-k">Response{call.problem ? `: ${call.problem}` : ""}</p>
            <pre className="code" translate="no">{responseBody || "(empty body)"}</pre>
          </>
        ) : null}
        <div className="row-actions">
          <CopyAction value={curlOf(call)} label="as curl" />
        </div>
      </div>
    </details>
  );
}
