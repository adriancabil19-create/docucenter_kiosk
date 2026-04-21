import { getPaperTrays } from '@/lib/api';
import type { PaperTray } from '@/lib/types';
import { PaperTraysManager } from '@/components/paper-trays-manager';

export const dynamic = 'force-dynamic';

export default async function PaperPage() {
  let trays: PaperTray[] = [];
  try {
    const res = await getPaperTrays();
    trays = res.data;
  } catch {
    // Server unavailable at build/SSR time
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paper Trays</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor paper levels and refill trays. Set alert thresholds to get notified when paper is
          running low.
        </p>
      </div>

      <PaperTraysManager initialData={trays} />
    </div>
  );
}
