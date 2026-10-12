// Shown instantly while a page reads the database: mirrors the page layout
// (header, ruled ledger, two-column body) so nothing jumps when data lands.
export default function Loading() {
  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6 lg:px-10 lg:py-8" aria-busy="true">
      <div className="border-b border-line pb-5">
        <div className="h-8 w-2/3 max-w-md animate-pulse rounded bg-surface-2" />
        <div className="mt-3 h-4 w-1/2 max-w-sm animate-pulse rounded bg-surface-2" />
      </div>
      <div className="mt-8 grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`space-y-2 py-4 pr-4 ${i ? "pl-4 lg:border-l lg:border-line" : ""}`}>
            <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
            <div className="h-8 w-16 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-10 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-3">
          <div className="h-7 w-4/5 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-surface-2" />
          <div className="h-24 animate-pulse rounded bg-surface-2/70" />
        </div>
        <div className="h-48 animate-pulse rounded bg-surface-2/70" />
      </div>
      <p className="sr-only">Loading…</p>
    </main>
  );
}
