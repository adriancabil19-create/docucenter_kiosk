import { getSession } from '@/lib/auth';
import { StaffPanel } from '@/components/staff-panel';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const session = await getSession();
  const currentAdmin = session.user?.username ?? 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create and manage staff accounts for the kiosk&apos;s on-device Staff Mode, and approve or
          deny PIN-recovery requests.
        </p>
      </div>

      <div className="glass p-5">
        <StaffPanel currentAdmin={currentAdmin} />
      </div>
    </div>
  );
}
