export default function PostgresPlaceholder() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl pb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          PostgreSQL Tool
        </h1>
        <p className="pt-3 text-base leading-relaxed text-muted-foreground">
          This tool is under development. It will help you estimate index sizes, plan partitions, and generate migration scripts for PostgreSQL.
        </p>
      </header>
    </main>
  );
}
