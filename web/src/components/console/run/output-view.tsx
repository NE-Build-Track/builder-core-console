"use client";

import { useState } from "react";

import { brokenImageNotice, formatBytes, imageUrls, outputKind, parseEvents, prettyJson, renderChat, shortenDataUris } from "@/domain/output";

export type Output = {
  readonly contentType: string;
  readonly text: string;
  readonly bytes: number;
  /** An object URL for an image or binary response, made once the body is complete. */
  readonly blobUrl: string | null;
  readonly streaming: boolean;
};

type View = "rendered" | "pretty" | "image" | "raw";

const VIEWS: Record<ReturnType<typeof outputKind>, readonly View[]> = {
  events: ["rendered", "raw"],
  json: ["pretty", "raw"],
  image: ["image", "raw"],
  text: ["raw"],
  binary: ["raw"],
};

const VIEW_LABELS: Record<View, string> = { rendered: "Rendered", pretty: "JSON", image: "Image", raw: "Raw" };

/**
 * The runner's response (decision D20): the view follows the content type, Raw is always there, and
 * the one format-aware view is Rendered for chat events, which joins the reply's text.
 */
export function OutputView({ output }: { readonly output: Output }) {
  const kind = outputKind(output.contentType);
  const views = VIEWS[kind];
  const [chosen, setChosen] = useState<View>(views[0] ?? "raw");
  const view = views.includes(chosen) ? chosen : "raw";
  return (
    <div className="output">
      <div className="window-row">
        <span className="rate-line">
          <code translate="no">{output.contentType}</code> · {formatBytes(output.bytes)}
          {output.streaming ? " · arriving…" : ""}
        </span>
        {views.length > 1 ? (
          <div className="views" role="group" aria-label="Output view">
            {views.map((item) => (
              <button key={item} type="button" aria-pressed={item === view} onClick={() => setChosen(item)}>
                {VIEW_LABELS[item]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Body output={output} view={view} kind={kind} />
    </div>
  );
}

function Body({ output, view, kind }: { readonly output: Output; readonly view: View; readonly kind: ReturnType<typeof outputKind> }) {
  if (view === "rendered") {
    const chat = renderChat(parseEvents(output.text));
    return (
      <div className="panel">
        {chat.reasoning ? (
          <details className="numbers">
            <summary>Thinking ({chat.reasoning.length} characters)</summary>
            <p className="output-text muted">{chat.reasoning}</p>
          </details>
        ) : null}
        <p className={output.streaming ? "output-text caret" : "output-text"}>{chat.content || (output.streaming ? "" : "(no text in these events)")}</p>
        {chat.usage ? (
          <p className="provenance">
            {chat.usage.prompt} prompt tokens · {chat.usage.completion} completion tokens{chat.finishReason ? ` · finished: ${chat.finishReason}` : ""}
          </p>
        ) : null}
      </div>
    );
  }
  if (view === "pretty") {
    const pretty = prettyJson(output.text);
    let images: string[] = [];
    try {
      images = imageUrls(JSON.parse(output.text));
    } catch {
      images = [];
    }
    return (
      <>
        {images.length > 0 ? (
          <div className="output-images">
            {images.map((url) => (
              <AnswerImage key={url} url={url} />
            ))}
          </div>
        ) : null}
        <pre className="code" translate="no">
          {shortenDataUris(pretty ?? output.text)}
        </pre>
      </>
    );
  }
  if (view === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- the response body itself, as an object URL
    return output.blobUrl ? <img className="output-single" src={output.blobUrl} alt="The image the runner returned" /> : <p className="empty-state">Receiving the image…</p>;
  }
  if (kind === "image" || kind === "binary") {
    return (
      <p className="empty-state">
        {formatBytes(output.bytes)} of <code>{output.contentType}</code>.{" "}
        {output.blobUrl ? (
          <a href={output.blobUrl} download="runner-output">
            Save it
          </a>
        ) : null}
      </p>
    );
  }
  return (
    <pre className="code" translate="no">
      {output.text || (output.streaming ? "…" : "(empty body)")}
    </pre>
  );
}

/**
 * An image named in the runner's JSON: inline (a data URI, FLUX schnell with `sync_mode`) or a URL the
 * model provider hosts, which expires on the provider's schedule. A failed load says so instead of
 * showing a broken image (builder-core engine.md#provider-hosted-assets).
 */
function AnswerImage({ url }: { readonly url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <p className="empty-state" role="status">
        {brokenImageNotice(url)}
      </p>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a runner's inline data or a provider's temporary URL, not a static asset
  return <img src={url} alt="An image the runner returned" loading="lazy" onError={() => setBroken(true)} />;
}
