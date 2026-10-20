# Frontend

Stack: **Next.js 16 App Router (Cache Components), React 19, TypeScript (strict), Tailwind CSS v4,
shadcn/ui (radix-nova)**, `zod` at the Batteries and signer boundary, `openapi-fetch` for the engine.
Package manager **pnpm**, pinned by `packageManager` in `web/package.json`. The image runs Next's
standalone server. No Gyral (D4).

## Next.js

- This is Next.js 16.4. Read `web/node_modules/next/dist/docs/` before using an API you remember from
  an older version: request APIs are async, middleware is `proxy`, Turbopack is the default.
- Every page is a server component: a static heading and lede, then a `<Suspense>` child that calls
  `await connection()` and one `load*()` from `runtime/console.ts`. Nothing about the stack is
  prerendered. `searchParams` is awaited inside the Suspense child.
- No route handlers except `/livez`; no server actions (D1).
- Client components are islands: they receive data as props from server components and never import
  `runtime/`, `adapters/`, `config/` or `services/` (`tests/structure/layers.test.ts`).
- Open pages re-read the stack every 15 s with `router.refresh()` (`AutoRefresh`), while the tab is visible
  and no dialog is open. The server cache makes that cheap.

## Components

- `components/console/`: the console's design system (D14).
  - Server: `primitives.tsx` (`PageHead`, `Section`, `Grid`, `Tile`, `Ring`, `Bars`, `Spark`, `GapChip`,
    `Unreadable`, `ReadFrom`, `Empty`, `Truncated`, `PageSkeleton`), `values.tsx` (`Pill`, `Glyph`, `Amount`, `Usd`,
    `Ago`, `Id`, `Count`), `ticker.tsx`, `topology.tsx` (SMIL packets, no script), `icons.tsx` (the sprite),
    `page-view.tsx` (`PageView`, `Streamed`: route and Suspense transitions).
  - Client islands: `rail-nav.tsx` (the morphing highlight), `command-palette.tsx` (⌘K, a native `<dialog>`),
    `theme-toggle.tsx`, `count-up.tsx`, `usage-chart.tsx`, `signer-metric-tiles.tsx`, `toaster.tsx`,
    `copy-button.tsx`, `tooltips.tsx` (anchor positioning), `relative-time.tsx`, `ambient.tsx` (pointer glow,
    auto refresh, gap opener).
  - `vars.ts`: the only way markup sets style, as CSS custom properties (`style={vars({ p: 40 })}`).
- `components/ui/`: empty. shadcn is configured (`components.json`) and its colour names resolve to the
  console's tokens, so `pnpm exec shadcn add …` produces matching widgets if one is ever needed.
- Class names must not be Tailwind utility names, and keyframes are prefixed `bc-`: Tailwind adds its
  own styles to its names (`.ring` gained a box-shadow; `spin` rotated the verdict card).
  `tests/structure/taste.test.ts` checks both.

## HTML (semantic-html skill)

- Landmarks: skip link, one `<header>` banner with `<nav aria-label="Primary">`, one `<main id="main">`,
  one `<footer>`. One `<h1>` per page, from `PageHeading` in an `<hgroup>`.
- Sections are `<section aria-labelledby>` with their own `<h2>`; self-contained items (a component
  card, a grant, a job) are `<article>`.
- Tables have a `<TableCaption>` (sr-only is fine) and `scope` on every header cell.
- Values: amounts in `<data>`, instants in `<time dateTime>`, identifiers in `<code translate="no">`,
  user-supplied names in `<bdi>`, name/value pairs in `<dl>`, shares in `<meter>`.
- The job lookup is a GET `<form>` inside `<search>`.

## CSS (modern-css skill)

- `app/globals.css` declares `@layer theme, reset, tokens, base, layout, components, views, motion, utilities`
  (Tailwind's theme layer first, then the mock's layers). Tokens are oklch, derived with `color-mix()` and
  relative colour syntax, themed with `light-dark()` and `data-theme`.
- Motion lives in `@layer motion` inside `@media (prefers-reduced-motion: no-preference)`; scroll-driven
  reveals sit behind `@supports (animation-timeline: scroll())`.
- Logical properties, container queries inside components, `text-wrap: balance/pretty`,
  `scrollbar-gutter: stable`, reduced-motion kill switch.
- No inline styles, no hex colours (`tests/structure/taste.test.ts`).
