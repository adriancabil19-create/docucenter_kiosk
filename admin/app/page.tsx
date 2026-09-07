import { getStats, getTransactions, getPrintJobs, getHealth, getPaperAlerts } from '@/lib/api';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [statsRes, txRes, jobsRes, healthRes, alertsRes] = await Promise.allSettled([
    getStats(),
    getTransactions(5),
    getPrintJobs(5),
    getHealth(),
    getPaperAlerts(),
  ]);

  const stats = statsRes.status === 'fulfilled' ? statsRes.value.stats : null;
  const transactions = txRes.status === 'fulfilled' ? txRes.value.transactions : [];
  const jobs = jobsRes.status === 'fulfilled' ? jobsRes.value.jobs : [];
  const health = healthRes.status === 'fulfilled' ? healthRes.value : null;
  const paperAlerts = alertsRes.status === 'fulfilled' ? alertsRes.value.data : [];

  const serverOnline = health?.success === true;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">DocuCenter Kiosk — live monitoring overview</p>
        </div>
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              serverOnline ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs font-medium text-slate-600">
            {serverOnline ? 'Server Online' : 'Server Offline'}
          </span>
        </div>
      </div>

      {!serverOnline && (
        <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 backdrop-blur-md">
          <strong>Backend unavailable.</strong> Live transactions, print jobs, paper levels, and
          kiosk status could not be refreshed. The empty tables below do not mean there is no data.
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Transactions"
          value={stats?.totalTransactions ?? '—'}
          icon="📋"
          color="primary"
        />
        <StatCard
          label="Revenue (PHP)"
          value={stats ? `₱${stats.totalRevenue.toFixed(2)}` : '—'}
          icon="💰"
          color="success"
          sub={`${stats?.successfulTransactions ?? 0} successful`}
        />
        <StatCard
          label="Print Jobs"
          value={stats?.totalPrintJobs ?? '—'}
          icon="🖨️"
          color="default"
          sub={`${stats?.realPrintJobs ?? 0} real · ${stats?.simulatedPrintJobs ?? 0} simulated`}
        />
        <StatCard
          label="Pending"
          value={stats?.pendingTransactions ?? '—'}
          icon="⏳"
          color={stats && stats.pendingTransactions > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Paper Alerts */}
      {paperAlerts.length > 0 && (
        <section aria-labelledby="paper-alerts-heading">
          <div className="mb-3">
            <h2 id="paper-alerts-heading" className="text-base font-semibold text-slate-800">
              <span aria-hidden="true">⚠️ </span>Paper Alerts
            </h2>
            <p className="text-sm text-slate-600">Trays running low on paper</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paperAlerts.map((alert) => (
              <div
                key={alert.tray_name}
                className="rounded-xl border border-red-300/40 bg-red-500/10 p-4 backdrop-blur-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-red-900">{alert.tray_name}</h3>
                    <p className="text-sm text-red-700">{alert.current_count} sheets remaining</p>
                    <p className="text-xs text-red-600">Threshold: {alert.threshold} sheets</p>
                  </div>
                  <div className="text-2xl">📄</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Transactions */}
      <section aria-labelledby="recent-tx-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-tx-heading" className="text-base font-semibold text-slate-800">
            Recent Transactions
          </h2>
          <a
            href="/transactions"
            className="rounded text-xs font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            View all transactions<span aria-hidden="true"> →</span>
          </a>
        </div>
        <div className="glass overflow-hidden">
          {transactions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {serverOnline ? 'No transactions yet.' : 'Transactions unavailable while backend is offline.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Five most recent payment transactions</caption>
              <thead className="border-b border-white/40 bg-white/40 backdrop-blur-md">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                    Reference
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                    Amount
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
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{tx.reference_number}</td>
                    <td className="px-4 py-2.5 font-semibold">₱{tx.amount.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <StatusChip status={tx.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {new Date(tx.created_at).toLocaleString('en-PH', {
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

      {/* Recent Print Jobs */}
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
        <div className="glass overflow-hidden">
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              {serverOnline ? 'No print jobs yet.' : 'Print jobs unavailable while backend is offline.'}
            </p>
          ) : (
            <table className="w-full text-sm">
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
    </div>
  );
}
