"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatGb, formatInt } from "@/lib/utils";
import type { CapacityPlanResult } from "@/lib/tablespace-types";

function Metric({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b py-2 last:border-0", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="numeric text-sm font-medium">{value}</span>
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("numeric text-3xl font-semibold leading-none tracking-tight", accent)}>
        {value}
      </p>
      {sub ? <p className="pt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function CapacityResults({
  result,
  ready,
}: {
  result: CapacityPlanResult | null;
  ready: boolean;
}) {
  if (!ready || !result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Capacity Plan</CardTitle>
          <CardDescription>
            Parse DDL and set parameters to see the tablespace capacity plan.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grand total summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Data tablespace"
          value={formatGb(result.totalDataWithBufferGb)}
          sub={`${result.tables.length} table${result.tables.length !== 1 ? "s" : ""}`}
          accent="text-primary"
        />
        <SummaryCard
          label="Index tablespace"
          value={formatGb(result.totalIndexWithBufferGb)}
          sub={`${result.indexes.length} index${result.indexes.length !== 1 ? "es" : ""}`}
          accent="text-primary"
        />
        <SummaryCard
          label="Grand total"
          value={formatGb(result.grandTotalWithBufferGb)}
          sub={`Including ${result.bufferPct}% buffer`}
        />
      </div>

      {/* TEMP & UNDO */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">TEMP tablespace</h3>
            <span className="numeric text-sm font-semibold text-primary">
              {formatGb(result.temp.requiredGb)}
            </span>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            {result.temp.detail}
          </p>
        </div>
        <div className="rounded-md border bg-card p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">UNDO tablespace</h3>
            <span className="numeric text-sm font-semibold text-primary">
              {formatGb(result.undo.requiredGb)}
            </span>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            {result.undo.detail}
          </p>
        </div>
      </div>

      {/* Per-table breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Data tablespace breakdown</CardTitle>
          <CardDescription>
            Size per table based on average row length, one-time bulk data, and retention period.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-1">
          {result.tables.map((t) => (
            <div key={t.tableName} className="border-b py-3 last:border-0">
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{t.tableName}</span>
                  {(t.isCustomRowLength || t.isCustomRowsPerBlock) && (
                    <span className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[10px] text-primary font-medium">
                      custom params
                    </span>
                  )}
                  {t.retentionRows === 0 && t.bulkRows > 0 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      one-time bulk
                    </span>
                  )}
                </div>
                <span className="numeric text-sm font-semibold">{formatGb(t.allocatedGb)}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground sm:grid-cols-4">
                <span>
                  Avg row: {formatInt(t.avgRowLength)} B
                  {t.isCustomRowLength && " *"}
                </span>
                <span>
                  Rows/block: {formatInt(t.rowsPerBlock)}
                  {t.isCustomRowsPerBlock && " *"}
                </span>
                <span>
                  Total rows: {formatInt(t.totalRowsOverRetention)}
                  {t.retentionRows === 0 && t.bulkRows > 0 && (
                    <span className="block text-[10px] text-primary">
                      100% bulk load
                    </span>
                  )}
                </span>
                <span>Blocks: {formatInt(t.totalBlocks)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Per-index breakdown */}
      {result.indexes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Index tablespace breakdown</CardTitle>
            <CardDescription>
              Size per index based on key entry size and row count.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-1">
            {result.indexes.map((idx) => (
              <div key={`${idx.indexName}-${idx.tableName}`} className="border-b py-3 last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-sm font-medium">
                    {idx.indexName}
                    {idx.unique && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        unique
                      </span>
                    )}
                  </span>
                  <span className="numeric text-sm font-semibold">{formatGb(idx.allocatedGb)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  on {idx.tableName} ({idx.columns.join(", ")})
                </p>
                <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground sm:grid-cols-4">
                  <span>Entry: {idx.entrySize} B</span>
                  <span>Entries/block: {formatInt(idx.entriesPerBlock)}</span>
                  <span>Leaf blocks: {formatInt(idx.leafBlocks)}</span>
                  <span>Branch blocks: {formatInt(idx.branchBlocks)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Card className="border-warn/50">
          <CardHeader className="border-warn/30">
            <CardTitle className="text-warn">Notes & warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.warnings.map((w) => (
              <p key={w} className="text-sm leading-snug">
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
