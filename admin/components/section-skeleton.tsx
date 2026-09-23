// Generic Suspense fallback for a single-table/panel page section — used by
// every admin page below except the dashboard (which has its own more
// specific skeletons in dashboard-skeletons.tsx). Keeping one shared shape
// here instead of a bespoke skeleton per page is deliberate: these pages
// are all fundamentally "one table streamed in behind a header", so one
// generic pulse block covers all of them without extra files to maintain.

export function SectionSkeleton() {
  return <div className="glass h-64 animate-pulse rounded-xl" />;
}
