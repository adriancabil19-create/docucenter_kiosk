import { Suspense } from 'react';
import { getPaperTrays } from '@/lib/backend';
import type { PaperTray } from '@/lib/types';
import { PaperTraysManager } from '@/components/paper-trays-manager';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

async function PaperContent() {
  let trays: PaperTray[] = [];
  try {
    const res = await getPaperTrays();
    trays = res.data;
  } catch {
    // Server unavailable at build/SSR time
  }
  return <PaperTraysManager initialData={trays} />;
}

export default function PaperPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Paper Trays</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor paper levels and refill trays. Set alert thresholds to get notified when paper is
          running low.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <PaperContent />
      </Suspense>
    </div>
  );
}
