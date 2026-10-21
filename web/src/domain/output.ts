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
