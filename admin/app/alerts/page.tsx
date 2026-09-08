import { getIncidents } from '@/lib/backend';
import type { Incident } from '@/lib/types';
import { IncidentsPanel } from '@/components/incidents-panel';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  let incidents: Incident[] = [];
  try {
    const res = await getIncidents('open', 150);
    incidents = res.incidents;
  } catch {
    // Backend unavailable at SSR time.
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Alerts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Structured device and error incidents reported by the kiosks — paper jams, printer
          errors, failed jobs, automatic recoveries.
        </p>
      </div>

      <IncidentsPanel initial={incidents} />
    </div>
  );
}
