import { getSession } from '@/lib/auth';
import { PrintRecoveryPanel } from '@/components/print-recovery-panel';

export const dynamic = 'force-dynamic';

export default async function RecoveryPage() {
  const session = await getSession();
  const currentAdmin = session.user?.username ?? 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Print Recovery</h1>
        <p className="mt-1 text-sm text-slate-500">
          Staff-initiated reprints of paid transactions whose printing failed — who did it, why, and
          when. A successful recovery locks that transaction until you reauthorize another attempt.
        </p>
      </div>

      <div className="glass p-5">
        <PrintRecoveryPanel currentAdmin={currentAdmin} />
      </div>
    </div>
  );
}
