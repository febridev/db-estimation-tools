"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { parseCreateTable } from "@/lib/ddl-parser";
import type { ParsedTable } from "@/lib/types";

const SAMPLE = `CREATE TABLE sales.order_line (
  order_id      NUMBER(12)    NOT NULL,
  line_no       NUMBER(4)     NOT NULL,
  customer_code VARCHAR2(20)  NOT NULL,
  product_sku   VARCHAR2(32)  NOT NULL,
  status_code   VARCHAR2(2)   NOT NULL,
  order_date    DATE          NOT NULL,
  quantity      NUMBER(10,2),
  note          CLOB,
  CONSTRAINT pk_order_line PRIMARY KEY (order_id, line_no)
);`;

export function DdlInput({ onParsed }: { onParsed: (table: ParsedTable) => void }) {
  const [sql, setSql] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  function run(text: string) {
    const outcome = parseCreateTable(text);
    setError(outcome.error);
    setSkipped(outcome.skipped);
    if (outcome.table) onParsed(outcome.table);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>1 · Table definition</CardTitle>
        <CardDescription>
          Paste the CREATE TABLE statement. Column widths are read from the declared
          types, and you can correct them in the next step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={10}
          value={sql}
          spellCheck={false}
          placeholder="CREATE TABLE ..."
          onChange={(e) => setSql(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(sql)} disabled={!sql.trim()}>
            Read columns
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSql(SAMPLE);
              run(SAMPLE);
            }}
          >
            Load an example table
          </Button>
        </div>
        {error ? (
          <p className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {skipped.length > 0 ? (
          <ul className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {skipped.map((s) => (
              <li key={s}>Left out: {s}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
