import { getPrintJobs } from '@/lib/api';
import type { PrintJob } from '@/lib/types';
import { PrintJobsTable } from '@/components/print-jobs-table';

export const dynamic = 'force-dynamic';

export default async function PrintJobsPage() {
  let jobs: PrintJob[] = [];
  try {
    const res = await getPrintJobs(100);
    jobs = res.jobs;
  } catch {
    // Server unavailable at build/SSR time — the client can still refresh
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Print Jobs</h1>
        <p className="mt-1 text-sm text-gray-500">
          All print and photocopy jobs dispatched by the kiosk.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <PrintJobsTable initialData={jobs} />
      </div>
    </div>
  );
}
