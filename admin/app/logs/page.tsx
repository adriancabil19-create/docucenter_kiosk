import { getLogs } from '@/lib/api';
import type { ActivityLog } from '@/lib/types';
import { ActivityLogTable } from '@/components/activity-log-table';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  let logs: ActivityLog[] = [];
  try {
    const res = await getLogs(200);
    logs = res.logs;
  } catch {
    // Server unavailable at build/SSR time
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Admin-level events: payment cancellations, paper refills, system alerts.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <ActivityLogTable initialData={logs} />
      </div>
    </div>
  );
}
