import type {
  EstimatorInput,
  EstimatorResult,
  IndexColumn,
  RiskAssessment,
  RiskLevel,
} from "./types";

export const GIB = 1024 ** 3;

/** Constants the derivation panel quotes, kept in one place. */
export const CONSTANTS = {
  BLOCK_FIXED_HEADER: 113,
  BYTES_PER_ITL: 24,
  ENTRY_HEADER: 2,
  BRANCH_POINTER: 6,
  PREFIX_ENTRY_OVERHEAD: 4,
  PREFIX_POINTER: 2,
  SORT_ROW_OVERHEAD: 12,
  MERGE_FACTOR: 1.5,
  UNDO_MARGIN: 1.2,
  SEGMENT_HEADER_BLOCKS: 1,
} as const;

/**
 * Block overhead for a B-Tree block.
 *
 * Spec v2.0 used a flat 160 bytes. That number is only right for an 8K block at
 * INITRANS 2: it is really a fixed header plus one ITL slot per INITRANS.
 * Fixed part  : cache layer + transaction header + kdxle leaf header ~= 113 bytes
 * Variable part: 24 bytes per interested-transaction-list slot
 */
export function blockOverhead(initTrans: number): number {
  return (
    CONSTANTS.BLOCK_FIXED_HEADER + CONSTANTS.BYTES_PER_ITL * Math.max(1, initTrans)
  );
}

/** Bytes Oracle spends on the length prefix of one stored column value. */
export function lengthByte(avgLength: number): number {
  return avgLength < 127 ? 1 : 3;
}

/**
 * ROWID width inside an index entry.
 *
 * Restricted ROWID (6 bytes) is used for indexes on a non-partitioned table and
 * for LOCAL partitioned indexes, because the partition is implied by the index
 * segment. A GLOBAL index has to carry the extended ROWID (10 bytes) so it can
 * point at any partition. Spec v2.0 hardcoded 6 and under-counted global
 * indexes by 4 bytes per row — roughly 4 GB per billion rows.
 */
export function rowidLength(partitionScope: EstimatorInput["partitionScope"]): number {
  return partitionScope === "GLOBAL" ? 10 : 6;
}

/** Uncompressed size of one index entry, in bytes. */
export function entrySize(
  columns: IndexColumn[],
  partitionScope: EstimatorInput["partitionScope"],
  unique: boolean,
): number {
  const header = CONSTANTS.ENTRY_HEADER; // flag byte + lock byte
  const rowid = rowidLength(partitionScope);
  // In a non-unique index the ROWID is appended to the key, so it gets its own
  // length byte. A unique index stores it outside the key and pays nothing.
  const rowidLenByte = unique ? 0 : 1;
  const key = columns.reduce(
    (sum, c) => sum + c.avgLength + lengthByte(c.avgLength),
    0,
  );
  return header + rowid + rowidLenByte + key;
}

export function usableBlockSpace(
  blockSize: number,
  pctFree: number,
  initTrans: number,
): number {
  return (blockSize - blockOverhead(initTrans)) * (1 - pctFree / 100);
}

/**
 * Average per-row cost under COMPRESS n.
 *
 * Prefix compression stores each distinct prefix value once per leaf block and
 * replaces it with a 2-byte prefix pointer in every suffix entry. So the saving
 * depends entirely on how many rows share a prefix value — never on a fixed
 * 0.6-0.8 ratio. When the prefix is close to unique, COMPRESS makes the index
 * larger, which the fixed-ratio model in spec v2.0 could not express.
 */
