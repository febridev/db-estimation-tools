import type { EstimatorInput, EstimatorResult } from "./types";

export function generateDdl(input: EstimatorInput, result: EstimatorResult): string {
  const cols = input.columns.map((c) => c.name).join(", ");
  const lines: string[] = [];

  lines.push(`-- Estimated segment: ${result.estimatedGb.toFixed(2)} GB`);
  lines.push(`-- Leaf blocks: ${result.leafBlocks.toLocaleString()} | branch blocks: ${result.branchBlocks.toLocaleString()} | height: ${result.btreeHeight}`);
  lines.push(`-- TEMP needed: ${result.temp.requiredGb.toFixed(2)} GB (${result.temp.level})`);
  lines.push("");

  const head = `CREATE ${input.unique ? "UNIQUE " : ""}INDEX ${input.indexName}`;
  lines.push(head);
  lines.push(`  ON ${input.tableName} (${cols})`);
  lines.push(`  TABLESPACE ${input.tablespaceName}`);
  lines.push(`  PCTFREE ${input.pctFree}`);
  lines.push(`  INITRANS ${input.initTrans}`);

  if (input.structure === "REVERSE") lines.push("  REVERSE");
  if (input.compressPrefix > 0 && input.structure !== "REVERSE") {
    lines.push(`  COMPRESS ${input.compressPrefix}`);
  }
  if (input.partitionScope === "LOCAL") lines.push("  LOCAL");
  if (input.partitionScope === "GLOBAL") {
    lines.push("  -- GLOBAL requires a partitioning clause, e.g.:");
    lines.push("  -- GLOBAL PARTITION BY RANGE (<key>) (PARTITION p_max VALUES LESS THAN (MAXVALUE))");
  }
  if (input.online) lines.push("  ONLINE");
  if (input.parallelDegree > 1) lines.push(`  PARALLEL ${input.parallelDegree}`);
  lines.push("  NOLOGGING;");
  lines.push("");

  if (input.parallelDegree > 1) {
    lines.push("-- Reset the attribute: a parallel index keeps its degree and can");
    lines.push("-- push later queries into parallel plans you did not ask for.");
    lines.push(`ALTER INDEX ${input.indexName} NOPARALLEL;`);
  }
  lines.push("-- NOLOGGING skips redo for the build. Take a fresh backup of the");
  lines.push("-- tablespace afterwards, and re-enable logging if the index must be");
  lines.push("-- recoverable on a standby.");
  lines.push(`ALTER INDEX ${input.indexName} LOGGING;`);
  lines.push("");
  lines.push(`EXEC DBMS_STATS.GATHER_INDEX_STATS(USER, '${input.indexName}');`);

  return lines.join("\n");
}

export function generatePrecheckSql(input: EstimatorInput): string {
  return [
    "-- Free space in the target tablespace",
    "SELECT tablespace_name,",
    "       ROUND(SUM(bytes)/1024/1024/1024, 2) AS free_gb",
    "  FROM dba_free_space",
    ` WHERE tablespace_name = '${input.tablespaceName.toUpperCase()}'`,
    " GROUP BY tablespace_name;",
    "",
    "-- Free TEMP right now",
    "SELECT tablespace_name,",
    "       ROUND(SUM(bytes_used)/1024/1024/1024, 2)  AS used_gb,",
    "       ROUND(SUM(bytes_free)/1024/1024/1024, 2)  AS free_gb",
    "  FROM v$temp_space_header",
    " GROUP BY tablespace_name;",
    "",
    "-- Real average column lengths, to replace the estimates above",
    "SELECT column_name, num_distinct, avg_col_len",
    "  FROM user_tab_col_statistics",
    ` WHERE table_name = '${input.tableName.split(".").pop()?.toUpperCase()}';`,
  ].join("\n");
}
