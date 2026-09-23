import { getHealth } from '@/lib/backend';

async function isServerOnline(): Promise<boolean> {
  try {
    const health = await getHealth();
    return health.success === true;
  } catch {
    return false;
  }
}

/** The small chip in the dashboard header. Streams independently of the
 * data sections below so a slow/offline backend never delays it. */
export async function ServerStatusChip() {
  const online = await isServerOnline();
  return (
    <div className="glass flex items-center gap-2 rounded-lg px-3 py-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-xs font-medium text-slate-600">
        {online ? 'Server Online' : 'Server Offline'}
      </span>
    </div>
  );
}

/** The full-width warning banner. A separate `getHealth()` call from the
 * chip above — both are cheap pings, and keeping them independent lets
 * each stream in on its own rather than one being blocked waiting on the
 * other's Suspense boundary to resolve. */
export async function ServerOfflineBanner() {
  const online = await isServerOnline();
  if (online) return null;
  return (
    <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 backdrop-blur-md">
      <strong>Backend unavailable.</strong> Live transactions, print jobs, paper levels, and kiosk
      status could not be refreshed. The empty tables below do not mean there is no data.
    </div>
  );
}
