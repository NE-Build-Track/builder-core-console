/**
 * How the Builder shows a runner's response (decision D20): the view follows the content type, never the
 * job type. Raw is always available. The only format-aware view is Rendered for OpenAI-style chat
 * events, which joins the reply's text pieces.
 */

export type OutputKind = "events" | "json" | "image" | "text" | "binary";

export function outputKind(contentType: string): OutputKind {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "text/event-stream") return "events";
  if (type === "application/json" || type.endsWith("+json")) return "json";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/") || type === "application/x-ndjson") return "text";
  return "binary";
}

export type SseEvent = { readonly event: string | null; readonly data: string };

/** Server-sent events from the text received so far. A trailing partial event is left for later. */
export function parseEvents(text: string): readonly SseEvent[] {
  const blocks = text.replace(/\r\n/g, "\n").split("\n\n");
  blocks.pop(); // the last block is complete only when the text ends with a blank line
  return blocks.flatMap((block) => {
    let event: string | null = null;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return data.length > 0 ? [{ event, data: data.join("\n") }] : [];
  });
}

export type ChatRender = {
  readonly content: string;
  readonly reasoning: string;
  readonly finishReason: string | null;
  readonly usage: { readonly prompt: number; readonly completion: number } | null;
  /** True once the stream sent `[DONE]`. */
  readonly done: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** OpenAI-style chat events joined into the reply. Events that are not chat chunks are skipped. */
export function renderChat(events: readonly SseEvent[]): ChatRender {
  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  let usage: ChatRender["usage"] = null;
  let done = false;
  for (const { data } of events) {
    if (data.trim() === "[DONE]") {
      done = true;
      continue;
    }
    let chunk: Record<string, unknown> | null;
    try {
      chunk = record(JSON.parse(data));
    } catch {
      continue;
    }
    const choices = Array.isArray(chunk?.choices) ? chunk.choices : [];
    for (const choice of choices) {
      const delta = record(record(choice)?.delta);
      if (typeof delta?.content === "string") content += delta.content;
      const thought = delta?.reasoning ?? delta?.reasoning_content;
      if (typeof thought === "string") reasoning += thought;
      const finish = record(choice)?.finish_reason;
      if (typeof finish === "string") finishReason = finish;
    }
    const counts = record(chunk?.usage);
    if (typeof counts?.prompt_tokens === "number" && typeof counts.completion_tokens === "number") {
      usage = { prompt: counts.prompt_tokens, completion: counts.completion_tokens };
    }
  }
  return { content, reasoning, finishReason, usage, done };
}

const IMAGE_URL = /^(https?:\/\/\S+|data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)$/i;

/** Every image URL in a JSON value: `url` fields, and any string that is an image link or data URL. */
export function imageUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    const looksLikeImage = /^data:image\//i.test(value) || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(value);
    if (looksLikeImage && IMAGE_URL.test(value) && !found.includes(value)) found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) imageUrls(item, found);
  } else {
    const object = record(value);
    if (object) {
      for (const [key, item] of Object.entries(object)) {
        if (key === "url" && typeof item === "string" && IMAGE_URL.test(item) && !found.includes(item)) found.push(item);
        else imageUrls(item, found);
      }
    }
  }
  return found;
}

const DATA_URI = /"(data:[a-z]+\/[a-z0-9+.-]+;base64,)([A-Za-z0-9+/=]+)"/gi;

/**
 * JSON text with each base64 data URI cut to its prefix and size. An inline image (FLUX schnell with
 * `sync_mode: true`) is hundreds of kilobytes of base64; the picture is shown above the JSON and Raw keeps
 * every byte, so the JSON view stays readable.
 */
export function shortenDataUris(text: string): string {
  return text.replace(DATA_URI, (_, prefix: string, data: string) => {
    const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
    return `"${prefix}… (${formatBytes(bytes)} inline, shown above; Raw has all of it)"`;
  });
}

/**
 * What to say when an image in a runner's answer does not load. A provider-hosted URL (fal's, for FLUX
 * schnell without `sync_mode`) expires on the provider's schedule: the job stays succeeded and its cost
 * stands, and the engine cannot reissue the file (builder-core engine.md#provider-hosted-assets).
 */
export function brokenImageNotice(url: string): string {
  if (/^data:/i.test(url)) return "This inline image could not be shown: the data the runner returned is not a picture the browser can read.";
  let host = "";
  try {
    host = ` (${new URL(url).host})`;
  } catch {
    host = "";
  }
  return `The provider no longer serves this image${host}. The job still succeeded and its cost stands; the engine never kept the file, so it cannot fetch it again.`;
}

/** Pretty JSON, or null when the text is not JSON. */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

export function formatBytes(count: number): string {
  if (count < 1024) return `${count} bytes`;
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`;
  return `${(count / (1024 * 1024)).toFixed(1)} MB`;
}
