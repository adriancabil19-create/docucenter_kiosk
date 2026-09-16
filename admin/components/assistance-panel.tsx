'use client';

import { useMemo, useRef, useState } from 'react';
import { Button, addToast } from '@heroui/react';
import type { AssistanceRequest, AssistanceStatus, StaffNotification } from '@/lib/types';
import {
  getAssistanceRequests,
  acknowledgeAssistanceRequest,
  resolveAssistanceRequest,
  cancelAssistanceRequest,
  getNotifications,
  markNotificationRead,
} from '@/lib/api';
import { usePoll } from '@/lib/use-poll';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const STATUS_STYLE: Record<AssistanceStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 ring-amber-500/30',
  ACKNOWLEDGED: 'bg-blue-500/15 text-blue-700 ring-blue-500/30',
  RESOLVED: 'bg-green-500/15 text-green-700 ring-green-500/30',
  CANCELLED: 'bg-slate-500/15 text-slate-600 ring-slate-500/20',
  EXPIRED: 'bg-red-500/15 text-red-700 ring-red-500/30',
};

function StatusPill({ status }: { status: AssistanceStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 capitalize ${STATUS_STYLE[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

/** Two-step inline confirm — same idiom used across the console (see staff-panel's ConfirmButton). */
function ConfirmButton({
  label,
  confirmLabel,
  color = 'default',
  busy,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  busy: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handle = () => {
    if (armed) {
      if (timer.current) clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
    }
  };
  return (
    <Button size="sm" variant="flat" color={armed ? 'danger' : color} isLoading={busy} onPress={handle}>
      {armed ? confirmLabel : label}
    </Button>
  );
}

function RequestRow({
  request,
  actor,
  onChanged,
}: {
  request: AssistanceRequest;
  actor: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const acknowledge = async () => {
    setBusy(true);
    try {
      const res = await acknowledgeAssistanceRequest(request.id, actor);
      if (!res.success) throw new Error(res.error ?? 'Failed to acknowledge');
      addToast({ title: 'Request acknowledged', description: `Kiosk ${request.kiosk_id}`, color: 'success' });
      onChanged();
    } catch (err) {
      addToast({ title: 'Could not acknowledge', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    setBusy(true);
    try {
      const res = await resolveAssistanceRequest(request.id, actor);
      if (!res.success) throw new Error(res.error ?? 'Failed to resolve');
      addToast({ title: 'Marked resolved', description: `Kiosk ${request.kiosk_id}`, color: 'success' });
      onChanged();
    } catch (err) {
      addToast({ title: 'Could not resolve', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await cancelAssistanceRequest(request.id, actor);
      if (!res.success) throw new Error(res.error ?? 'Failed to cancel');
      addToast({ title: 'Request cancelled', color: 'success' });
      onChanged();
    } catch (err) {
      addToast({ title: 'Could not cancel', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">Kiosk {request.kiosk_id}</span>
          <StatusPill status={request.status} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Requested {when(request.requested_at)}
          {request.acknowledged_by ? ` · assigned to ${request.acknowledged_by}` : ''}
          {request.resolved_by ? ` · resolved by ${request.resolved_by}` : ''}
        </p>
        {request.message && <p className="mt-1 text-sm text-slate-700">&ldquo;{request.message}&rdquo;</p>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {request.status === 'PENDING' && (
          <>
            <Button size="sm" color="primary" isLoading={busy} onPress={acknowledge}>
              Acknowledge
            </Button>
            <ConfirmButton label="Cancel" confirmLabel="Confirm?" color="danger" busy={busy} onConfirm={cancel} />
          </>
        )}
        {request.status === 'ACKNOWLEDGED' && (
          <>
            <Button size="sm" color="success" isLoading={busy} onPress={resolve}>
              Mark Resolved
            </Button>
            <ConfirmButton label="Cancel" confirmLabel="Confirm?" color="danger" busy={busy} onConfirm={cancel} />
          </>
        )}
      </div>
    </div>
  );
}

export function AssistancePanel({ actor }: { actor: string }) {
  const [tab, setTab] = useState<'active' | 'history' | 'all'>('active');

  const requestsFetcher = useMemo(
    () => () =>
      getAssistanceRequests({ limit: 200 }).then((r) =>
        tab === 'active'
          ? r.requests.filter((req) => req.status === 'PENDING' || req.status === 'ACKNOWLEDGED')
          : tab === 'history'
            ? r.requests.filter((req) => req.status !== 'PENDING' && req.status !== 'ACKNOWLEDGED')
            : r.requests,
      ),
    [tab],
  );
  const { data, error, loading, refresh, updatedAt } = usePoll<AssistanceRequest[]>(requestsFetcher, 8000, []);
  const requests = data ?? [];

  const notificationsFetcher = useMemo(() => () => getNotifications({ status: 'UNREAD', limit: 20 }), []);
  const { data: notifData, refresh: refreshNotifications } = usePoll(notificationsFetcher, 8000, null);
  const notifications: StaffNotification[] = notifData?.notifications ?? [];

  const dismiss = async (n: StaffNotification) => {
    try {
      await markNotificationRead(n.id);
      refreshNotifications();
    } catch {
      // Non-critical — the badge will just clear once the request is acknowledged instead.
    }
  };

  return (
    <div className="space-y-6">
      {notifications.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            🔔 New Assistance Requests ({notifications.length})
          </h2>
          <div className="space-y-2">
            {notifications.map((n) => (
              <div key={n.id} className="glass-inset flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Kiosk {n.kiosk_id} is requesting assistance</p>
                  <p className="text-xs text-slate-500">Requested {when(n.requested_at)}</p>
                </div>
                <Button size="sm" variant="flat" onPress={() => dismiss(n)}>
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['active', 'history', 'all'] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? 'solid' : 'flat'}
              color={tab === t ? 'primary' : 'default'}
              className="capitalize"
              onPress={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && <span className="text-xs text-slate-400">Updated {updatedAt}</span>}
          <Button size="sm" variant="flat" isLoading={loading} onPress={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="glass border-red-300/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>}

      <div className="glass p-5">
        {requests.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {tab === 'active' ? 'No active assistance requests. 🎉' : 'Nothing to show.'}
          </p>
        ) : (
          requests.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              actor={actor}
              onChanged={() => {
                refresh();
                refreshNotifications();
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
