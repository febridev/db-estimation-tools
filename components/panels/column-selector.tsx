"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn, formatInt } from "@/lib/utils";
import type { IndexColumn, ParsedTable } from "@/lib/types";

interface Props {
  table: ParsedTable | null;
  totalRows: number;
  selected: IndexColumn[];
  onChange: (columns: IndexColumn[]) => void;
}

export function ColumnSelector({ table, totalRows, selected, onChange }: Props) {
  if (!table) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>2 · Index key</CardTitle>
          <CardDescription>Read a table above, then pick the key columns in order.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isPicked = (name: string) => selected.some((c) => c.name === name);

  function toggle(name: string) {
    if (isPicked(name)) {
      onChange(selected.filter((c) => c.name !== name));
      return;
    }
    const col = table!.columns.find((c) => c.name === name)!;
    onChange([
      ...selected,
      {
        name: col.name,
        dataType: col.dataType,
        avgLength: col.avgLength,
        // Assume a distinct value per row until the DBA supplies real NDV.
        ndv: Math.max(1, Math.round(totalRows)),
      },
    ]);
  }

  function patch(name: string, field: "avgLength" | "ndv", value: number) {
    onChange(selected.map((c) => (c.name === name ? { ...c, [field]: value } : c)));
  }

  function move(index: number, delta: number) {
    const next = [...selected];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2 · Index key</CardTitle>
        <CardDescription>
          Key order decides both selectivity and how well COMPRESS pays off. Put the
          column with the fewest distinct values first when you plan to compress.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {table.columns.map((col) => (
            <button
              key={col.name}
              type="button"
              onClick={() => toggle(col.name)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isPicked(col.name) && "border-primary bg-primary/10",
              )}
            >
              <span className="block font-medium">{col.name}</span>
              <span className="block text-muted-foreground">{col.dataType}</span>
            </button>
          ))}
        </div>

        {selected.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2 font-medium">Position</th>
                  <th className="py-2 pr-2 font-medium">Column</th>
                  <th className="py-2 pr-2 font-medium">Avg bytes</th>
                  <th className="py-2 pr-2 font-medium">Distinct values</th>
                  <th className="py-2 font-medium">Order</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((col, i) => (
                  <tr key={col.name} className="border-b last:border-0">
                    <td className="numeric py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <span className="font-medium">{col.name}</span>
                      <span className="block text-xs text-muted-foreground">{col.dataType}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-24 numeric"
                        value={col.avgLength}
                        onChange={(e) => patch(col.name, "avgLength", Number(e.target.value))}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-32 numeric"
                        value={col.ndv}
                        onChange={(e) => patch(col.name, "ndv", Number(e.target.value))}
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" aria-label={`Move ${col.name} up`} onClick={() => move(i, -1)}>
                          ↑
                        </Button>
                        <Button size="icon" variant="outline" aria-label={`Move ${col.name} down`} onClick={() => move(i, 1)}>
                          ↓
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-2 text-xs text-muted-foreground">
              Distinct values default to {formatInt(totalRows)} (one per row), the worst
              case for compression. Replace them with AVG_COL_LEN and NUM_DISTINCT from
              USER_TAB_COL_STATISTICS for a real estimate.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Pick at least one column to size the index.</p>
        )}
      </CardContent>
    </Card>
  );
}
