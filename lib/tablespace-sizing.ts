import type {
  CapacityInput,
  CapacityPlanResult,
  CapacityTable,
  IndexSizeResult,
  TableSizeResult,
  TempEstimate,
  UndoEstimate,
} from "./tablespace-types";

const GIB = 1024 ** 3;

/**
 * Oracle block overhead: fixed header + ITL slots.
 * Fixed part  : ~113 bytes (cache layer + txn header + data header)
 * Variable    : 24 bytes per INITRANS slot
 */
export function blockOverhead(initTrans: number): number {
  return 113 + 24 * Math.max(1, initTrans);
}

/** Usable space per block after overhead and PCTFREE. */
export function usableBlockSpace(blockSize: number, pctFree: number, initTrans: number): number {
  return (blockSize - blockOverhead(initTrans)) * (1 - pctFree / 100);
}

/**
 * Oracle row overhead in a heap table:
 * - Row header: 3 bytes (flag + lock + column count)
 * - Column length byte per column: 1 byte each (simplified; 3 for >250 byte values)
 */
export function rowOverhead(numColumns: number): number {
  return 3 + numColumns; // 3 byte row header + 1 length byte per column
}

/** Length byte for an index entry column. */
export function lengthByte(avgLength: number): number {
  return avgLength < 127 ? 1 : 3;
}

/**
 * Calculate the default average row length from column definitions:
 * Sum of column avg lengths + Oracle row overhead.
 */
export function calculateDefaultAvgRowLength(columns: { avgLength: number }[]): {
  columnBytes: number;
  overheadBytes: number;
  totalBytes: number;
} {
  const columnBytes = columns.reduce((sum, c) => sum + c.avgLength, 0);
  const overheadBytes = rowOverhead(columns.length);
  return {
    columnBytes,
    overheadBytes,
    totalBytes: columnBytes + overheadBytes,
  };
}

/**
 * Calculate default rows per block based on usable block space and row length:
 * floor(Usable Block Space / Average Row Length).
 */
export function calculateDefaultRowsPerBlock(
  blockSize: number,
  pctFree: number,
  initTrans: number,
  avgRowLength: number,
): {
  usableSpace: number;
  blockOverheadBytes: number;
  rowsPerBlock: number;
} {
  const overhead = blockOverhead(initTrans);
  const usable = usableBlockSpace(blockSize, pctFree, initTrans);
  const rowsPerBlock = Math.max(1, Math.floor(usable / Math.max(1, avgRowLength)));
  return {
    usableSpace: usable,
    blockOverheadBytes: overhead,
    rowsPerBlock,
  };
}

/**
 * Calculate data tablespace size for a single table.
 */
function calculateTableSize(
  table: CapacityTable,
  input: CapacityInput,
): TableSizeResult {
  const {
    blockSize,
    pctFree,
    initTrans,
    retentionDays,
    rowsPerDay,
    totalRows,
    extentSizeBytes,
    bufferPct,
    tableOverrides,
  } = input;

  const tableKey = table.schema ? `${table.schema}.${table.name}` : table.name;
  const override = tableOverrides?.[tableKey] || tableOverrides?.[table.name];

  // Inferred average row length breakdown
  const { columnBytes, overheadBytes, totalBytes: defaultAvgRowLength } =
    calculateDefaultAvgRowLength(table.columns);

  const isCustomRowLength =
    override?.avgRowLength !== undefined &&
    override.avgRowLength > 0 &&
    override.avgRowLength !== defaultAvgRowLength;

  const avgRowLength =
    override?.avgRowLength !== undefined && override.avgRowLength > 0
      ? override.avgRowLength
      : defaultAvgRowLength;

  // Usable space per block
  const usable = usableBlockSpace(blockSize, pctFree, initTrans);

  // Rows per block
  const defaultRowsPerBlock = Math.max(1, Math.floor(usable / Math.max(1, avgRowLength)));

  const isCustomRowsPerBlock =
    override?.rowsPerBlock !== undefined &&
    override.rowsPerBlock > 0 &&
    override.rowsPerBlock !== defaultRowsPerBlock;

  const rowsPerBlock =
    override?.rowsPerBlock !== undefined && override.rowsPerBlock > 0
      ? override.rowsPerBlock
      : defaultRowsPerBlock;

  // One-time bulk / migration rows for this table
  const tableBulkRows =
    override?.bulkRows !== undefined && override.bulkRows >= 0
      ? override.bulkRows
      : input.bulkRows !== undefined && input.bulkRows >= 0
      ? input.bulkRows
      : (input.totalRows ?? 0);

  // Daily retention rows (0 if retentionDays or rowsPerDay is 0)
  const retentionRows =
    input.retentionDays > 0 && input.rowsPerDay > 0
      ? input.rowsPerDay * input.retentionDays
      : 0;

  // Total rows sized: one-time incoming bulk rows + daily retention rows
  const totalRowsOverRetention = tableBulkRows + retentionRows;

  // Total blocks
  const totalBlocks = Math.ceil(totalRowsOverRetention / rowsPerBlock);

  // Raw bytes
  const rawBytes = totalBlocks * blockSize;

  // Extent-aligned allocation with buffer
  const withBuffer = rawBytes * (1 + bufferPct / 100);
  const allocatedBytes = Math.ceil(withBuffer / extentSizeBytes) * extentSizeBytes;
  const allocatedGb = allocatedBytes / GIB;

  return {
    tableName: tableKey,
    avgRowLength,
    defaultAvgRowLength,
    columnBytes,
    overheadBytes,
    rowsPerBlock,
    defaultRowsPerBlock,
    totalBlocks,
    rawBytes,
    allocatedBytes,
    allocatedGb,
    bulkRows: tableBulkRows,
    retentionRows,
    totalRowsOverRetention,
    usableBlockSpace: usable,
    isCustomRowLength,
    isCustomRowsPerBlock,
  };
}

