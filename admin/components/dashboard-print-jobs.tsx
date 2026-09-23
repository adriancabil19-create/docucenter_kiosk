import { getPrintJobs } from '@/lib/backend';
import { StatusChip } from '@/components/status-chip';
import type { PrintJob } from '@/lib/types';

export async function DashboardPrintJobs() {
  let jobs: PrintJob[] = [];
  let ok = true;
  try {
    jobs = (await getPrintJobs(5)).jobs;
  } catch {
    ok = false;
  }

  return (
    <section aria-labelledby="recent-jobs-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-jobs-heading" className="text-base font-semibold text-slate-800">
          Recent Print Jobs
        </h2>
        <a
          href="/print-jobs"
          className="rounded text-xs font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          View all print jobs<span aria-hidden="true"> →</span>
        </a>
      </div>
      <div className="glass overflow-x-auto">
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {ok ? 'No print jobs yet.' : 'Print jobs unavailable while backend is offline.'}
          </p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Five most recent print jobs</caption>
            <thead className="border-b border-white/40 bg-white/40 backdrop-blur-md">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Files
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Paper
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-white/40">
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-slate-700">
                    {job.filenames.join(', ')}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{job.paper_size}</td>
                  <td className="px-4 py-2.5">
                    <StatusChip status={job.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {new Date(job.created_at).toLocaleString('en-PH', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
