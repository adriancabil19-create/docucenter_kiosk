// Suspense fallbacks for the dashboard — each mirrors the shape of the
// section it stands in for so the layout doesn't jump when the real content
// streams in.

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass h-[92px] animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

export function ServerStatusChipSkeleton() {
  return (
    <div className="glass flex items-center gap-2 rounded-lg px-3 py-1.5">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-300" />
      <span className="text-xs font-medium text-slate-400">Checking…</span>
    </div>
  );
}

export function TableSectionSkeleton({ title }: { title: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="glass h-48 animate-pulse rounded-xl" />
    </section>
  );
}
