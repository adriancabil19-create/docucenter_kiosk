'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger, addToast } from '@heroui/react';
import { getNotifications, getIncidents, markNotificationRead } from '@/lib/api';
import type { StaffNotification, Incident } from '@/lib/types';
import type { ConsoleRole } from '@/lib/session';
import { usePoll } from '@/lib/use-poll';
import { getPushStatus, enablePush, disablePush, type PushSupport } from '@/lib/push';

const when = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

type FeedItem =
  | { kind: 'assistance'; id: string; time: string; notification: StaffNotification }
  | { kind: 'alert'; id: string; time: string; incident: Incident };

/**
 * Notification bell (Admin + Staff, both roles) — poll interval is this
 * app's one and only "real-time" mechanism (polling, not WebSockets, by
 * design across the whole console — fleet/heartbeat/assistance all work the
 * same way). Combines what used to be the invisible NotificationWatcher
 * (toast pop-ups for new items) with a visible badge + dropdown so
 * notifications aren't only a fly-by toast — they stay listed until read.
 */
export function NotificationBell({ role }: { role: ConsoleRole | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [pushStatus, setPushStatus] = useState<PushSupport>('unsubscribed');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushStatus === 'subscribed') {
        await disablePush();
        setPushStatus('unsubscribed');
        addToast({ title: 'Phone notifications turned off', color: 'default' });
      } else {
        const result = await enablePush();
        if (result.success) {
          setPushStatus('subscribed');
          addToast({ title: 'Phone notifications enabled', color: 'success' });
        } else {
          addToast({ title: 'Could not enable notifications', description: result.error, color: 'danger' });
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const notifFetcher = useMemo(
    () => () => getNotifications({ status: 'UNREAD', limit: 20 }).then((r) => r.notifications),
    [],
  );
  const { data: notifications, refresh: refreshNotifications } = usePoll<StaffNotification[]>(
    notifFetcher,
    8000,
    [],
  );

  // STAFF cannot call api/fleet/incidents (see the backend proxy's role
  // allow-list) — only poll it as ADMIN, so a STAFF session never 403s here.
  const incidentFetcher = useMemo(
    () => () => (role === 'ADMIN' ? getIncidents('open', 50).then((r) => r.incidents) : Promise.resolve([])),
    [role],
  );
  const { data: incidents } = usePoll<Incident[]>(incidentFetcher, 15000, []);

  // Toast pop-ups for genuinely NEW items only (ids not seen since mount) —
  // the existing backlog at page-load doesn't spam toasts.
  const seenNotifIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!notifications) return;
    if (seenNotifIds.current === null) {
      seenNotifIds.current = new Set(notifications.map((n) => n.id));
      return;
    }
    for (const n of notifications) {
      if (seenNotifIds.current.has(n.id)) continue;
      seenNotifIds.current.add(n.id);
      addToast({
        title: '🔔 New Assistance Request',
        description: `Kiosk ${n.kiosk_id} is requesting assistance — ${when(n.requested_at)}`,
        color: 'warning',
      });
    }
  }, [notifications]);

  const seenIncidentIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!incidents) return;
    if (seenIncidentIds.current === null) {
      seenIncidentIds.current = new Set(incidents.map((i) => i.id));
      return;
    }
    for (const i of incidents) {
      if (seenIncidentIds.current.has(i.id)) continue;
      seenIncidentIds.current.add(i.id);
      addToast({
        title: i.severity === 'critical' ? '🔴 New Critical Alert' : '🚨 New Alert',
        description: `${i.message} (${i.kiosk_id})`,
        color: i.severity === 'critical' ? 'danger' : 'warning',
      });
    }
  }, [incidents]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...(notifications ?? []).map((n): FeedItem => ({
        kind: 'assistance',
        id: `a-${n.id}`,
        time: n.requested_at,
        notification: n,
      })),
      ...(incidents ?? []).map((i): FeedItem => ({ kind: 'alert', id: `i-${i.id}`, time: i.created_at, incident: i })),
    ];
    return items.sort((a, b) => (a.time < b.time ? 1 : -1));
  }, [notifications, incidents]);

  const unreadCount = feed.length;

  const openAssistance = async (item: Extract<FeedItem, { kind: 'assistance' }>) => {
    setOpen(false);
    try {
      await markNotificationRead(item.notification.id);
    } catch {
      // Non-critical — it'll still clear once the request is acknowledged.
    }
    refreshNotifications();
    router.push('/assistance');
  };

  const openAlert = () => {
    setOpen(false);
    router.push('/alerts');
  };

  return (
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="glass fixed right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full text-slate-700 shadow-lg"
        >
          <Badge
            content={unreadCount > 0 ? unreadCount : undefined}
            color="danger"
            isInvisible={unreadCount === 0}
            shape="circle"
          >
            <span className="text-lg" aria-hidden="true">
              🔔
            </span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="max-h-96 w-full overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/40 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            {unreadCount > 0 && <span className="text-xs text-slate-500">{unreadCount} unread</span>}
          </div>
          {feed.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
          ) : (
            <ul>
              {feed.map((item) => (
                <li key={item.id} className="border-b border-white/40 last:border-0">
                  {item.kind === 'assistance' ? (
                    <button
                      type="button"
                      onClick={() => openAssistance(item)}
                      className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-white/50"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        🔔 Kiosk {item.notification.kiosk_id} is requesting assistance
                      </span>
                      <span className="text-xs text-slate-500">{when(item.notification.requested_at)}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openAlert}
                      className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-white/50"
                    >
                      <span className="text-sm font-medium text-slate-800">
                        {item.incident.severity === 'critical' ? '🔴' : '🚨'} {item.incident.message}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.incident.kiosk_id} · {when(item.incident.created_at)}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1.5 border-t border-white/40 p-2">
            <Button
              size="sm"
              variant="flat"
              className="w-full"
              onPress={() => {
                setOpen(false);
                router.push('/assistance');
              }}
            >
              View Assistance
            </Button>
            {pushStatus !== 'unsupported' && (
              <Button size="sm" variant="flat" className="w-full" isLoading={pushBusy} onPress={togglePush}>
                {pushStatus === 'subscribed' ? '🔕 Turn off phone notifications' : '📱 Enable phone notifications'}
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
