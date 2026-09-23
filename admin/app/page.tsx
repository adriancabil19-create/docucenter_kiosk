import { Suspense } from 'react';
import { DashboardStats } from '@/components/dashboard-stats';
import { DashboardPaperAlerts } from '@/components/dashboard-paper-alerts';
import { DashboardTransactions } from '@/components/dashboard-transactions';
import { DashboardPrintJobs } from '@/components/dashboard-print-jobs';
import { ServerStatusChip, ServerOfflineBanner } from '@/components/dashboard-server-status';
import {
  StatCardsSkeleton,
  ServerStatusChipSkeleton,
  TableSectionSkeleton,
} from '@/components/dashboard-skeletons';

export const dynamic = 'force-dynamic';

// The old version of this page `await`ed five backend calls (stats,
// transactions, print jobs, health, paper alerts) before rendering
// anything — one slow call held up the whole page. Each section below is
// its own Server Component streamed in behind a `Suspense` boundary: the
// header and shell paint immediately, and each section fills in
// independently as its own fetch resolves (or fails — see
// backendFetch's timeout in lib/backend.ts).
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">DocuCenter Kiosk — live monitoring overview</p>
        </div>
        <Suspense fallback={<ServerStatusChipSkeleton />}>
          <ServerStatusChip />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <ServerOfflineBanner />
      </Suspense>

      <Suspense fallback={<StatCardsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <Suspense fallback={null}>
        <DashboardPaperAlerts />
      </Suspense>

      <Suspense fallback={<TableSectionSkeleton title="Recent Transactions" />}>
        <DashboardTransactions />
      </Suspense>

      <Suspense fallback={<TableSectionSkeleton title="Recent Print Jobs" />}>
        <DashboardPrintJobs />
      </Suspense>
    </div>
  );
}
