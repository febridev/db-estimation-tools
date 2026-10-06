"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { parseCapacityDdl } from "@/lib/capacity-ddl-parser";
import type { CapacityTable } from "@/lib/tablespace-types";

const SAMPLE = `CREATE TABLE sales.order_header (
  order_id      NUMBER(12)    NOT NULL,
  customer_id   NUMBER(10)    NOT NULL,
  order_date    DATE          NOT NULL,
  status        VARCHAR2(20)  NOT NULL,
  total_amount  NUMBER(15,2),
  currency_code VARCHAR2(3)   NOT NULL,
  ship_address  VARCHAR2(200),
  created_by    VARCHAR2(50)  NOT NULL,
  created_date  TIMESTAMP     NOT NULL,
  updated_date  TIMESTAMP,
  CONSTRAINT pk_order_header PRIMARY KEY (order_id)
);

CREATE TABLE sales.order_line (
  order_id      NUMBER(12)    NOT NULL,
  line_no       NUMBER(4)     NOT NULL,
  product_sku   VARCHAR2(32)  NOT NULL,
  quantity      NUMBER(10,2)  NOT NULL,
  unit_price    NUMBER(12,2)  NOT NULL,
  discount_pct  NUMBER(5,2),
  line_total    NUMBER(15,2),
  status_code   VARCHAR2(2)   NOT NULL,
  CONSTRAINT pk_order_line PRIMARY KEY (order_id, line_no)
);

CREATE INDEX idx_order_header_customer ON sales.order_header (customer_id);
CREATE INDEX idx_order_header_date ON sales.order_header (order_date);
CREATE INDEX idx_order_line_sku ON sales.order_line (product_sku);
CREATE UNIQUE INDEX uq_order_line_order_sku ON sales.order_line (order_id, product_sku);`;

export function CapacityDdlInput({
  onParsed,
}: {
  onParsed: (tables: CapacityTable[]) => void;
}) {
  const [sql, setSql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tableCount, setTableCount] = useState(0);

  function run(text: string) {
    const outcome = parseCapacityDdl(text);
    setError(outcome.error);
    setWarnings(outcome.warnings);
    setTableCount(outcome.tables.length);
    if (outcome.tables.length > 0) {
      onParsed(outcome.tables);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSql(content);
      run(content);
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>1 · DDL input</CardTitle>
        <CardDescription>
          Paste one or more CREATE TABLE (and optionally CREATE INDEX) statements.
          Column types are used to estimate average row length and index entry size.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={14}
          value={sql}
          spellCheck={false}
          placeholder="CREATE TABLE schema.table_name (&#10;  col1 NUMBER(12) NOT NULL,&#10;  col2 VARCHAR2(100),&#10;  ...&#10;);&#10;&#10;CREATE INDEX idx_name ON table_name (col1);"
          onChange={(e) => setSql(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">OR</span>
          <input
            type="file"
            accept=".sql,.ddl,.txt"
            onChange={handleFileChange}
            className="text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => run(sql)} disabled={!sql.trim()}>
            Parse DDL
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSql(SAMPLE);
              run(SAMPLE);
            }}
          >
            Load example
          </Button>
          {tableCount > 0 && !error && (
            <span className="text-sm text-safe">
              ✓ Parsed {tableCount} table{tableCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {error ? (
          <p className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
