import { getKiosks } from '@/lib/backend';
import type { Kiosk } from '@/lib/types';
import { KioskFleetPanel } from '@/components/kiosk-fleet-panel';

export const dynamic = 'force-dynamic';

export default async function KiosksPage() {
  let kiosks: Kiosk[] = [];
  try {
    const res = await getKiosks();
    kiosks = res.kiosks;
  } catch {
    // Backend unavailable at SSR time — the client panel will retry.
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Kiosks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live fleet status from device heartbeats. Send maintenance, printing, and restart
          commands — the kiosk applies them on its next poll.
        </p>
      </div>

      <KioskFleetPanel initial={kiosks} />
    </div>
  );
}