export function compressedEntrySize(
  columns: IndexColumn[],
  compressPrefix: number,
  totalRows: number,
  uncompressed: number,
): {
  effective: number;
  rowsPerPrefix: number;
  prefixBytes: number;
  prefixNdv: number;
} {
  if (compressPrefix <= 0) {
    return {
      effective: uncompressed,
      rowsPerPrefix: 1,
      prefixBytes: 0,
      prefixNdv: 0,
    };
  }

  const prefixCols = columns.slice(0, compressPrefix);
  const prefixBytes = prefixCols.reduce(
    (sum, c) => sum + c.avgLength + lengthByte(c.avgLength),
    0,
  );
  // Distinct prefix combinations, bounded by the row count.
  const prefixNdv = Math.min(
    totalRows,
    Math.max(1, prefixCols.reduce((p, c) => p * Math.max(1, c.ndv), 1)),
  );
  const rowsPerPrefix = totalRows / prefixNdv;

  const prefixEntry = prefixBytes + CONSTANTS.PREFIX_ENTRY_OVERHEAD;
  const suffix = uncompressed - prefixBytes + CONSTANTS.PREFIX_POINTER;
  const effective = suffix + prefixEntry / Math.max(1, rowsPerPrefix);
  return { effective, rowsPerPrefix, prefixBytes, prefixNdv };
}

/** Walk the B-Tree upwards to count branch blocks instead of guessing a flat %. */
export function branchBlocks(
  leafBlocks: number,
  usable: number,
  branchEntrySize: number,
): { blocks: number; height: number; fanout: number } {
  const fanout = Math.max(2, Math.floor(usable / branchEntrySize));
  let level = leafBlocks;
  let blocks = 0;
  let height = 1;
  while (level > 1) {
    level = Math.ceil(level / fanout);
    blocks += level;
    height += 1;
  }
  return { blocks, height, fanout };
}

function classify(ratio: number): RiskLevel {
  if (ratio >= 1.5) return "SAFE";
  if (ratio >= 1.0) return "WARNING";
  return "CRITICAL";
}

function assess(
  requiredGb: number,
  availableGb: number,
  headline: string,
  detail: string,
): RiskAssessment {
  const ratio = requiredGb <= 0 ? Infinity : availableGb / requiredGb;
  return {
    requiredGb,
    availableGb,
    ratio,
    level: classify(ratio),
    headline,
    detail,
  };
}

