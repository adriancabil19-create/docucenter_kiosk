import { Suspense } from 'react';
import { getAnalytics } from '@/lib/backend';
import type { Analytics } from '@/lib/types';
import { AnalyticsPanel } from '@/components/analytics-panel';
import { presetRange } from '@/lib/date-range';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

async function AnalyticsContent() {
  let analytics: Analytics | null = null;
  try {
    // Matches AnalyticsPanel's default range ('today') so the first paint
    // doesn't flash 30-day numbers under a "Today" button that's already
    // showing as selected.
    const res = await getAnalytics(presetRange(1));
    analytics = res.analytics;
  } catch {
    // Backend unavailable at SSR time.
  }
  return <AnalyticsPanel initial={analytics} />;
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Revenue, usage, and demand patterns from transactions and print jobs.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <AnalyticsContent />
      </Suspense>
    </div>
  );
}