/**
 * Calculate index tablespace size for one index.
 */
function calculateIndexSize(
  index: { name: string; tableName: string; columns: string[]; unique: boolean },
  table: CapacityTable,
  totalRows: number,
  input: CapacityInput,
): IndexSizeResult {
  const { blockSize, pctFree, initTrans, extentSizeBytes, bufferPct } = input;

  // Resolve index columns to their avg lengths from the table definition
  const resolvedColumns = index.columns.map((colName) => {
    const col = table.columns.find(
      (c) => c.name.toUpperCase() === colName.toUpperCase(),
    );
    return {
      name: colName,
      avgLength: col?.avgLength ?? 8, // fallback 8 bytes
    };
  });

  // Index entry:
  // - 2 byte entry header (flag + lock)
  // - ROWID: 6 bytes (restricted) for non-unique, stored separately for unique
  // - Key: sum of (avgLength + lengthByte) per column
  const entryHeader = 2;
  const rowidLen = 6;
  const rowidLenByte = index.unique ? 0 : 1; // unique stores ROWID outside key
  const keyBytes = resolvedColumns.reduce(
    (sum, c) => sum + c.avgLength + lengthByte(c.avgLength),
    0,
  );
  const entrySize = entryHeader + rowidLen + rowidLenByte + keyBytes;

  // Usable block space
  const usable = usableBlockSpace(blockSize, pctFree, initTrans);

  // Entries per leaf block
  const entriesPerBlock = Math.max(1, Math.floor(usable / Math.max(1, entrySize)));

  // Leaf blocks
  const leafBlocks = Math.ceil(totalRows / entriesPerBlock);

  // Branch blocks (walk upward)
  const branchEntrySize = entrySize - rowidLen + 6; // separator key + block pointer
  const fanout = Math.max(2, Math.floor(usable / Math.max(1, branchEntrySize)));
  let level = leafBlocks;
  let branchBlk = 0;
  while (level > 1) {
    level = Math.ceil(level / fanout);
    branchBlk += level;
  }

  // Total blocks (leaf + branch + 1 segment header)
  const totalBlocks = leafBlocks + branchBlk + 1;
  const rawBytes = totalBlocks * blockSize;
  const withBuffer = rawBytes * (1 + bufferPct / 100);
  const allocatedBytes = Math.ceil(withBuffer / extentSizeBytes) * extentSizeBytes;
  const allocatedGb = allocatedBytes / GIB;

  return {
    indexName: index.name,
    tableName: table.schema ? `${table.schema}.${table.name}` : table.name,
    columns: index.columns,
    unique: index.unique,
    entrySize,
    entriesPerBlock,
    leafBlocks,
    branchBlocks: branchBlk,
    totalBlocks,
    allocatedBytes,
    allocatedGb,
    totalRows,
  };
}

/**
 * Calculate TEMP tablespace needed for bulk data loading.
 *
 * During a bulk load Oracle needs TEMP for:
 * 1. Sorting index key streams for each index being maintained
 * 2. Hash joins / merge operations if parallel insert is used
 *
 * Conservative formula: largest single-table sort footprint across all tables,
 * multiplied by a merge factor and parallel overhead.
 */
function calculateTemp(
  tables: CapacityTable[],
  tableSizes: TableSizeResult[],
  indexSizes: IndexSizeResult[],
  input: CapacityInput,
): TempEstimate {
  const SORT_ROW_OVERHEAD = 12; // Oracle sort record overhead
  const MERGE_FACTOR = 1.5;     // one-pass write + partial merge read

  // Total rows across all tables for the bulk load
  const totalBulkRows = tableSizes.reduce((sum, t) => sum + t.totalRowsOverRetention, 0);

  // Sort cost is driven by the largest index being rebuilt
  let maxSortBytes = 0;
  for (const idx of indexSizes) {
    const sortBytes = idx.totalRows * (idx.entrySize + SORT_ROW_OVERHEAD);
    maxSortBytes = Math.max(maxSortBytes, sortBytes);
  }

  // If no indexes, use the largest table's row data as sort footprint
  if (maxSortBytes === 0) {
    for (const ts of tableSizes) {
      const sortBytes = ts.totalRowsOverRetention * (ts.avgRowLength + SORT_ROW_OVERHEAD);
      maxSortBytes = Math.max(maxSortBytes, sortBytes);
    }
  }

  const pxFactor = Math.min(2, 1 + 0.1 * Math.max(0, input.parallelDegree - 1));
  const tempBytes = maxSortBytes * MERGE_FACTOR * pxFactor;
  const requiredGb = tempBytes / GIB;

  const detail =
    `Largest sort set: ${(maxSortBytes / GIB).toFixed(2)} GB. ` +
    `Merge factor: ${MERGE_FACTOR}×. ` +
    (input.parallelDegree > 1
      ? `Parallel ${input.parallelDegree} adds ${Math.round((pxFactor - 1) * 100)}% overhead. `
      : "") +
    `Total bulk rows: ${totalBulkRows.toLocaleString()}.`;

  return { sortBytes: maxSortBytes, requiredGb, detail };
}

