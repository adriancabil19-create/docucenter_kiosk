import { Suspense } from 'react';
import { getLogs } from '@/lib/backend';
import type { ActivityLog } from '@/lib/types';
import { ActivityLogTable } from '@/components/activity-log-table';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

async function LogsContent() {
  let logs: ActivityLog[] = [];
  try {
    const res = await getLogs(200);
    logs = res.logs;
  } catch {
    // Server unavailable at build/SSR time
  }
  return (
    <div className="glass p-5">
      <ActivityLogTable initialData={logs} />
    </div>
  );
}

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Activity Logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Admin-level events: payment cancellations, paper refills, system alerts.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <LogsContent />
      </Suspense>
    </div>
  );
}
