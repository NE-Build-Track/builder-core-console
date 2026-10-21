import { describe, expect, it } from "vitest";

import { formatBytes, imageUrls, outputKind, parseEvents, renderChat } from "./output";

describe("output views", () => {
  it("picks the view from the content type", () => {
    expect(outputKind("text/event-stream; charset=utf-8")).toBe("events");
    expect(outputKind("application/json")).toBe("json");
    expect(outputKind("image/png")).toBe("image");
    expect(outputKind("text/plain")).toBe("text");
    expect(outputKind("application/octet-stream")).toBe("binary");
  });

  it("parses complete events and leaves a partial one for later", () => {
    const text = 'data: {"a":1}\n\nevent: ping\ndata: x\ndata: y\n\ndata: {"part';
    expect(parseEvents(text)).toEqual([
      { event: null, data: '{"a":1}' },
      { event: "ping", data: "x\ny" },
    ]);
  });

  it("joins an OpenAI-style chat stream into the reply, with usage and the end", () => {
    const chunk = (delta: object, extra: object = {}) => `data: ${JSON.stringify({ choices: [{ delta, ...extra }] })}\n\n`;
    const text =
      chunk({ reasoning_content: "thinking" }) +
      chunk({ content: "Hello" }) +
      chunk({ content: ", world" }, { finish_reason: "stop" }) +
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } })}\n\n` +
      "data: [DONE]\n\n";
    expect(renderChat(parseEvents(text))).toEqual({ content: "Hello, world", reasoning: "thinking", finishReason: "stop", usage: { prompt: 12, completion: 3 }, done: true });
  });

  it("finds image URLs in a runner's JSON, once each", () => {
    const body = { images: [{ url: "https://fal.media/files/x.jpeg", width: 1024 }, { url: "https://fal.media/files/x.jpeg" }], seed: 1, timings: { inference: 0.4 }, page: "https://example.com/about" };
    expect(imageUrls(body)).toEqual(["https://fal.media/files/x.jpeg"]);
    expect(imageUrls({ preview: "data:image/png;base64,iVBORw0KGgo=" })).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});
