# Design

**In one sentence:** a signal-room console: a glass top bar and a quiet rail, each page a stack of
instrument panels, one ion-cyan accent for "live", and every number traceable to its source.

The design is the accepted mock, [design-docs/mock/console-mock.html](design-docs/mock/console-mock.html)
(decision D14). Open it in a browser to see every page with example data. `web/src/app/globals.css`
is that stylesheet, layer for layer.

## Principles

- **Dark first, both themes always.** Six colour roles in oklch with `light-dark()`; every other tint
  is derived with `color-mix()`. The system theme applies until someone picks one with the toggle
  (kept in this browser only, applied before first paint).
- **Status is a word and a shape.** Healthy, Warning, Failing, Unknown, each with a glyph whose
  shape differs (circle, triangle, diamond, ring), never colour alone.
- **Numbers.** Tabular figures. Exact amounts keep a bright head and a dim tail (`$0.044953`
  followed by a dim `749066932028`), and the full value is in `<data value>`. Tile headlines count up
  for show; the exact value is always in the markup.
- **Instruments, not decoration.** Gauges show a share of something real (slots free, grant spent);
  bars rank fees; the topology shows the stack's own components, and packets only move along paths
  whose ends are healthy.
- **Density.** Grids wrap by `--min`; tables scroll in their own box; long lists collapse into
  `<details>` (the network has about 100 apps). The page never scrolls sideways.
- **Motion with a purpose, always optional.** Page and data transitions (React `<ViewTransition>`),
  staggered entry, the verdict's turning border, count-ups, the ticker, scroll reveals. All of it
  stops under `prefers-reduced-motion`.

## Data honesty in the design

| Mock | Real console |
| --- | --- |
| Signer sparklines over 10 minutes | Samples since this page opened; the stack keeps no history (D6) |
| A ticker of example tickets | Batteries' newest applied tickets |
| Every actor's money in every application | Money for `CONSOLE_APPLICATION_ID` only (gap G9) |
| Payer escrow with deposit and reserve | Shown only when Batteries' on-chain listener runs (gap G7) |
| One offering card per app | Cards for the nine apps with most capacity; all apps in a table |
