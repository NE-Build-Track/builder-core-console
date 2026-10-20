/**
 * Decision D1: the console only reads. The engine admin key could change anything (gap G8), so this
 * test is what keeps the console read-only. If you need a write, that is a new decision first.
 */
import { describe, expect, it } from "vitest";

import { read, rel, sourceFiles } from "../support/source-files";

const files = sourceFiles().filter((file) => !/\.test\.tsx?$/.test(file));

describe("read-only", () => {
  it("never calls a write method on the engine client", () => {
    const hits = files.flatMap((file) =>
      [...read(file).matchAll(/\.(POST|PUT|PATCH|DELETE)\s*\(/g)].map(
        (match) => `${rel(file)} calls .${match[1]}(). The console is read-only (decision D1); use GET.`,
      ),
    );
    expect(hits).toEqual([]);
  });

  it("sends every raw request through getText, with method GET", () => {
    const hits = files
      .filter((file) => !file.endsWith("adapters/http.ts"))
      .filter((file) => /\bfetch\s*\(/.test(read(file)))
      .map((file) => `${rel(file)} calls fetch() directly. Use getText() from src/adapters/http.ts.`);
    const http = files.find((file) => file.endsWith("adapters/http.ts"));
    expect(http && read(http)).toMatch(/method:\s*"GET"/);
    const methods = files.flatMap((file) =>
      [...read(file).matchAll(/method:\s*["'](\w+)["']/g)]
        .filter((match) => match[1] !== "GET")
        .map((match) => `${rel(file)} sets method ${match[1]}. Only GET is allowed.`),
    );
    expect([...hits, ...methods]).toEqual([]);
  });

  it("exposes no write route handlers or server actions", () => {
    const hits = files.flatMap((file) => {
      const text = read(file);
      const out: string[] = [];
      if (/^["']use server["']/m.test(text)) out.push(`${rel(file)} declares server actions. The console has no writes.`);
      for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g)) {
        out.push(`${rel(file)} exports a ${match[1]} route handler. The console has no writes.`);
      }
      return out;
    });
    expect(hits).toEqual([]);
  });

  it("forms only GET", () => {
    const hits = files.flatMap((file) =>
      [...read(file).matchAll(/<form\b[^>]*>/g)]
        .filter((match) => !/method="get"/.test(match[0]))
        .map(() => `${rel(file)} has a <form> without method="get".`),
    );
    expect(hits).toEqual([]);
  });
});
