import { getStats } from '@/lib/backend';
import { StatCard } from '@/components/stat-card';
import type { MonitoringStats } from '@/lib/types';

export async function DashboardStats() {
  let stats: MonitoringStats | null = null;
  try {
    stats = (await getStats()).stats;
  } catch {
    // Backend unavailable at SSR time — cards fall back to placeholders below.
  }

  return (
    // One per row on phones (there isn't room for two without truncating/
    // wrapping labels like "TOTAL TRANSACTIONS"), 2 from `sm`, 4 from `lg`.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
  );
}
