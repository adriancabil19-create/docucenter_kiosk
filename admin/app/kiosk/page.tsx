import { getKioskStatus } from '@/lib/api';
import type { KioskStatus } from '@/lib/types';
import { KioskStatusPanel } from '@/components/kiosk-status-panel';

export const dynamic = 'force-dynamic';

export default async function KioskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kiosk Status</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live health check — server uptime, database, paper trays, and transaction summary.
        </p>
      </div>

      <KioskStatusPanel initialData={null} />
    </div>
  );
}
