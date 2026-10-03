export default function OracleLanding() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Oracle Database
        </h1>
        <p className="pt-3 text-base leading-relaxed text-muted-foreground">
          Tools for working with Oracle indexes — estimation, sizing, and planning.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href="/oracle/index-estimator"
          className="rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
        >
          <h3 className="text-base font-semibold">Index Estimator</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Estimate segment size, TEMP space, and UNDO requirements before building a new index. Paste a CREATE TABLE statement and get production-ready SQL.
          </p>
        </a>
      </div>
    </main>
  );
}
