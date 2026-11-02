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

  it("says the same about each gap in gaps.md as in domain/gaps.ts: owner, impact and fix", () => {
    const text = read(path.join(REPO, "docs", "references", "gaps.md"));
    // code spans are formatting in the doc; the page shows the same words as plain text
    const sections = new Map([...text.split(/^## /m)].map((part) => [part.match(/^(G\d+):/)?.[1] ?? "", part.replace(/`/g, "")] as const));
    const drift = GAPS.flatMap((item) => {
      const section = sections.get(item.id) ?? "";
      const out: string[] = [];
      if (!section.includes(`**Impact.** ${item.impact}\n`)) out.push(`${item.id}: the impact in gaps.md differs from domain/gaps.ts. Make them the same words.`);
      if (!section.includes(`**Fix.** ${item.fix}\n`)) out.push(`${item.id}: the fix in gaps.md differs from domain/gaps.ts. Make them the same words.`);
      if (!section.includes(`**Owner.** ${item.owner}.`)) out.push(`${item.id}: gaps.md names another owner than ${item.owner}.`);
      if (!new RegExp(`^\\| \\[${item.id}\\]\\([^)]*\\) \\| ${item.owner} \\|`, "m").test(text)) out.push(`${item.id}: the table at the top of gaps.md has no open row for it with owner ${item.owner}.`);
      return out;
    });
    expect(drift).toEqual([]);
  });

  it("keeps a closed gap out of the open list, and every open gap out of Closed", () => {
    const text = read(path.join(REPO, "docs", "references", "gaps.md"));
    const closedPart = text.split(/^## Closed$/m)[1] ?? "";
    const closed = [...closedPart.matchAll(/^- \*\*(G\d+)\b/gm)].map((match) => match[1]);
    const open = new Set<string>(GAPS.map((item) => item.id));
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.filter((id) => id !== undefined && open.has(id)).map((id) => `${id} is under Closed in gaps.md but still open in domain/gaps.ts. Remove it from GAPS.`)).toEqual([]);
  });

  it("cites only test files that exist in a gap", () => {
    const missing = GAPS.flatMap((item) =>
      [...`${item.impact} ${item.fix}`.matchAll(/\b((?:tests|src)\/[\w/.-]+\.test\.ts)\b/g)]
        .map((match) => match[1] as string)
        .filter((file) => !existsSync(path.join(REPO, "web", file)))
        .map((file) => `${item.id} cites ${file}, which does not exist. Point at the test that holds the rule now.`),
    );
    expect(missing).toEqual([]);
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

  it("sends an operation reference in every documented call to a command that requires one (builder-core D57)", () => {
    // provision, fund allocation, rotate payment key, fund grant, create grant, issue key, rotate key: 422 without one
    const command = /\/v1\/admin\/(?:applications\/[^/\s"']+\/actors\/[^/\s"']+\/allocation(?:\/fund|\/rotate-key)?|grant\/fund|grants|keys(?:\/[^/\s"']+\/rotate)?)(?=["'\s]|$)/;
    const examples = [...docs, path.join(REPO, "deploy", "README.md"), path.join(REPO, "deploy", "keycloak", "README.md")].flatMap((file) =>
      read(file)
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .filter((line) => /\bcurl\b/.test(line) && /\s-d\s/.test(line) && command.test(line))
        .map((line) => ({ file, line })),
    );
    const script = path.join(REPO, "scripts", "demo-traffic.py");
    const calls = read(script)
      .split("\n")
      .filter((line) => line.includes('admin_json("POST"'))
      .map((line) => ({ file: script, line }));
    const missing = [...examples, ...calls].filter(({ line }) => !line.includes("operation_ref")).map(({ file, line }) => `${path.relative(REPO, file)}: ${line.trim().slice(0, 120)}`);
    expect(examples.length + calls.length).toBeGreaterThanOrEqual(4);
    expect(missing, "add an operation_ref to the body: a new one per command, the same one to repeat it safely").toEqual([]);
  });
});
