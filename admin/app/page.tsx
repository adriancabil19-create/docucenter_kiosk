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
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">DocuCenter Kiosk — live monitoring overview</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              serverOnline ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs font-medium text-gray-600">
            {serverOnline ? 'Server Online' : 'Server Offline'}
          </span>
        </div>
      </div>

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
        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-800">⚠️ Paper Alerts</h2>
            <p className="text-sm text-gray-500">Trays running low on paper</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paperAlerts.map((alert) => (
              <div key={alert.tray_name} className="rounded-lg border border-red-200 bg-red-50 p-4">
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
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Recent Transactions</h2>
          <a href="/transactions" className="text-xs font-medium text-blue-600 hover:underline">
            View all →
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {transactions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Reference
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-mono text-xs">{tx.reference_number}</td>
                    <td className="px-4 py-2.5 font-semibold">₱{tx.amount.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <StatusChip status={tx.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
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
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Recent Print Jobs</h2>
          <a href="/print-jobs" className="text-xs font-medium text-blue-600 hover:underline">
            View all →
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No print jobs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Files
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Paper
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50/60">
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-gray-700">
                      {job.filenames.join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{job.paper_size}</td>
                    <td className="px-4 py-2.5">
                      <StatusChip status={job.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
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
