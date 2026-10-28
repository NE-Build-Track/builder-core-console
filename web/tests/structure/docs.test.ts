/**
 * The knowledge base stays true to the code (docs/PLANS.md, AGENTS.md):
 * gaps, data sources and routes are listed once in code and once in docs, and the two must agree;
 * links resolve; every doc is reachable from its index; exec plans keep their shape.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CATALOG } from "@/domain/catalog";
import { GAPS } from "@/domain/gaps";

import { read, REPO, rel, sourceFiles, walk } from "../support/source-files";

const docs = [path.join(REPO, "AGENTS.md"), path.join(REPO, "ARCHITECTURE.md"), path.join(REPO, "README.md"), ...walk(path.join(REPO, "docs"), (f) => f.endsWith(".md"))];

describe("docs", () => {
  it("lists every gap in docs/references/gaps.md, and nothing more", () => {
    const text = read(path.join(REPO, "docs", "references", "gaps.md"));
    const documented = [...text.matchAll(/^## (G\d+)\b/gm)].map((match) => match[1]);
    expect(documented).toEqual(GAPS.map((item) => item.id));
    for (const item of GAPS) expect(text, `${item.id} title in gaps.md`).toContain(`## ${item.id}: ${item.title}`);
  });

  it("documents every route in the catalog in data-sources.md", () => {
    const text = read(path.join(REPO, "docs", "references", "data-sources.md"));
    const missing = CATALOG.filter((entry) => !text.includes(`\`${entry.route}\``)).map((entry) => `${entry.source} ${entry.route}`);
    expect(missing).toEqual([]);
  });

  it("calls no upstream route that is missing from the catalog", () => {
    const routes: Set<string> = new Set(CATALOG.map((entry) => entry.route.replace(/^(GET|POST) /, "")));
    const adapters = sourceFiles().filter((file) => file.includes(`${path.sep}adapters${path.sep}`) && !file.endsWith(".test.ts"));
    const used = adapters.flatMap((file) =>
      [...read(file).matchAll(/["'`](?:\$\{[^}]+\})?(\/(?:v1|readyz|metrics|discovery)[^"'`?$]*)/g)].map((match) => ({
        file,
        route: match[1] as string,
      })),
    );
    const unknown = used.filter(({ route }) => !routes.has(route)).map(({ file, route }) => `${rel(file)} reads ${route}, which is not in src/domain/catalog.ts`);
    expect(used.length).toBeGreaterThan(10);
    expect(unknown).toEqual([]);
  });

  it("has no broken relative links", () => {
    const broken: string[] = [];
    for (const file of docs) {
      for (const match of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = (match[1] as string).split("#")[0] as string;
        if (!target || /^[a-z]+:/.test(target)) continue;
        if (!existsSync(path.resolve(path.dirname(file), target))) broken.push(`${path.relative(REPO, file)} links to ${match[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("reaches every doc from an index", () => {
    const indexed = new Set<string>();
    for (const file of docs) {
      for (const match of read(file).matchAll(/\]\(([^)\s#]+)/g)) {
        const target = match[1] as string;
        if (!/^[a-z]+:/.test(target)) indexed.add(path.resolve(path.dirname(file), target));
      }
    }
    const orphans = docs
      .filter((file) => !["AGENTS.md", "README.md"].includes(path.relative(REPO, file)))
      .filter((file) => !indexed.has(file))
      .map((file) => `${path.relative(REPO, file)} is not linked from any doc. Add it to its folder's index.md.`);
    expect(orphans).toEqual([]);
  });

  it("keeps exec plans in the shape docs/PLANS.md describes", () => {
    const sections = ["## Status", "## Goal", "## Acceptance", "## Progress", "## Decision log"];
    const plans = walk(path.join(REPO, "docs", "exec-plans"), (file) => /\/(active|completed)\/[^/]+\.md$/.test(file));
    const wrong = plans.flatMap((file) => {
      const text = read(file);
      const positions = sections.map((heading) => text.indexOf(`\n${heading}\n`));
      return positions.some((at, index) => at < 0 || (index > 0 && at < (positions[index - 1] as number)))
        ? [`${path.relative(REPO, file)} must have, in order: ${sections.join(", ")}`]
        : [];
    });
    expect(wrong).toEqual([]);
  });
});
