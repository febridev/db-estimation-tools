"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatGb, formatInt } from "@/lib/utils";
import type { EstimatorResult, RiskAssessment } from "@/lib/types";

const RISK_STYLES: Record<RiskAssessment["level"], { bar: string; text: string; word: string }> = {
  SAFE: { bar: "bg-safe", text: "text-safe", word: "Enough room" },
  WARNING: { bar: "bg-warn", text: "text-warn", word: "Tight" },
  CRITICAL: { bar: "bg-danger", text: "text-danger", word: "Will fail" },
};

function Gauge({ risk }: { risk: RiskAssessment }) {
  const style = RISK_STYLES[risk.level];
  const fill = Math.min(100, (Math.min(risk.ratio, 3) / 3) * 100);
  return (
    <div className="space-y-2 rounded-md border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{risk.headline}</h3>
        <span className={cn("text-sm font-semibold", style.text)}>{style.word}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${fill}%` }} />
      </div>
      <p className="numeric text-sm">
        {formatGb(risk.requiredGb)} needed · {formatGb(risk.availableGb)} free
        {Number.isFinite(risk.ratio) ? ` · ${risk.ratio.toFixed(2)}×` : ""}
      </p>
      <p className="text-xs leading-snug text-muted-foreground">{risk.detail}</p>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-b py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="numeric text-sm font-medium">{value}</span>
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Results({ result, ready }: { result: EstimatorResult | null; ready: boolean }) {
  if (!ready || !result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estimate</CardTitle>
          <CardDescription>Choose at least one key column to see the numbers.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Index segment</p>
          <p className="numeric text-5xl font-semibold leading-none tracking-tight">
            {formatGb(result.estimatedGb)}
          </p>
          <p className="pt-2 text-sm text-muted-foreground">
            {formatInt(result.totalBlocks)} blocks · height {result.btreeHeight} ·{" "}
            {formatInt(result.entriesPerBlock)} entries per leaf block
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Gauge risk={result.temp} />
        <Gauge risk={result.undo} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How the number was built</CardTitle>
        </CardHeader>
        <CardContent className="py-1">
          <Metric
            label="Block overhead"
            value={`${formatInt(result.blockOverhead)} B`}
            note="113 B fixed header plus 24 B per INITRANS slot"
          />
          <Metric label="Usable space per block" value={`${formatInt(result.usableBlockSpace)} B`} />
          <Metric
            label="ROWID width"
            value={`${result.rowidLength} B`}
            note={result.rowidLength === 10 ? "Extended ROWID for a global index" : "Restricted ROWID"}
          />
          <Metric label="Entry size" value={`${result.entrySize.toFixed(1)} B`} />
          <Metric
            label="Entry size after compression"
            value={`${result.effectiveEntrySize.toFixed(1)} B`}
            note={`${((1 - result.compressionRatio) * 100).toFixed(1)}% saved per row`}
          />
          <Metric label="Leaf blocks" value={formatInt(result.leafBlocks)} />
          <Metric label="Branch blocks" value={formatInt(result.branchBlocks)} />
          <Metric
            label="Allocated after extent rounding"
            value={formatGb(result.allocatedBytes / 1024 ** 3)}
          />
        </CardContent>
      </Card>

      {result.warnings.length > 0 ? (
        <Card className="border-warn/50">
          <CardHeader className="border-warn/30">
            <CardTitle className="text-warn">Check before you run this</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.warnings.map((w) => (
              <p key={w} className="text-sm leading-snug">
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
