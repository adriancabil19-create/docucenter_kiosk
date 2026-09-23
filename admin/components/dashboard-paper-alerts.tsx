import { getPaperAlerts } from '@/lib/backend';

export async function DashboardPaperAlerts() {
  let alerts: Array<{ tray_name: string; current_count: number; threshold: number }> = [];
  try {
    alerts = (await getPaperAlerts()).data;
  } catch {
    // Backend unavailable at SSR time — no alerts shown rather than stale ones.
  }

  if (alerts.length === 0) return null;

  return (
    <section aria-labelledby="paper-alerts-heading">
      <div className="mb-3">
        <h2 id="paper-alerts-heading" className="text-base font-semibold text-slate-800">
          <span aria-hidden="true">⚠️ </span>Paper Alerts
        </h2>
        <p className="text-sm text-slate-600">Trays running low on paper</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {alerts.map((alert) => (
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
  );
}
