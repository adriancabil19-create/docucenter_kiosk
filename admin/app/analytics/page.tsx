import { getAnalytics } from '@/lib/backend';
import type { Analytics } from '@/lib/types';
import { AnalyticsPanel } from '@/components/analytics-panel';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  let analytics: Analytics | null = null;
  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    const res = await getAnalytics({ from: from.toISOString(), to: now.toISOString() });
    analytics = res.analytics;
  } catch {
    // Backend unavailable at SSR time.
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Revenue, usage, and demand patterns from transactions and print jobs.
        </p>
      </div>

      <AnalyticsPanel initial={analytics} />
    </div>
  );
}
