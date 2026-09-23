import { Suspense } from 'react';
import { getIncidents } from '@/lib/backend';
import type { Incident } from '@/lib/types';
import { IncidentsPanel } from '@/components/incidents-panel';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

async function AlertsContent() {
  let incidents: Incident[] = [];
  try {
    const res = await getIncidents('open', 150);
    incidents = res.incidents;
  } catch {
    // Backend unavailable at SSR time.
  }
  return <IncidentsPanel initial={incidents} />;
}

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Alerts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Structured device and error incidents reported by the kiosks — paper jams, printer
          errors, failed jobs, automatic recoveries.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <AlertsContent />
      </Suspense>
    </div>
  );
}
