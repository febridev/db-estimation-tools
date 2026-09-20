export type BlockSize = 2048 | 4096 | 8192 | 16384 | 32768;

export type IndexStructure = "NORMAL" | "REVERSE";

export type PartitionScope = "NONE" | "LOCAL" | "GLOBAL";

/** One column that participates in the index key. */
export interface IndexColumn {
  name: string;
  /** Declared Oracle datatype, kept for display and DDL sanity checks. */
  dataType: string;
  /** Average stored length in bytes (Oracle stores values variable-length). */
  avgLength: number;
  /**
   * Number of distinct values. Required to model COMPRESS correctly:
   * prefix compression only pays off when the prefix repeats.
   */
  ndv: number;
}

export interface ParsedColumn {
  name: string;
  dataType: string;
  /** Length inferred from the DDL declaration; user may override. */
  avgLength: number;
  nullable: boolean;
}

export interface ParsedTable {
  schema?: string;
  name: string;
  columns: ParsedColumn[];
}

export interface EstimatorInput {
  blockSize: BlockSize;
  totalRows: number;
  columns: IndexColumn[];
  pctFree: number;
  initTrans: number;
  unique: boolean;
  structure: IndexStructure;
  partitionScope: PartitionScope;
  /** COMPRESS n — number of leading columns used as the block prefix. 0 = no compression. */
  compressPrefix: number;
  /** Expected block-split slack. A fresh CREATE INDEX packs tight; DML-grown indexes do not. */
  splitOverheadPct: number;
  parallelDegree: number;
  online: boolean;
  /** Extent granularity used to round the segment up, in bytes. */
  extentSizeBytes: number;
  tablespaceName: string;
  indexName: string;
  tableName: string;
  availableTempGb: number;
  availableUndoGb: number;
  /** Rows changed per hour by other sessions while an ONLINE build runs. */
  concurrentDmlPerHour: number;
  /** Average undo footprint of one changed row. */
  undoBytesPerDml: number;
  /** Expected wall-clock duration of the build, in minutes. */
  buildMinutes: number;
}

export type RiskLevel = "SAFE" | "WARNING" | "CRITICAL";

export interface RiskAssessment {
  requiredGb: number;
  availableGb: number;
  ratio: number;
  level: RiskLevel;
  headline: string;
  detail: string;
}

/**
 * Every intermediate value the engine computes on the way to the final size.
 * Exposed so the UI can show the derivation and so a DBA can check each step
 * against a hand calculation instead of trusting one number.
 */
export interface Intermediates {
  keyBytes: number;
  rowidLenByte: number;
  entryHeader: number;
  prefixBytes: number;
  prefixNdv: number;
  rowsPerPrefix: number;
  branchEntrySize: number;
  branchFanout: number;
  segmentHeaderBlocks: number;
  sortRowOverhead: number;
  sortBytes: number;
  mergeFactor: number;
  parallelFactor: number;
  undoMarginFactor: number;
  buildHours: number;
}

export interface EstimatorResult {
  usableBlockSpace: number;
  blockOverhead: number;
  rowidLength: number;
  entrySize: number;
  effectiveEntrySize: number;
  entriesPerBlock: number;
  leafBlocks: number;
  branchBlocks: number;
  btreeHeight: number;
  totalBlocks: number;
  rawBytes: number;
  allocatedBytes: number;
  estimatedGb: number;
  compressionRatio: number;
  temp: RiskAssessment;
  undo: RiskAssessment;
  warnings: string[];
  intermediates: Intermediates;
}

/** One line of the shown derivation. */
export interface DerivationStep {
  id: string;
  title: string;
  /** Symbolic form, e.g. "UBS = (BS - OH) x (1 - PCTFREE/100)". */
  formula: string;
  /** The same form with this run's numbers substituted. */
  substitution: string;
  /** Formatted outcome, including units. */
  value: string;
  note?: string;
}
