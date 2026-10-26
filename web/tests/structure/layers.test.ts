/**
 * The layer rules in ARCHITECTURE.md#layers, enforced. A failure message says what to do instead.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import { importsOf, internalTarget, packageOf, read, rel, SRC, sourceFiles } from "../support/source-files";

type Layer = "utils" | "domain" | "ports" | "config" | "adapters" | "services" | "runtime" | "components" | "ui-kit" | "app";

/** Which layers each layer may import. Everything else is a violation. */
const ALLOWED: Record<Layer, readonly Layer[]> = {
  utils: [],
  domain: ["utils"],
  ports: ["domain"],
  config: ["domain"],
  adapters: ["domain", "ports", "config", "utils"],
  services: ["domain", "ports", "utils"],
  runtime: ["adapters", "config", "domain", "ports", "services", "utils"],
  "ui-kit": [],
  components: ["domain", "utils", "ui-kit"],
  app: ["runtime", "components", "ui-kit", "domain", "services", "utils"],
};

/** Third-party packages and the only layers allowed to import them (ARCHITECTURE.md#third-party-boundaries). */
const CONFINED: Record<string, readonly Layer[]> = {
  "openapi-fetch": ["adapters"],
  "openid-client": ["adapters"],
  zod: ["domain"],
  "radix-ui": ["ui-kit"],
  "class-variance-authority": ["ui-kit"],
  cn: ["ui-kit"],
  "lucide-react": ["ui-kit", "components"],
  next: ["app", "components"],
  react: ["app", "components", "ui-kit"],
};

/** Packages no file may import. */
const BANNED: Record<string, string> = {
  "@gyral/core": "The console does not use Gyral (decision D4). Write a React server component.",
  "@gyral/http": "The console does not use Gyral (decision D4).",
  axios: "Use adapters/http.ts getText(); it enforces GET and timeouts.",
  "node-fetch": "Use adapters/http.ts getText().",
};

const SERVER_ONLY: readonly Layer[] = ["config", "adapters", "runtime"];

function layerOf(file: string): Layer {
  // Next.js requires its request proxy at src/proxy.ts; it is routing, so it follows the app layer's rules.
  if (path.relative(SRC, file) === "proxy.ts") return "app";
  const top = path.relative(SRC, file).split(path.sep)[0] as string;
  if (top === "components") return path.relative(SRC, file).startsWith(path.join("components", "ui")) ? "ui-kit" : "components";
  if (["utils", "domain", "ports", "config", "adapters", "services", "runtime", "app"].includes(top)) return top as Layer;
  throw new Error(`${rel(file)} is outside every layer. Put it in one of src/${Object.keys(ALLOWED).join(", src/")}.`);
}

const files = sourceFiles().filter((file) => !/\.test\.tsx?$/.test(file));

describe("layers", () => {
  it("every source file belongs to a layer", () => {
    for (const file of files) expect(() => layerOf(file)).not.toThrow();
  });

  it("imports only flow forward through the layers", () => {
    const violations: string[] = [];
    for (const file of files) {
      const from = layerOf(file);
      for (const specifier of importsOf(read(file))) {
        const target = internalTarget(file, specifier);
        if (!target) continue;
        const to = layerOf(target);
        if (to !== from && !ALLOWED[from].includes(to)) {
          violations.push(
            `${rel(file)} (${from}) imports ${specifier} (${to}). ${from} may import only: ${ALLOWED[from].join(", ") || "nothing internal"}. ` +
              `Move the shared code down a layer, or pass it in from runtime.`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("third-party packages stay in their layer", () => {
    const violations: string[] = [];
    for (const file of files) {
      const layer = layerOf(file);
      for (const specifier of importsOf(read(file))) {
        if (internalTarget(file, specifier)) continue;
        const pkg = packageOf(specifier);
        if (BANNED[pkg]) violations.push(`${rel(file)} imports ${pkg}: ${BANNED[pkg]}`);
        const allowed = CONFINED[pkg];
        if (allowed && !allowed.includes(layer)) {
          violations.push(`${rel(file)} imports ${pkg}, which is confined to ${allowed.join(", ")}. Go through that layer instead.`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("modules that can hold credentials never reach the browser bundle", () => {
    const missing = files
      .filter((file) => SERVER_ONLY.includes(layerOf(file)) && !file.endsWith(".test.ts"))
      .filter((file) => !/^import "server-only";/m.test(read(file)))
      .map((file) => `${rel(file)} must start with import "server-only"; it is in a layer that reads secrets (docs/SECURITY.md).`);
    expect(missing).toEqual([]);
  });

  it("client components never import server layers", () => {
    const violations: string[] = [];
    for (const file of files.filter((f) => /^["']use client["'];/m.test(read(f)))) {
      for (const specifier of importsOf(read(file))) {
        const target = internalTarget(file, specifier);
        if (target && ["runtime", "adapters", "config", "services"].includes(layerOf(target))) {
          violations.push(`${rel(file)} is a client component and imports ${specifier}. Fetch on the server and pass props.`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
