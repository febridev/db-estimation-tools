"use client";

import { useMemo, useState } from "react";
import { DdlInput } from "@/components/panels/ddl-input";
import { ColumnSelector } from "@/components/panels/column-selector";
import { Parameters } from "@/components/panels/parameters";
import { Results } from "@/components/panels/results";
import { Derivation } from "@/components/panels/derivation";
import { SqlOutput } from "@/components/panels/sql-output";
import { estimate } from "@/lib/sizing";
import { generateDdl, generatePrecheckSql } from "@/lib/ddl-generator";
import type { EstimatorInput, ParsedTable } from "@/lib/types";

const INITIAL: EstimatorInput = {
  blockSize: 8192,
  totalRows: 100_000_000,
  columns: [],
  pctFree: 10,
  initTrans: 2,
  unique: false,
  structure: "NORMAL",
  partitionScope: "NONE",
  compressPrefix: 0,
  splitOverheadPct: 5,
  parallelDegree: 4,
  online: false,
  extentSizeBytes: 1024 * 1024,
  tablespaceName: "IDX_DATA",
  indexName: "IX_NEW_INDEX",
  tableName: "MY_TABLE",
  availableTempGb: 32,
  availableUndoGb: 16,
  concurrentDmlPerHour: 50_000,
  undoBytesPerDml: 400,
  buildMinutes: 45,
};

export default function Page() {
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [input, setInput] = useState<EstimatorInput>(INITIAL);

  const patch = (p: Partial<EstimatorInput>) => setInput((prev) => ({ ...prev, ...p }));

  function handleParsed(parsed: ParsedTable) {
    const qualified = parsed.schema ? `${parsed.schema}.${parsed.name}` : parsed.name;
    setTable(parsed);
    patch({
      columns: [],
      tableName: qualified,
      indexName: `IX_${parsed.name.toUpperCase()}_01`,
    });
  }

  const ready = input.columns.length > 0 && input.totalRows > 0;
  const result = useMemo(() => (ready ? estimate(input) : null), [input, ready]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Size an Oracle index before you build it
        </h1>
        <p className="pt-3 text-base leading-relaxed text-muted-foreground">
          Paste a table definition, pick the key, and get the segment size, the TEMP the
          sort will need, and whether an online build can survive the UNDO you have.
          Everything runs in the browser — no database connection, nothing leaves the page.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="space-y-6">
          <DdlInput onParsed={handleParsed} />
          <ColumnSelector
            table={table}
            totalRows={input.totalRows}
            selected={input.columns}
            onChange={(columns) => patch({ columns })}
          />
          <Parameters value={input} onChange={patch} />
          {result ? <Derivation input={input} result={result} /> : null}
          {result ? (
            <SqlOutput ddl={generateDdl(input, result)} precheck={generatePrecheckSql(input)} />
          ) : null}
        </div>

        <div className="lg:sticky lg:top-6 lg:h-fit">
          <Results result={result} ready={ready} />
        </div>
      </div>

      <footer className="max-w-2xl pt-10 text-sm leading-relaxed text-muted-foreground">
        Estimates assume uniform data. Feed real AVG_COL_LEN and NUM_DISTINCT values from
        the optimizer statistics for anything you are about to run in production, and
        confirm with DBMS_SPACE.CREATE_INDEX_COST when the database is reachable.
      </footer>
    </main>
  );
}