export function estimate(input: EstimatorInput): EstimatorResult {
  const warnings: string[] = [];
  const {
    blockSize,
    totalRows,
    columns,
    pctFree,
    initTrans,
    unique,
    partitionScope,
    compressPrefix,
    splitOverheadPct,
    parallelDegree,
    online,
    extentSizeBytes,
  } = input;

  const overhead = blockOverhead(initTrans);
  const usable = usableBlockSpace(blockSize, pctFree, initTrans);
  const raw = entrySize(columns, partitionScope, unique);
  const { effective, rowsPerPrefix, prefixBytes, prefixNdv } = compressedEntrySize(
    columns,
    compressPrefix,
    totalRows,
    raw,
  );

  if (compressPrefix > 0 && effective >= raw) {
    warnings.push(
      `COMPRESS ${compressPrefix} enlarges this index: the prefix repeats only ${rowsPerPrefix.toFixed(2)} times per value. Compress fewer columns, or reorder the key so the low-cardinality column leads.`,
    );
  }
  if (compressPrefix >= columns.length && unique) {
    warnings.push(
      "A unique index cannot compress its full key. Oracle allows at most (columns - 1) prefix columns here.",
    );
  }
  if (input.structure === "REVERSE" && compressPrefix > 0) {
    warnings.push("REVERSE and COMPRESS cannot be combined on the same index (ORA-25193).");
  }
  if (input.structure === "REVERSE") {
    warnings.push(
      "A reverse key index cannot serve range scans, and its random insert pattern usually needs a higher PCTFREE.",
    );
  }
  if (effective > usable) {
    warnings.push(
      "One index entry does not fit in a block at this PCTFREE. Lower PCTFREE, use a larger block size, or shorten the key.",
    );
  }

  const entriesPerBlock = Math.max(1, Math.floor(usable / Math.max(1, effective)));
  const leafBlocks = Math.ceil(totalRows / entriesPerBlock);

  // A branch entry carries the separator key plus a 6-byte block pointer.
  const branchEntry =
    effective - rowidLength(partitionScope) + CONSTANTS.BRANCH_POINTER;
  const branch = branchBlocks(leafBlocks, usable, Math.max(1, branchEntry));

  const segmentBlocks =
    leafBlocks + branch.blocks + CONSTANTS.SEGMENT_HEADER_BLOCKS;
  const rawBytes = segmentBlocks * blockSize * (1 + splitOverheadPct / 100);
  const allocatedBytes =
    Math.ceil(rawBytes / extentSizeBytes) * extentSizeBytes;
  const estimatedGb = allocatedBytes / GIB;

  // ---- TEMP -------------------------------------------------------------
  // The sort works on the key stream, not on the finished index, so it is sized
  // from rows x (entry + sort overhead). Wide composite keys need far more TEMP
  // than "1.2 x index size" suggests, and the merge phase reads the run back.
  const sortBytes = totalRows * (raw + CONSTANTS.SORT_ROW_OVERHEAD);
  const mergeFactor = CONSTANTS.MERGE_FACTOR; // one-pass write + partial merge read
  const pxFactor = Math.min(2, 1 + 0.1 * Math.max(0, parallelDegree - 1));
  const tempGb = (sortBytes * mergeFactor * pxFactor) / GIB;

  const temp = assess(
    tempGb,
    input.availableTempGb,
    "TEMP tablespace",
    `Sort set is ${(sortBytes / GIB).toFixed(2)} GB before merge overhead${
      parallelDegree > 1 ? `, raised ${Math.round((pxFactor - 1) * 100)}% for PARALLEL ${parallelDegree}` : ""
    }.`,
  );

  // ---- UNDO -------------------------------------------------------------
  // A plain CREATE INDEX writes almost no undo of its own. The exposure is an
  // ONLINE build: the journal table records concurrent DML for the whole build,
  // and that DML is what fills UNDO and what raises ORA-01555.
  let undo: RiskAssessment;
  const hours = input.buildMinutes / 60;
  if (online) {
    const undoBytes =
      input.concurrentDmlPerHour * hours * input.undoBytesPerDml * CONSTANTS.UNDO_MARGIN;
    undo = assess(
      undoBytes / GIB,
      input.availableUndoGb,
      "UNDO tablespace",
      `${input.concurrentDmlPerHour.toLocaleString()} rows/hour of concurrent DML across a ${input.buildMinutes}-minute online build, plus 20% margin.`,
    );
    if (hours * 3600 > 900) {
      warnings.push(
        `Set UNDO_RETENTION to at least ${Math.ceil(hours * 3600)} seconds (the build duration) or the online build can still fail with ORA-01555 while free UNDO looks healthy.`,
      );
    }
  } else {
    undo = assess(
      0,
      input.availableUndoGb,
      "UNDO tablespace",
      "An offline CREATE INDEX generates only dictionary undo. UNDO pressure comes from other sessions, not from this DDL.",
    );
  }

  return {
    usableBlockSpace: usable,
    blockOverhead: overhead,
    rowidLength: rowidLength(partitionScope),
    entrySize: raw,
    effectiveEntrySize: effective,
    entriesPerBlock,
    leafBlocks,
    branchBlocks: branch.blocks,
    btreeHeight: branch.height,
    totalBlocks: segmentBlocks,
    rawBytes,
    allocatedBytes,
    estimatedGb,
    compressionRatio: effective / raw,
    temp,
    undo,
    warnings,
    intermediates: {
      keyBytes: columns.reduce((sum, c) => sum + c.avgLength + lengthByte(c.avgLength), 0),
      rowidLenByte: unique ? 0 : 1,
      entryHeader: CONSTANTS.ENTRY_HEADER,
      prefixBytes,
      prefixNdv,
      rowsPerPrefix,
      branchEntrySize: branchEntry,
      branchFanout: branch.fanout,
      segmentHeaderBlocks: CONSTANTS.SEGMENT_HEADER_BLOCKS,
      sortRowOverhead: CONSTANTS.SORT_ROW_OVERHEAD,
      sortBytes,
      mergeFactor,
      parallelFactor: pxFactor,
      undoMarginFactor: online ? CONSTANTS.UNDO_MARGIN : 0,
      buildHours: hours,
    },
  };
}
