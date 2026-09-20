"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildDerivation, derivationToText } from "@/lib/explain";
import type { EstimatorInput, EstimatorResult } from "@/lib/types";

export function Derivation({
  input,
  result,
}: {
  input: EstimatorInput;
  result: EstimatorResult;
}) {
  const steps = useMemo(() => buildDerivation(input, result), [input, result]);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(derivationToText(input, steps));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>How this is calculated</CardTitle>
        <CardDescription>
          Every step with its numbers filled in, in the order the engine runs them.
          Copy it to check against your own calculation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        <div className="pb-3">
          <Button variant="subtle" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy as text"}
          </Button>
        </div>
        <ol className="space-y-0">
          {steps.map((step, i) => (
            <li key={step.id} className="grid gap-1 border-t py-3 sm:grid-cols-[1.4rem_1fr]">
              <span className="numeric pt-0.5 text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <span className="numeric text-sm font-medium">{step.value}</span>
                </div>
                <p className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                  {step.formula}
                </p>
                <p className="numeric overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                  {step.substitution}
                </p>
                {step.note ? (
                  <p className="text-xs leading-snug text-muted-foreground">{step.note}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
