"use client";

import { useMemo, useState } from "react";
import { CapacityDdlInput } from "@/components/panels/capacity-ddl-input";
import { CapacityParameters } from "@/components/panels/capacity-parameters";
import { CapacityResults } from "@/components/panels/capacity-results";
import { calculateCapacityPlan } from "@/lib/tablespace-sizing";
import type { CapacityInput, CapacityTable } from "@/lib/tablespace-types";

const INITIAL: CapacityInput = {
  blockSize: 8192,
  pctFree: 10,
  initTrans: 2,
  bufferPct: 10,
  retentionDays: 180,
  rowsPerDay: 100_000,
  bulkRows: 1_000_000,
  totalRows: 1_000_000,
  extentSizeBytes: 1024 * 1024,
  parallelDegree: 4,
  undoBytesPerRow: 400,
  bulkBatchSize: 50_000,
};

export default function TablespaceCapacityPage() {
  const [tables, setTables] = useState<CapacityTable[]>([]);
  const [input, setInput] = useState<CapacityInput>(INITIAL);

  const patch = (p: Partial<CapacityInput>) =>
    setInput((prev) => ({ ...prev, ...p }));

  const ready = tables.length > 0;
  const result = useMemo(
    () => (ready ? calculateCapacityPlan(tables, input) : null),
    [tables, input, ready],
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Tablespace Capacity Plan
        </h1>
        <p className="pt-3 text-base leading-relaxed text-muted-foreground">
          Upload or paste your DDL to estimate how much tablespace you need for
          data and indexes. Calculations use the declared column types to derive
          average row length, then project storage for your retention period.
          TEMP and UNDO requirements for bulk loading are included.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-6">
          <CapacityDdlInput onParsed={setTables} />
          <CapacityParameters value={input} onChange={patch} tables={tables} />
        </div>

        <div className="lg:sticky lg:top-6 lg:h-fit">
          <CapacityResults result={result} ready={ready} />
        </div>
      </div>

      <footer className="max-w-2xl pt-10 text-sm leading-relaxed text-muted-foreground">
        Estimates assume uniform data distribution and average column lengths
        inferred from DDL type declarations. For production planning, feed real
        AVG_ROW_LEN from DBA_TABLES and AVG_COL_LEN from DBA_TAB_COLUMNS.
        Default: 8 KB block size, 10% PCTFREE, 10% buffer, 180-day retention.
      </footer>
    </main>
  );
}
