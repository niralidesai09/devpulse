// Shown instantly while a page loads its data from Supabase.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      <div className="mt-3 h-7 w-3/4 max-w-lg animate-pulse rounded bg-surface-2" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <p className="sr-only">Loading…</p>
    </main>
  );
}
