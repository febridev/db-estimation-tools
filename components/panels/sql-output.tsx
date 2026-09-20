"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SqlOutput({ ddl, precheck }: { ddl: string; precheck: string }) {
  const [tab, setTab] = useState<"ddl" | "precheck">("ddl");
  const [copied, setCopied] = useState(false);
  const body = tab === "ddl" ? ddl : precheck;

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>4 · SQL</CardTitle>
        <CardDescription>Run the checks first, then the build.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["precheck", "ddl"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
              )}
            >
              {t === "precheck" ? "Pre-flight checks" : "Create index"}
            </button>
          ))}
          <Button variant="subtle" size="sm" className="ml-auto" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          {body}
        </pre>
      </CardContent>
    </Card>
  );
}
