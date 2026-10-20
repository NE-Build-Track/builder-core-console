# Core beliefs

The rules every change follows. Where a rule can be checked mechanically, a structural test checks it
(`web/tests/structure/`).

1. **Observe, never act.** The console reads. A page that could move money, change an allocation or
   run a job is out of scope until a decision says otherwise (D1).
2. **Every number has a source.** A value on a page comes from one named source read at a stated time.
   The console sums and joins what sources report; it never stores, corrects or invents money.
3. **Unknown is not healthy.** A check that cannot be made reads "unknown", never "ok". A failed read
   names the source and the problem. Missing cost is pending, not zero.
4. **Money is exact.** Amounts stay decimal strings end to end and are summed with bigint units of
   1e-18. Rounding happens only at display, and the exact value stays in `<data value>`.
5. **Batteries is the ledger; the engine is the attribution.** Money pages lead with Batteries; job
   and cost-class views lead with the engine; reconciliation compares the two (D8).
6. **Gaps are first-class.** What the stack cannot tell us is recorded once (`domain/gaps.ts` and
   [gaps.md](../references/gaps.md)) and cited next to the data it limits.
7. **Parse at the boundary.** Upstream bodies are parsed once, in the adapter, against the pinned
   shape. A shape change fails loudly as "unexpected response", naming the field.
8. **Boring, legible technology.** Server components, plain functions, small in-house helpers with
   tests. A dependency earns its place by being reasoned about in-repo.
9. **Semantic first, then style.** Pages are meaningful with styles off: landmarks, headings, tables
   with captions, `<time>`, `<data>`, `<dl>`. Styling is platform CSS and tokens on top (D5).
