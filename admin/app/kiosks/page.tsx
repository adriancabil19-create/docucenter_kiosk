import { Suspense } from 'react';
import { getKiosks } from '@/lib/backend';
import type { Kiosk } from '@/lib/types';
import { KioskFleetPanel } from '@/components/kiosk-fleet-panel';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

async function KiosksContent() {
  let kiosks: Kiosk[] = [];
  try {
    const res = await getKiosks();
    kiosks = res.kiosks;
  } catch {
    // Backend unavailable at SSR time — the client panel will retry.
  }
  return <KioskFleetPanel initial={kiosks} />;
}

export default function KiosksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Kiosks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live fleet status from device heartbeats. Send maintenance, printing, and restart
          commands — the kiosk applies them on its next poll.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <KiosksContent />
      </Suspense>
    </div>
  );
}
