/** Helpers for structural tests: list source files and their imports. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const WEB = path.resolve(import.meta.dirname, "../..");
export const REPO = path.resolve(WEB, "..");
export const SRC = path.join(WEB, "src");

export function walk(dir: string, accept: (file: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out.sort();
}

export function sourceFiles(): string[] {
  return walk(SRC, (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts"));
}

export function rel(file: string): string {
  return path.relative(WEB, file);
}

export function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Module specifiers of every static import/export-from in a file. */
export function importsOf(text: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) specifiers.push((match[1] ?? match[2]) as string);
  return specifiers;
}

/** Resolve an import to a path under src/ ("@/x" or a relative path), or null for a package. */
export function internalTarget(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return path.join(SRC, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(from), specifier);
  return null;
}

/** The package name of a bare import ("next/link" → "next", "@scope/pkg/x" → "@scope/pkg"). */
export function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] as string);
}
