/**
 * Decisions D1 and D15–D18: the console's pages only read; writes happen only in the Operator and
 * Builder areas, behind a sign-in, through two adapters, after a review. The engine admin key could do
 * anything (gap G8), so these rules are what keep a write from appearing anywhere else.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ACTIONS } from "@/domain/operator";
import { CATALOG } from "@/domain/catalog";

import { importsOf, internalTarget, read, rel, SRC, sourceFiles } from "../support/source-files";

const files = sourceFiles().filter((file) => !/\.test\.tsx?$/.test(file));
const at = (file: string) => path.relative(SRC, file).split(path.sep).join("/");
/** Module path without extension, so a file and an import of it compare equal. */
const mod = (file: string) => at(file).replace(/\.tsx?$/, "");
const under = (file: string, prefixes: readonly string[]) =>
  prefixes.some((prefix) => {
    const bare = prefix.replace(/\.tsx?$/, "");
    return mod(file) === bare || (prefix.endsWith("/") && at(file).startsWith(prefix));
  });

/** The only files that send a non-GET request to the engine. */
const WRITE_ADAPTERS = ["adapters/engine/writer.ts", "adapters/engine/keyed.ts"];
/** Where writes may be started from: the two areas, their components, and the one server-action file. */
const WRITE_AREAS = ["app/operator/", "app/builder/", "app/actions.ts", "components/console/act/", "components/console/run/"];
/** Plans and presets name a method without sending anything. */
const NAMES_METHODS = ["domain/operator.ts", "domain/builder.ts"];
const READ_ONLY_PAGES = ["app/page.tsx", "app/network/", "app/money/", "app/users/", "app/usage/", "app/jobs/", "app/sources/"];

describe("writes", () => {
  it("never calls a write method on the typed engine client", () => {
    const hits = files.flatMap((file) =>
      [...read(file).matchAll(/\.(POST|PUT|PATCH|DELETE)\s*\(/g)].map((match) => `${rel(file)} calls .${match[1]}(). Send writes through adapters/engine/writer.ts or keyed.ts.`),
    );
    expect(hits).toEqual([]);
  });

  it("sends raw requests only from adapters/http.ts (GET) and the write adapters", () => {
    const allowed = ["adapters/http.ts", ...WRITE_ADAPTERS];
    const hits = files
      .filter((file) => !under(file, allowed) && !under(file, ["components/console/run/"]))
      .filter((file) => /\bfetch\s*\(/.test(read(file)))
      .map((file) => `${rel(file)} calls fetch() directly. Reads go through getText(); writes through the write adapters.`);
    const http = files.find((file) => at(file) === "adapters/http.ts");
    expect(http && read(http)).toMatch(/method:\s*"GET"/);
    expect(hits).toEqual([]);
  });

  it("names a write method only in the write adapters, plans, presets and the Builder's run", () => {
    const allowed = [...WRITE_ADAPTERS, ...NAMES_METHODS, "components/console/run/", "app/builder/"];
    const hits = files
      .filter((file) => !under(file, allowed))
      .flatMap((file) =>
        [...read(file).matchAll(/method:\s*["'](\w+)["']/g)].filter((match) => match[1] !== "GET").map((match) => `${rel(file)} sets method ${match[1]}.`),
      );
    expect(hits).toEqual([]);
  });

  it("keeps server actions in app/actions.ts and write route handlers in the Builder area", () => {
    const hits = files.flatMap((file) => {
      const text = read(file);
      const out: string[] = [];
      if (/^["']use server["']/m.test(text) && at(file) !== "app/actions.ts") out.push(`${rel(file)} declares server actions. Put them in src/app/actions.ts.`);
      for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g)) {
        if (!under(file, ["app/builder/"])) out.push(`${rel(file)} exports a ${match[1]} route handler. Only the Builder's job run may.`);
      }
      return out;
    });
    expect(hits).toEqual([]);
  });

  it("posts forms only in the writing areas", () => {
    const hits = files
      .filter((file) => !under(file, WRITE_AREAS))
      .flatMap((file) =>
        [...read(file).matchAll(/<form\b[^>]*>/g)].filter((match) => !/method="get"/.test(match[0])).map(() => `${rel(file)} has a <form> that is not method="get".`),
      );
    expect(hits).toEqual([]);
  });

  it("keeps the read-only pages away from every write path", () => {
    const writePaths = ["runtime/operator.ts", "runtime/builder.ts", "app/actions.ts", ...WRITE_ADAPTERS, "components/console/act/", "components/console/run/"];
    const hits = files
      .filter((file) => under(file, READ_ONLY_PAGES))
      .flatMap((file) =>
        importsOf(read(file))
          .map((specifier) => internalTarget(file, specifier))
          .filter((target): target is string => target !== null && under(target, writePaths))
          .map((target) => `${rel(file)} imports ${mod(target)}. The existing pages stay read-only (D1).`),
      );
    expect(hits).toEqual([]);
  });

  it("builds the writer only in runtime/operator.ts and keyed engines only in runtime/session.ts", () => {
    const owners: Record<string, string> = { "adapters/engine/writer": "runtime/operator", "adapters/engine/keyed": "runtime/session" };
    const hits = files.flatMap((file) =>
      importsOf(read(file))
        .map((specifier) => internalTarget(file, specifier))
        .filter((target): target is string => target !== null && mod(target) in owners && owners[mod(target)] !== mod(file))
        .map((target) => `${rel(file)} imports ${mod(target)}; only ${owners[mod(target)]} may.`),
    );
    expect(hits).toEqual([]);
  });

  it("lists every Operator action's route in the catalog", () => {
    const routes = new Set<string>(CATALOG.map((entry) => entry.route));
    const missing = Object.values(ACTIONS)
      .map((spec) => spec.route)
      .filter((route) => !routes.has(route));
    expect(missing).toEqual([]);
  });
});
