import type { BlockSize } from "./types";

/** A column parsed from a CREATE TABLE DDL for capacity planning. */
export interface CapacityColumn {
  name: string;
  dataType: string;
  /** Average stored byte length (derived from DDL type declaration). */
  avgLength: number;
  nullable: boolean;
}

/** A table parsed from DDL input, including its indexes. */
export interface CapacityTable {
  schema?: string;
  name: string;
  columns: CapacityColumn[];
  /** Primary key columns, if declared inline. */
  pkColumns: string[];
  /** Indexes extracted from CREATE INDEX statements. */
  indexes: CapacityIndex[];
}

/** An index parsed from CREATE INDEX or inline UNIQUE / PK constraints. */
export interface CapacityIndex {
  name: string;
  tableName: string;
  columns: string[];
  unique: boolean;
}

/** Custom user overrides for a specific table. */
export interface TableRowOverride {
  /** User-specified average row length in bytes. */
  avgRowLength?: number;
  /** User-specified rows per block. */
  rowsPerBlock?: number;
  /** Whether rows per block was manually customized by the user. */
  customRowsPerBlock?: boolean;
  /** Custom one-time bulk rows specifically for this table. */
  bulkRows?: number;
}

/** User-controlled parameters for the capacity plan. */
export interface CapacityInput {
  blockSize: BlockSize;
  /** Percentage of each block reserved (PCTFREE). Default 10%. */
  pctFree: number;
  /** INITRANS per block. Default 2. */
  initTrans: number;
  /** Extra buffer percentage on top of calculated size. Default 10%. */
  bufferPct: number;
  /** Data retention period in days (0 if sizing solely for one-time bulk load). Default 180. */
  retentionDays: number;
  /** Expected rows ingested per day (0 if sizing solely for one-time bulk load). */
  rowsPerDay: number;
  /** One-time bulk insert / migration / incoming data rows. Sized even when retention is 0. */
  bulkRows?: number;
  /** Legacy alias for bulkRows / initial rows. */
  totalRows?: number;
  /** Extent granularity in bytes. Default 1 MB. */
  extentSizeBytes: number;
  /** Parallel degree for bulk operations (affects TEMP). */
  parallelDegree: number;
  /** Average undo footprint per row in bytes. Default 400. */
  undoBytesPerRow: number;
  /** Bulk load batch size (rows per batch). Default 50,000. */
  bulkBatchSize: number;
  /** User overrides per table for avgRowLength, rowsPerBlock, and bulkRows. */
  tableOverrides?: Record<string, TableRowOverride>;
}

/** Sizing result for a single table. */
export interface TableSizeResult {
  tableName: string;
  /** Average row length in bytes (sum of column avg lengths + row overhead). */
  avgRowLength: number;
  /** Default average row length inferred from DDL before any user override. */
  defaultAvgRowLength: number;
  /** Column data bytes sum. */
  columnBytes: number;
  /** Row overhead bytes (3-byte header + column length bytes). */
  overheadBytes: number;
  /** Rows per block (based on usable space). */
  rowsPerBlock: number;
  /** Default rows per block calculated before any user override. */
  defaultRowsPerBlock: number;
  /** Total blocks needed for retentionDays of data. */
  totalBlocks: number;
  /** Raw bytes (blocks × block size). */
  rawBytes: number;
  /** Allocated bytes after extent rounding. */
  allocatedBytes: number;
  /** Allocated GB. */
  allocatedGb: number;
  /** One-time bulk / migration rows considered for this table. */
  bulkRows: number;
  /** Rows accumulating from daily rate across retention period. */
  retentionRows: number;
  /** Total combined rows across bulk load and retention period. */
  totalRowsOverRetention: number;
  /** Usable block space in bytes. */
  usableBlockSpace: number;
  /** Whether the average row length was customized by the user. */
  isCustomRowLength?: boolean;
  /** Whether rows per block was customized by the user. */
  isCustomRowsPerBlock?: boolean;
}

/** Sizing result for a single index. */
export interface IndexSizeResult {
  indexName: string;
  tableName: string;
  columns: string[];
  unique: boolean;
  /** Key entry size in bytes. */
  entrySize: number;
  /** Entries per leaf block. */
  entriesPerBlock: number;
  /** Total leaf blocks. */
  leafBlocks: number;
  /** Branch blocks. */
  branchBlocks: number;
  /** Total blocks. */
  totalBlocks: number;
  /** Allocated bytes after extent rounding. */
  allocatedBytes: number;
  /** Allocated GB. */
  allocatedGb: number;
  /** Total rows the index covers. */
  totalRows: number;
}

/** TEMP tablespace estimate for bulk operations. */
export interface TempEstimate {
  /** Bytes needed for sorting during bulk load. */
  sortBytes: number;
  /** Total TEMP needed in GB. */
  requiredGb: number;
  /** Breakdown explanation. */
  detail: string;
}

/** UNDO tablespace estimate for bulk operations. */
export interface UndoEstimate {
  /** UNDO bytes for a single batch. */
  batchUndoBytes: number;
  /** Total UNDO needed in GB. */
  requiredGb: number;
  /** Breakdown explanation. */
  detail: string;
}

/** The full capacity plan output. */
export interface CapacityPlanResult {
  /** Per-table data sizing. */
  tables: TableSizeResult[];
  /** Per-index sizing. */
  indexes: IndexSizeResult[];
  /** Sum of all data tablespace in GB. */
  totalDataGb: number;
  /** Sum of all index tablespace in GB. */
  totalIndexGb: number;
  /** Grand total (data + index) in GB. */
  grandTotalGb: number;
  /** Data total with buffer applied. */
  totalDataWithBufferGb: number;
  /** Index total with buffer applied. */
  totalIndexWithBufferGb: number;
  /** Grand total with buffer. */
  grandTotalWithBufferGb: number;
  /** Buffer percentage that was applied. */
  bufferPct: number;
  /** TEMP tablespace estimate. */
  temp: TempEstimate;
  /** UNDO tablespace estimate. */
  undo: UndoEstimate;
  /** Warnings and notes. */
  warnings: string[];
}
