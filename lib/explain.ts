import { GIB } from "./sizing";
import type { DerivationStep, EstimatorInput, EstimatorResult } from "./types";

const n = (v: number, digits = 0) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

/**
 * Turn one estimate into an auditable derivation.
 *
 * Nothing is recomputed here: every number comes from the engine result, so the
 * panel can never drift from what the engine actually did.
 */
export function buildDerivation(
  input: EstimatorInput,
  r: EstimatorResult,
): DerivationStep[] {
  const m = r.intermediates;
  const steps: DerivationStep[] = [];

  steps.push({
    id: "overhead",
    title: "Block overhead",
    formula: "OH = 113 + 24 × INITRANS",
    substitution: `OH = 113 + 24 × ${input.initTrans}`,
    value: `${n(r.blockOverhead)} bytes`,
    note: "113 B of fixed cache, transaction and leaf headers, plus one 24 B interested-transaction slot per INITRANS.",
  });

  steps.push({
    id: "ubs",
    title: "Usable space per block",
    formula: "UBS = (BlockSize − OH) × (1 − PCTFREE ÷ 100)",
    substitution: `UBS = (${n(input.blockSize)} − ${n(r.blockOverhead)}) × (1 − ${input.pctFree} ÷ 100)`,
    value: `${n(r.usableBlockSpace, 1)} bytes`,
  });

  steps.push({
    id: "key",
    title: "Key bytes",
    formula: "K = Σ (AvgLenᵢ + LenByteᵢ),  LenByte = 1 if AvgLen < 127 else 3",
    substitution: `K = ${
      input.columns.map((c) => `(${c.avgLength} + ${c.avgLength < 127 ? 1 : 3})`).join(" + ") || "0"
    }`,
    value: `${n(m.keyBytes)} bytes`,
    note: input.columns.map((c) => `${c.name} ${c.avgLength} B`).join(" · "),
  });

  steps.push({
    id: "entry",
    title: "Index entry size",
    formula: "E = EntryHeader(2) + ROWID + ROWIDLenByte + K",
    substitution: `E = 2 + ${r.rowidLength} + ${m.rowidLenByte} + ${n(m.keyBytes)}`,
    value: `${n(r.entrySize, 1)} bytes`,
    note: `${r.rowidLength === 10 ? "Extended ROWID (global index)" : "Restricted ROWID"}; ${
      input.unique ? "unique index, so the ROWID needs no length byte" : "non-unique index, so the ROWID joins the key and costs 1 extra byte"
    }.`,
  });

  if (input.compressPrefix > 0) {
    steps.push({
      id: "compress",
      title: `Effective entry under COMPRESS ${input.compressPrefix}`,
      formula:
        "E′ = (E − P + 2) + (P + 4) ÷ RowsPerPrefix,  RowsPerPrefix = Rows ÷ PrefixNDV",
      substitution: `E′ = (${n(r.entrySize, 1)} − ${n(m.prefixBytes)} + 2) + (${n(m.prefixBytes)} + 4) ÷ ${n(m.rowsPerPrefix, 2)}`,
      value: `${n(r.effectiveEntrySize, 1)} bytes`,
      note: `Prefix has ${n(m.prefixNdv)} distinct values across ${n(input.totalRows)} rows, so each prefix is stored once for every ${n(m.rowsPerPrefix, 2)} entries.`,
    });
  }

  steps.push({
    id: "epb",
    title: "Entries per leaf block",
    formula: "EPB = ⌊ UBS ÷ E′ ⌋",
    substitution: `EPB = ⌊ ${n(r.usableBlockSpace, 1)} ÷ ${n(r.effectiveEntrySize, 1)} ⌋`,
    value: n(r.entriesPerBlock),
  });

  steps.push({
    id: "leaf",
    title: "Leaf blocks",
    formula: "Leaf = ⌈ Rows ÷ EPB ⌉",
    substitution: `Leaf = ⌈ ${n(input.totalRows)} ÷ ${n(r.entriesPerBlock)} ⌉`,
    value: n(r.leafBlocks),
  });

  steps.push({
    id: "branch",
    title: "Branch blocks",
    formula:
      "Fanout = ⌊ UBS ÷ (E′ − ROWID + 6) ⌋;  each level = ⌈ level below ÷ Fanout ⌉ until 1 block remains",
    substitution: `Fanout = ⌊ ${n(r.usableBlockSpace, 1)} ÷ ${n(m.branchEntrySize, 1)} ⌋ = ${n(m.branchFanout)}`,
    value: `${n(r.branchBlocks)} blocks, height ${r.btreeHeight}`,
    note: "Counted level by level rather than taken as a flat percentage of the leaf count.",
  });

  steps.push({
    id: "raw",
    title: "Raw segment size",
    formula: "Raw = (Leaf + Branch + 1) × BlockSize × (1 + Split ÷ 100)",
    substitution: `Raw = (${n(r.leafBlocks)} + ${n(r.branchBlocks)} + ${m.segmentHeaderBlocks}) × ${n(input.blockSize)} × (1 + ${input.splitOverheadPct} ÷ 100)`,
    value: `${n(r.rawBytes / GIB, 3)} GB`,
    note: "The +1 block is the segment header. Split slack covers leaf splits from later DML.",
  });

  steps.push({
    id: "alloc",
    title: "Allocated size",
    formula: "Size = ⌈ Raw ÷ ExtentSize ⌉ × ExtentSize",
    substitution: `Size = ⌈ ${n(r.rawBytes)} ÷ ${n(input.extentSizeBytes)} ⌉ × ${n(input.extentSizeBytes)}`,
    value: `${n(r.estimatedGb, 3)} GB`,
    note: "Oracle hands out whole extents, so the segment is rounded up.",
  });

  steps.push({
    id: "temp",
    title: "TEMP required",
    formula: "TEMP = Rows × (E + 12) × MergeFactor × ParallelFactor",
    substitution: `TEMP = ${n(input.totalRows)} × (${n(r.entrySize, 1)} + 12) × ${m.mergeFactor} × ${n(m.parallelFactor, 2)}`,
    value: `${n(r.temp.requiredGb, 3)} GB`,
    note: `Sized from the uncompressed sort stream (${n(m.sortBytes / GIB, 2)} GB before merge overhead), not from the finished index. Parallel factor is 1 + 0.1 × (degree − 1), capped at 2.`,
  });

  if (input.online) {
    steps.push({
      id: "undo",
      title: "UNDO required",
      formula: "UNDO = DMLRate × BuildHours × UndoPerRow × 1.2",
      substitution: `UNDO = ${n(input.concurrentDmlPerHour)} × ${n(m.buildHours, 2)} × ${n(input.undoBytesPerDml)} × ${m.undoMarginFactor}`,
      value: `${n(r.undo.requiredGb, 3)} GB`,
      note: "Only an ONLINE build is exposed: the journal table keeps concurrent DML readable for the whole build.",
    });
  } else {
    steps.push({
      id: "undo",
      title: "UNDO required",
      formula: "UNDO ≈ 0 for an offline build",
      substitution: "No journal table, so only dictionary undo is written.",
      value: "0 GB",
    });
  }

  steps.push({
    id: "risk",
    title: "Risk verdict",
    formula: "Ratio = Free ÷ Required — safe ≥ 1.5×, tight ≥ 1.0×, otherwise it fails",
    substitution: `TEMP ${n(input.availableTempGb, 2)} ÷ ${n(r.temp.requiredGb, 3)} = ${
      Number.isFinite(r.temp.ratio) ? n(r.temp.ratio, 2) : "∞"
    }×`,
    value: r.temp.level,
  });

  return steps;
}

/** Plain-text dump of the derivation, for pasting into a spreadsheet or a ticket. */
export function derivationToText(
  input: EstimatorInput,
  steps: DerivationStep[],
): string {
  const head = [
    `Index ${input.indexName} on ${input.tableName} (${input.columns.map((c) => c.name).join(", ")})`,
    `Block size ${input.blockSize} B | rows ${input.totalRows.toLocaleString("en-US")} | PCTFREE ${input.pctFree} | INITRANS ${input.initTrans}`,
    `Unique ${input.unique} | ${input.partitionScope} | COMPRESS ${input.compressPrefix} | parallel ${input.parallelDegree} | online ${input.online}`,
    "",
  ];
  const body = steps.flatMap((s) => [
    `${s.title}`,
    `  formula : ${s.formula}`,
    `  numbers : ${s.substitution}`,
    `  result  : ${s.value}`,
    ...(s.note ? [`  note    : ${s.note}`] : []),
    "",
  ]);
  return [...head, ...body].join("\n");
}
