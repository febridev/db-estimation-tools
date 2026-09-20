# Oracle index sizing

Client-side estimator for Oracle B-Tree index segments, TEMP sort space, and UNDO
exposure during an online build. Next.js (App Router) + TypeScript + Tailwind,
shadcn-style primitives, no backend and no database connection.

```bash
npm install
npm run dev      # http://localhost:3000
npm run test     # 12 unit tests over the math and the parser
npm run build    # static export into ./out
```

`next.config.mjs` sets `output: "export"`, so `npm run build` produces a folder you
can drop on any static host.

## Layout

```
app/page.tsx             state container, wires the four panels together
lib/types.ts             input and result contracts
lib/sizing.ts            the whole math engine (pure functions, unit tested)
lib/explain.ts           turns one estimate into a step-by-step derivation
lib/ddl-parser.ts        CREATE TABLE reader + per-datatype width inference
lib/ddl-generator.ts     CREATE INDEX output and pre-flight queries
components/panels/*      DDL input, key selector, parameters, results, SQL
components/ui/*          card, button, and form primitives
```

## Checking the numbers by hand

The result panel is followed by a derivation: each stage shows the symbolic formula,
the same formula with this run's numbers substituted, and the outcome. "Copy as text"
dumps the whole chain so it can be pasted next to a manual calculation.

Two rules keep the panel honest:

* `lib/explain.ts` never recomputes anything. It reads `EstimatorResult.intermediates`,
  so the shown arithmetic is the arithmetic that ran.
* Every constant the panel quotes lives in `CONSTANTS` at the top of `lib/sizing.ts`
  (fixed block header, bytes per ITL, entry header, branch pointer, prefix overhead,
  sort row overhead, merge factor, undo margin). Change a value there and both the
  estimate and the displayed formula follow.

If a hand calculation disagrees, compare stage by stage — the difference is almost
always one of: block overhead at a non-default INITRANS, the ROWID length byte on a
non-unique index, or extent rounding at the last step.

## What changed against spec v2.0.0

The spec's structure is kept. Seven formulas were replaced because they produce
estimates that are wrong in ways a DBA would only discover mid-build.

**1 · ROWID width is conditional, not 6 bytes.** Restricted ROWID (6 B) applies to a
non-partitioned table and to LOCAL indexes. A GLOBAL index carries the extended
ROWID (10 B). At a billion rows the old constant under-counted by about 4 GB.
See `rowidLength()`.

**2 · Non-unique indexes pay for their ROWID.** In a non-unique index the ROWID joins
the key and gets its own length byte; a unique index does not. `UNIQUE` is now an
input and feeds `entrySize()`.

**3 · COMPRESS is modelled from NDV, not a 0.6–0.8 ratio.** Prefix compression stores
each distinct prefix once per leaf block and leaves a 2-byte pointer behind, so the
saving is driven by how many rows share a prefix value. When the prefix is nearly
unique, the index gets *bigger* — the fixed ratio could never express that. Each key
column now takes a distinct-value count, and the app warns when compression backfires.
See `compressedEntrySize()`.

**4 · The 1.25 catch-all factor is split into its real parts.** Branch blocks are now
counted by walking the tree up level by level (`branchBlocks()`), extent rounding is an
explicit granularity setting, and block-split slack is a separate percentage that
defaults to 5% — a fresh `CREATE INDEX` packs leaf blocks tight, so 25% was systematically
over-ordering storage.

**5 · TEMP is sized from the sort set, not from the finished index.** Required TEMP is
`rows × (entry size + 12 B sort overhead) × merge factor`, raised for parallel degree.
`1.2 × index size` under-estimates wide composite keys, which is precisely the case
where a build dies on ORA-1652.

**6 · UNDO applies to ONLINE builds only.** A plain `CREATE INDEX` writes almost no undo
of its own; the exposure is the journal table of an online build plus concurrent DML
from other sessions. The UNDO panel now asks for DML rate and build duration instead of
free GB alone, and reminds you to raise `UNDO_RETENTION` to at least the build duration,
since ORA-01555 fires on retention, not on free space.

**7 · Block overhead scales with INITRANS.** `113 + 24 × INITRANS` bytes. That returns
161 at INITRANS 2 — near the spec's flat 160 — but stays correct at other block sizes
and transaction slot counts.

## Known limits

Estimates assume uniform column values and no row migration. Before running anything in
production, replace the defaults with `AVG_COL_LEN` and `NUM_DISTINCT` from
`USER_TAB_COL_STATISTICS` (the pre-flight tab generates that query), and cross-check
with `DBMS_SPACE.CREATE_INDEX_COST` when the database is reachable. Bitmap, function-based,
domain, and IOT overflow indexes are out of scope.