/**
 * Calculate UNDO tablespace needed for bulk data loading.
 *
 * During bulk DML, each uncommitted row generates undo. The key driver is
 * batch size (rows per COMMIT) × undo per row. Oracle needs to hold undo
 * for the entire uncommitted batch until COMMIT.
 */
function calculateUndo(
  tableSizes: TableSizeResult[],
  input: CapacityInput,
): UndoEstimate {
  const { bulkBatchSize, undoBytesPerRow } = input;
  const UNDO_MARGIN = 1.2; // 20% margin for undo block overhead

  // Undo for one batch = batchSize × undoPerRow
  const batchUndoBytes = bulkBatchSize * undoBytesPerRow * UNDO_MARGIN;

  // For parallel loads, each PX slave has its own transaction
  const parallelBatches = Math.max(1, input.parallelDegree);
  const totalUndoBytes = batchUndoBytes * parallelBatches;
  const requiredGb = totalUndoBytes / GIB;

  const detail =
    `Batch size: ${bulkBatchSize.toLocaleString()} rows. ` +
    `Undo per row: ${undoBytesPerRow} bytes. ` +
    `Per-batch undo: ${(batchUndoBytes / (1024 * 1024)).toFixed(1)} MB (with 20% margin). ` +
    (parallelBatches > 1
      ? `${parallelBatches} parallel streams: ${(totalUndoBytes / (1024 * 1024)).toFixed(1)} MB concurrent undo.`
      : `Single stream.`);

  return { batchUndoBytes, requiredGb, detail };
}

/**
 * Main entry point: compute the full tablespace capacity plan.
 */
export function calculateCapacityPlan(
  tables: CapacityTable[],
  input: CapacityInput,
): CapacityPlanResult {
  const warnings: string[] = [];

  // Calculate per-table data sizes
  const tableSizes: TableSizeResult[] = tables.map((t) =>
    calculateTableSize(t, input),
  );

  // Calculate per-index sizes
  const indexSizes: IndexSizeResult[] = [];
  for (const table of tables) {
    const tableSize = tableSizes.find(
      (ts) =>
        ts.tableName === (table.schema ? `${table.schema}.${table.name}` : table.name),
    );
    const totalRows = tableSize?.totalRowsOverRetention ?? 0;

    for (const idx of table.indexes) {
      // Validate that index columns exist in the table
      const missingCols = idx.columns.filter(
        (col) => !table.columns.some((c) => c.name.toUpperCase() === col.toUpperCase()),
      );
      if (missingCols.length > 0) {
        warnings.push(
          `Index ${idx.name}: columns [${missingCols.join(", ")}] not found in table ${table.name}. Using 8-byte fallback.`,
        );
      }

      indexSizes.push(calculateIndexSize(idx, table, totalRows, input));
    }
  }

  // Aggregate totals
  const totalDataGb = tableSizes.reduce((sum, t) => sum + t.allocatedGb, 0);
  const totalIndexGb = indexSizes.reduce((sum, i) => sum + i.allocatedGb, 0);
  const grandTotalGb = totalDataGb + totalIndexGb;

  // Buffer is already applied in individual calculations, so these are the same
  const totalDataWithBufferGb = totalDataGb;
  const totalIndexWithBufferGb = totalIndexGb;
  const grandTotalWithBufferGb = grandTotalGb;

  // TEMP and UNDO
  const temp = calculateTemp(tables, tableSizes, indexSizes, input);
  const undo = calculateUndo(tableSizes, input);

  // Warnings
  if (input.retentionDays > 365) {
    warnings.push("Retention period is over 1 year. Consider partitioning by date for easier lifecycle management.");
  }
  const totalEvaluatedRows = tableSizes.reduce(
    (sum, t) => sum + t.totalRowsOverRetention,
    0,
  );
  if (totalEvaluatedRows === 0) {
    warnings.push(
      "Both bulk incoming rows and daily retention rows are 0 — please specify row count in Bulk Load or Data Volume.",
    );
  }

  return {
    tables: tableSizes,
    indexes: indexSizes,
    totalDataGb,
    totalIndexGb,
    grandTotalGb,
    totalDataWithBufferGb,
    totalIndexWithBufferGb,
    grandTotalWithBufferGb,
    bufferPct: input.bufferPct,
    temp,
    undo,
    warnings,
  };
}
