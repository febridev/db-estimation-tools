"use client";

import { useState } from "react";
import {
  HelpCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Calculator,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldRow, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn, formatInt } from "@/lib/utils";
import {
  blockOverhead,
  usableBlockSpace,
  rowOverhead,
  calculateDefaultAvgRowLength,
  calculateDefaultRowsPerBlock,
} from "@/lib/tablespace-sizing";
import type { CapacityInput, CapacityTable } from "@/lib/tablespace-types";
import type { BlockSize } from "@/lib/types";

interface Props {
  value: CapacityInput;
  onChange: (patch: Partial<CapacityInput>) => void;
  tables: CapacityTable[];
}

/** Interactive tooltip popup with click & hover support */
function InfoTooltip({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="ml-1.5 inline-flex items-center text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
        aria-label={title}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="tooltip"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-800 bg-slate p-3 text-xs text-slate-100 shadow-xl transition-opacity dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-950" />
          <p className="mb-1.5 font-semibold text-white">{title}</p>
          <div className="space-y-1.5 leading-relaxed text-slate-200 [&_code]:rounded [&_code]:border [&_code]:border-slate-700 [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-slate-200 [&_strong]:text-white">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function CapacityParameters({ value, onChange, tables }: Props) {
  const [expandedBreakdown, setExpandedBreakdown] = useState<
    Record<string, boolean>
  >({});

  const toggleBreakdown = (key: string) => {
    setExpandedBreakdown((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAvgRowLengthChange = (
    tableKey: string,
    rawVal: string,
    calcRows: (len: number) => number,
  ) => {
    const num = Number(rawVal);
    const currentOverrides = value.tableOverrides || {};
    const tableOverride = currentOverrides[tableKey] || {};

    const updatedLen = Number.isNaN(num) || num <= 0 ? 0 : num;
    const isCustomRows = tableOverride.customRowsPerBlock ?? false;
    const newRowsPerBlock = isCustomRows
      ? tableOverride.rowsPerBlock
      : calcRows(updatedLen);

    onChange({
      tableOverrides: {
        ...currentOverrides,
        [tableKey]: {
          ...tableOverride,
          avgRowLength: updatedLen,
          rowsPerBlock: newRowsPerBlock,
        },
      },
    });
  };

  const handleRowsPerBlockChange = (tableKey: string, rawVal: string) => {
    const num = Number(rawVal);
    const currentOverrides = value.tableOverrides || {};
    const tableOverride = currentOverrides[tableKey] || {};

    const updatedRows = Number.isNaN(num) || num <= 0 ? 0 : num;

    onChange({
      tableOverrides: {
        ...currentOverrides,
        [tableKey]: {
          ...tableOverride,
          rowsPerBlock: updatedRows,
          customRowsPerBlock: true,
        },
      },
    });
  };

  const handleResetTable = (tableKey: string) => {
    const currentOverrides = { ...(value.tableOverrides || {}) };
    delete currentOverrides[tableKey];
    onChange({ tableOverrides: currentOverrides });
  };

  // Pre-calculate block space fundamentals
  const currentBlockOverhead = blockOverhead(value.initTrans);
  const currentUsableSpace = usableBlockSpace(
    value.blockSize,
    value.pctFree,
    value.initTrans,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>2 · Capacity parameters</CardTitle>
        <CardDescription>
          Configure block settings, data retention, row length &amp; packing,
          and bulk load options.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section A: Block & Storage Fundamentals */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Block &amp; Space Configuration
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldRow
              label="Block size"
              hint="Must match DB_BLOCK_SIZE of the target tablespace. Default 8 KB."
            >
              <Select
                value={value.blockSize}
                onChange={(e) =>
                  onChange({
                    blockSize: Number(e.target.value) as BlockSize,
                  })
                }
              >
                {[2048, 4096, 8192, 16384, 32768].map((b) => (
                  <option key={b} value={b}>
                    {b / 1024} KB ({formatInt(b)} bytes)
                  </option>
                ))}
              </Select>
            </FieldRow>

            <FieldRow
              label="PCTFREE (%)"
              hint="Block space reserved for future row updates. Default 10%."
            >
              <Input
                type="number"
                min={0}
                max={99}
                className="numeric"
                value={value.pctFree}
                onChange={(e) => onChange({ pctFree: Number(e.target.value) })}
              />
            </FieldRow>

            <FieldRow
              label="INITRANS"
              hint="Initial transaction slots per block (costs 24 bytes each). Default 2."
            >
              <Input
                type="number"
                min={1}
                max={255}
                className="numeric"
                value={value.initTrans}
                onChange={(e) =>
                  onChange({ initTrans: Number(e.target.value) })
                }
              />
            </FieldRow>

            <FieldRow
              label="Buffer margin (%)"
              hint="Safety buffer added on top of calculated tablespace size. Default 10%."
            >
              <Input
                type="number"
                min={0}
                max={100}
                className="numeric"
                value={value.bufferPct}
                onChange={(e) =>
                  onChange({ bufferPct: Number(e.target.value) })
                }
              />
            </FieldRow>
          </div>
        </div>

        {/* Section B: Table Row Sizing & Block Packing (User Request) */}
        <div className="border-t pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Table Row Sizing &amp; Block Packing
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-calculated from DDL column types and block parameters. You
                can modify these values based on your own calculations or
                production stats.
              </p>
            </div>
          </div>

          {tables.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              <Info className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
              Upload or paste your DDL in Step 1 to populate tables and their
              calculated Average Row Length &amp; Rows per Block.
            </div>
          ) : (
            <div className="space-y-4">
              {tables.map((table) => {
                const tableKey = table.schema
                  ? `${table.schema}.${table.name}`
                  : table.name;
                const overrides = value.tableOverrides?.[tableKey];

                const {
                  columnBytes,
                  overheadBytes,
                  totalBytes: defaultAvgRowLength,
                } = calculateDefaultAvgRowLength(table.columns);

                const currentAvgRowLen =
                  overrides?.avgRowLength !== undefined &&
                    overrides.avgRowLength > 0
                    ? overrides.avgRowLength
                    : defaultAvgRowLength;

                const defaultRowsPerBlock = Math.max(
                  1,
                  Math.floor(
                    currentUsableSpace / Math.max(1, currentAvgRowLen),
                  ),
                );

                const currentRowsPerBlk =
                  overrides?.rowsPerBlock !== undefined &&
                    overrides.rowsPerBlock > 0
                    ? overrides.rowsPerBlock
                    : defaultRowsPerBlock;

                const isCustomLength =
                  overrides?.avgRowLength !== undefined &&
                  overrides.avgRowLength !== defaultAvgRowLength;
                const isCustomRows =
                  overrides?.rowsPerBlock !== undefined &&
                  overrides.rowsPerBlock !== defaultRowsPerBlock;
                const hasOverrides = isCustomLength || isCustomRows;

                const calcRowsForLen = (len: number) =>
                  Math.max(
                    1,
                    Math.floor(currentUsableSpace / Math.max(1, len)),
                  );

                const isExpanded = !!expandedBreakdown[tableKey];

                return (
                  <div
                    key={tableKey}
                    className="rounded-lg border bg-card p-4 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {tableKey}
                        </span>
                        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {table.columns.length} columns
                        </span>
                        {hasOverrides && (
                          <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Custom values
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {hasOverrides && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetTable(tableKey)}
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Reset to DDL
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleBreakdown(tableKey)}
                          className="h-7 text-xs"
                        >
                          <Calculator className="mr-1 h-3 w-3" />
                          {isExpanded ? "Hide formula" : "How it's calculated"}
                          {isExpanded ? (
                            <ChevronUp className="ml-1 h-3 w-3" />
                          ) : (
                            <ChevronDown className="ml-1 h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Inputs for Average Row Length and Rows per Block */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center">
                          <label className="text-sm font-medium text-foreground">
                            Average row length (bytes)
                          </label>
                          <InfoTooltip title="Average Row Length (AVG_ROW_LEN)">
                            <p>
                              <strong>Formula:</strong> Column Data Bytes + Row
                              Overhead
                            </p>
                            <p>
                              • <strong>Column Data:</strong> Sum of estimated
                              widths for all columns based on declared types
                              (e.g. VARCHAR2(N) estimated at 50% max width,
                              NUMBER(P) at ⌈P/2⌉+1 bytes, DATE at 7 bytes).
                            </p>
                            <p>
                              • <strong>Row Overhead:</strong> 3 bytes row
                              header (flag byte + lock byte + column count) + 1
                              length byte per column.
                            </p>
                            <p>
                              • <strong>Production Tip:</strong> In production,
                              verify against <code>DBA_TABLES.AVG_ROW_LEN</code>{" "}
                              after gathering stats.
                            </p>
                          </InfoTooltip>
                          {isCustomLength && (
                            <span className="ml-auto text-[11px] text-muted-foreground">
                              DDL default: {defaultAvgRowLength} B
                            </span>
                          )}
                        </div>
                        <Input
                          type="number"
                          min={1}
                          className="numeric font-medium"
                          value={currentAvgRowLen}
                          onChange={(e) =>
                            handleAvgRowLengthChange(
                              tableKey,
                              e.target.value,
                              calcRowsForLen,
                            )
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {isCustomLength
                            ? "Custom value applied. Replaces DDL inferred length."
                            : `Calculated: ${columnBytes} B column data + ${overheadBytes} B row overhead.`}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center">
                          <label className="text-sm font-medium text-foreground">
                            Rows per block
                          </label>
                          <InfoTooltip title="Rows Per Block Calculation">
                            <p>
                              <strong>Formula:</strong> ⌊ Usable Block Space /
                              Average Row Length ⌋
                            </p>
                            <p>
                              • <strong>Block Overhead:</strong> 113 B fixed
                              header + (INITRANS × 24 B).
                            </p>
                            <p>
                              • <strong>Usable Space:</strong> (Block Size −
                              Overhead) × (1 − PCTFREE / 100).
                            </p>
                            <p>
                              • For an {value.blockSize / 1024} KB block with{" "}
                              {value.pctFree}% PCTFREE &amp; INITRANS{" "}
                              {value.initTrans}, usable space is{" "}
                              {formatInt(currentUsableSpace)} bytes.
                            </p>
                          </InfoTooltip>
                          {isCustomRows && (
                            <span className="ml-auto text-[11px] text-muted-foreground">
                              Calculated: {defaultRowsPerBlock}
                            </span>
                          )}
                        </div>
                        <Input
                          type="number"
                          min={1}
                          className="numeric font-medium"
                          value={currentRowsPerBlk}
                          onChange={(e) =>
                            handleRowsPerBlockChange(tableKey, e.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {isCustomRows
                            ? "Custom packing applied. Overrides theoretical maximum."
                            : `Calculated: ⌊ ${formatInt(currentUsableSpace)} B usable / ${currentAvgRowLen} B row ⌋.`}
                        </p>
                      </div>
                    </div>

                    {/* Step-by-step formula breakdown accordion */}
                    {isExpanded && (
                      <div className="rounded-md border bg-muted/40 p-3.5 text-xs space-y-3">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="font-semibold text-foreground">
                            Detailed Calculation Derivation for {tableKey}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Oracle Block Architecture
                          </span>
                        </div>

                        {/* Step 1: Average Row Length */}
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            1. Average Row Length Calculation:
                          </p>
                          <div className="font-mono bg-card/70 rounded p-2 text-[11px] text-muted-foreground space-y-1 border">
                            <p>AVG_ROW_LEN = Column Bytes + Row Overhead</p>
                            <p className="text-foreground">
                              = {columnBytes} B (sum of {table.columns.length}{" "}
                              columns) + (3 B header + {table.columns.length} B
                              column length indicators)
                            </p>
                            <p className="text-foreground font-semibold">
                              = {columnBytes} + {overheadBytes} ={" "}
                              {defaultAvgRowLength} bytes per row
                            </p>
                          </div>
                        </div>

                        {/* Step 2: Usable Block Space */}
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            2. Usable Block Space Calculation:
                          </p>
                          <div className="font-mono bg-card/70 rounded p-2 text-[11px] text-muted-foreground space-y-1 border">
                            <p>
                              Block Overhead = 113 B (fixed header) + (INITRANS
                              × 24 B)
                            </p>
                            <p className="text-foreground">
                              = 113 + ({value.initTrans} × 24) ={" "}
                              {currentBlockOverhead} bytes
                            </p>
                            <p className="mt-1">
                              Usable Space = (Block Size − Block Overhead) × (1
                              − PCTFREE / 100)
                            </p>
                            <p className="text-foreground font-semibold">
                              = ({value.blockSize} − {currentBlockOverhead}) ×
                              (1 − {value.pctFree / 100}) ={" "}
                              {formatInt(currentUsableSpace)} bytes
                            </p>
                          </div>
                        </div>

                        {/* Step 3: Rows Per Block */}
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            3. Rows per Block Calculation:
                          </p>
                          <div className="font-mono bg-card/70 rounded p-2 text-[11px] text-muted-foreground space-y-1 border">
                            <p>
                              ROWS_PER_BLOCK = ⌊ Usable Space / Average Row
                              Length ⌋
                            </p>
                            <p className="text-foreground font-semibold">
                              = ⌊ {formatInt(currentUsableSpace)} /{" "}
                              {currentAvgRowLen} ⌋ = {defaultRowsPerBlock} rows
                              per block
                              {isCustomRows && (
                                <span className="text-primary font-normal ml-2">
                                  (Overridden by user to {currentRowsPerBlk})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Inferred Column List Summary */}
                        <div className="pt-1">
                          <p className="font-semibold text-foreground mb-1">
                            Column Specifications ({table.columns.length}{" "}
                            columns parsed):
                          </p>
                          <div className="max-h-36 overflow-y-auto rounded border bg-card/70 p-2">
                            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-muted-foreground font-semibold border-b pb-1 mb-1">
                              <span>Column Name</span>
                              <span>Data Type</span>
                              <span className="text-right">Est. Avg Bytes</span>
                            </div>
                            {table.columns.map((col) => (
                              <div
                                key={col.name}
                                className="grid grid-cols-3 gap-2 font-mono text-[10px] py-0.5 border-b border-border/50 last:border-0"
                              >
                                <span className="truncate">{col.name}</span>
                                <span className="text-muted-foreground truncate">
                                  {col.dataType}
                                </span>
                                <span className="text-right numeric font-medium">
                                  {col.avgLength} B
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section C: Data Volume & Retention */}
        <div className="border-t pt-5">
          <div className="mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Data Volume &amp; Daily Retention
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set retention period and daily growth rate. If you are doing a one-time bulk load or data migration only, you can set these to 0.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldRow
              label="Retention period (days)"
              hint="Data retention duration. Set to 0 for a one-time bulk migration."
            >
              <Input
                type="number"
                min={0}
                className="numeric"
                value={value.retentionDays}
                onChange={(e) =>
                  onChange({ retentionDays: Math.max(0, Number(e.target.value)) })
                }
              />
            </FieldRow>

            <FieldRow
              label="Rows per day"
              hint="Expected daily row ingestion rate. Set to 0 for a one-time bulk load."
            >
              <Input
                type="number"
                min={0}
                className="numeric"
                value={value.rowsPerDay}
                onChange={(e) =>
                  onChange({ rowsPerDay: Math.max(0, Number(e.target.value)) })
                }
              />
            </FieldRow>

            <FieldRow
              label="Extent granularity"
              hint="Tablespace extent management rounding size."
            >
              <Select
                value={value.extentSizeBytes}
                onChange={(e) =>
                  onChange({ extentSizeBytes: Number(e.target.value) })
                }
              >
                <option value={64 * 1024}>64 KB</option>
                <option value={1024 * 1024}>1 MB (autoallocate default)</option>
                <option value={8 * 1024 * 1024}>8 MB</option>
                <option value={64 * 1024 * 1024}>64 MB</option>
              </Select>
            </FieldRow>
          </div>
        </div>

        {/* Section D: Bulk Load & Data Migration Settings */}
        <div className="border-t pt-5">
          <div className="rounded-md border bg-muted/30 px-4 py-3 mb-4">
            <h3 className="text-sm font-semibold">
              Bulk Load &amp; One-Time Data Migration
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Specify incoming rows for one-time bulk insert (e.g. master data, historical migration).
              Data and index tablespaces are fully calculated from these bulk rows even if retention and daily volume are 0.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldRow
              label="One-time bulk rows (migration / incoming)"
              hint="Rows to insert in this one-time bulk load or migration. Sized for data, index, TEMP, and UNDO even when retention is 0."
            >
              <Input
                type="number"
                min={0}
                className="numeric font-medium"
                value={
                  value.bulkRows !== undefined
                    ? value.bulkRows
                    : (value.totalRows ?? 0)
                }
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value));
                  onChange({ bulkRows: val, totalRows: val });
                }}
              />
            </FieldRow>

            <FieldRow
              label="Batch size (rows/commit)"
              hint="Rows inserted per COMMIT batch. Directly determines active UNDO requirement."
            >
              <Input
                type="number"
                min={1}
                className="numeric"
                value={value.bulkBatchSize}
                onChange={(e) =>
                  onChange({ bulkBatchSize: Math.max(1, Number(e.target.value)) })
                }
              />
            </FieldRow>

            <FieldRow
              label="Parallel degree"
              hint="Number of parallel execution (PX) query/insert slaves."
            >
              <Input
                type="number"
                min={1}
                max={128}
                className="numeric"
                value={value.parallelDegree}
                onChange={(e) =>
                  onChange({ parallelDegree: Math.max(1, Number(e.target.value)) })
                }
              />
            </FieldRow>

            <FieldRow
              label="Undo per row (bytes)"
              hint="Average UNDO generated per changed row. ~300-500 bytes typical."
            >
              <Input
                type="number"
                min={1}
                className="numeric"
                value={value.undoBytesPerRow}
                onChange={(e) =>
                  onChange({ undoBytesPerRow: Math.max(1, Number(e.target.value)) })
                }
              />
            </FieldRow>

            {/* Total Row Evaluation Summary Box */}
            <div className="rounded-md border bg-card p-3 text-xs space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  Total Table Rows Sized for Tablespace &amp; Indexes:
                </span>
                <span className="numeric font-bold text-sm text-primary">
                  {formatInt(
                    (value.bulkRows !== undefined
                      ? value.bulkRows
                      : (value.totalRows ?? 0)) +
                      (value.retentionDays > 0 && value.rowsPerDay > 0
                        ? value.rowsPerDay * value.retentionDays
                        : 0),
                  )}{" "}
                  rows
                </span>
              </div>
              <p className="text-muted-foreground font-mono text-[11px]">
                ={" "}
                {formatInt(
                  value.bulkRows !== undefined
                    ? value.bulkRows
                    : (value.totalRows ?? 0),
                )}{" "}
                one-time bulk rows
                {value.retentionDays > 0 && value.rowsPerDay > 0
                  ? ` + (${formatInt(value.rowsPerDay)} rows/day × ${value.retentionDays} days = ${formatInt(value.rowsPerDay * value.retentionDays)} retention rows)`
                  : " + (0 retention rows — one-time bulk load mode active)"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
