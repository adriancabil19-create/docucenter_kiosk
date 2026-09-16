import { getSession } from '@/lib/auth';
import { AssistancePanel } from '@/components/assistance-panel';

export const dynamic = 'force-dynamic';

export default async function AssistancePage() {
  const session = await getSession();
  const actor = session.user?.name ?? session.user?.username ?? 'staff';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Assistance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Customer &ldquo;Ask for Assistance&rdquo; requests from every kiosk — acknowledge, resolve, or
          cancel, and see what&apos;s already been handled.
        </p>
      </div>

      <div className="glass p-5">
        <AssistancePanel actor={actor} />
      </div>
    </div>
  );
}
