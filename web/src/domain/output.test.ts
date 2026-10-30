import { describe, expect, it } from "vitest";

import { brokenImageNotice, formatBytes, imageUrls, outputKind, parseEvents, renderChat, shortenDataUris } from "./output";

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

describe("images in a JSON answer (builder-core D59)", () => {
  const jpeg = `data:image/jpeg;base64,${"/9j/4AAQSkZJRg".repeat(40)}==`;
  const inline = { images: [{ url: jpeg, width: 1024, height: 768, content_type: "image/jpeg" }], seed: 1, has_nsfw_concepts: [false] };

  it("finds FLUX schnell's inline image (sync_mode: true returns a data URI in images[].url)", () => {
    expect(imageUrls(inline)).toEqual([jpeg]);
  });

  it("shortens data URIs in the JSON view, saying how large each is, and leaves everything else as it was", () => {
    const shown = shortenDataUris(JSON.stringify(inline, null, 2));
    expect(shown).not.toContain(jpeg);
    expect(shown).toMatch(/"url": "data:image\/jpeg;base64,… \(\d+ bytes inline, shown above; Raw has all of it\)"/);
    expect(shown).toContain('"width": 1024');
    expect(shortenDataUris('{"url": "https://v3.fal.media/files/x.jpg"}')).toBe('{"url": "https://v3.fal.media/files/x.jpg"}');
  });

  it("says a provider's image that no longer loads is gone, while the job and its cost stand", () => {
    expect(brokenImageNotice("https://v3.fal.media/files/lion/x.jpg")).toBe(
      "The provider no longer serves this image (v3.fal.media). The job still succeeded and its cost stands; the engine never kept the file, so it cannot fetch it again.",
    );
    expect(brokenImageNotice(jpeg)).toBe("This inline image could not be shown: the data the runner returned is not a picture the browser can read.");
  });
});
