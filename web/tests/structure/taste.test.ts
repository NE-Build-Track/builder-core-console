/**
 * Taste invariants for markup and styling (docs/FRONTEND.md, docs/DESIGN.md): semantic HTML and
 * platform CSS rules that review comments would otherwise repeat. shadcn's generated kit is exempt.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { read, rel, sourceFiles, SRC, WEB } from "../support/source-files";

const MAX_LINES = 400;
const ours = sourceFiles().filter((file) => !file.includes(`${path.sep}components${path.sep}ui${path.sep}`));
const markup = ours.filter((file) => file.endsWith(".tsx"));
const pages = markup.filter((file) => file.endsWith(`${path.sep}page.tsx`));

function violations(files: readonly string[], pattern: RegExp, message: string): string[] {
  return files.flatMap((file) => [...read(file).matchAll(pattern)].map(() => `${rel(file)}: ${message}`));
}

describe("taste", () => {
  it("keeps files small enough to read in one go", () => {
    const long = ours
      .map((file) => ({ file, lines: read(file).split("\n").length }))
      .filter(({ lines }) => lines > MAX_LINES)
      .map(({ file, lines }) => `${rel(file)} has ${lines} lines (max ${MAX_LINES}). Split it by section or concern.`);
    expect(long).toEqual([]);
  });

  it("styles with classes and tokens; markup sets only custom properties, through vars()", () => {
    expect([
      ...violations(markup, /\sstyle=\{(?!vars\()/g, "inline style. Set data with style={vars({ … })} and style it in globals.css."),
      ...violations(markup, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?=["'])/g, "hex colour. Use an oklch token from globals.css."),
    ]).toEqual([]);
    const css = read(path.join(SRC, "app", "globals.css"));
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it("starts every page with one PageHead, and the PageHead is the only h1", () => {
    const wrong = pages
      .filter((file) => !read(file).includes("<PageHead"))
      .map((file) => `${rel(file)} has no <PageHead>. Every page starts with one (it renders the h1).`);
    expect(wrong).toEqual([]);
    expect(violations(markup, /<h1\b/g, "").length).toBe(1);
  });

  it("captions every table and scopes every header cell", () => {
    const out: string[] = [];
    for (const file of markup) {
      const text = read(file);
      const tables = (text.match(/<table\b/g) ?? []).length;
      const captions = (text.match(/<caption\b/g) ?? []).length;
      if (tables !== captions) out.push(`${rel(file)}: ${tables} tables but ${captions} captions. Add a <caption> (className="sr-only" is fine).`);
      for (const match of text.matchAll(/<th\b(?![^>]*\bscope=)[^>]*>/g)) {
        out.push(`${rel(file)}: <th> without scope ("col" or "row"): ${match[0].slice(0, 60)}`);
      }
    }
    expect(out).toEqual([]);
  });

  it("uses links for navigation and buttons for actions", () => {
    expect([
      ...violations(markup, /href="#"/g, 'href="#". Link somewhere real, or use a <button>.'),
      ...violations(markup, /<(div|span)\b[^>]*onClick=/g, "a clickable div/span. Use <button> or <a>."),
      ...violations(markup, /<button\b(?![^>]*\btype=)[^>]*>/g, "a <button> without an explicit type."),
    ]).toEqual([]);
  });

  it("labels sections by their heading", () => {
    expect(violations(markup, /<section\b(?![^>]*aria-labelledby)[^>]*>/g, "a <section> with no aria-labelledby heading.")).toEqual([]);
  });

  it("keeps the design system's CSS in cascade layers, themed both ways, with motion gated", () => {
    const css = read(path.join(WEB, "src", "app", "globals.css"));
    expect(css.startsWith("/*")).toBe(true);
    expect(css).toMatch(/@layer theme, reset, tokens, base, layout, components, views, motion, utilities;/);
    expect(css).toMatch(/light-dark\(/);
    expect(css).toMatch(/:root\[data-theme="light"\]/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("never names a console class after a Tailwind utility (Tailwind would add its own styles to it)", () => {
    // Found the hard way: the mock's .ring picked up Tailwind's ring box-shadow, and its @keyframes spin
    // was replaced by Tailwind's rotating spin.
    const utilities = ["ring", "shadow", "border", "outline", "blur", "filter", "transform", "truncate", "container", "hidden", "invisible", "block", "inline", "flex", "table", "fixed", "absolute", "sticky", "italic", "underline", "uppercase", "rounded", "transition", "animate"];
    const css = read(path.join(SRC, "app", "globals.css"));
    const clashes = utilities.filter((name) => new RegExp(`\\.${name}(?![\\w-])`).test(css));
    const keyframes = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1] as string).filter((name) => !name.startsWith("bc-"));
    expect(clashes.map((name) => `globals.css styles .${name}, which is also a Tailwind utility. Rename the class.`)).toEqual([]);
    expect(keyframes.map((name) => `@keyframes ${name} must be prefixed bc- so Tailwind's keyframes cannot replace it.`)).toEqual([]);
  });

  it("gates every client animation loop behind reduced motion", () => {
    const loops = markup.filter((file) => /requestAnimationFrame|startViewTransition/.test(read(file)));
    const ungated = [...loops, ...ours.filter((file) => file.endsWith(".ts") && /startViewTransition/.test(read(file)))]
      .filter((file) => !/prefers-reduced-motion/.test(read(file)))
      .map((file) => `${rel(file)} animates from script without checking prefers-reduced-motion.`);
    expect(ungated).toEqual([]);
  });
});
