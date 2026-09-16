'use client';

import { useEffect, useMemo, useRef } from 'react';
import { addToast } from '@heroui/react';
import { getNotifications, getIncidents } from '@/lib/api';
import type { StaffNotification, Incident } from '@/lib/types';
import type { ConsoleRole } from '@/lib/session';
import { usePoll } from '@/lib/use-poll';

const when = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

/**
 * App-wide toast pop-ups for new Assistance requests and (Admin only) new
 * open Alerts — mounted once alongside the nav so it fires no matter which
 * page is open, not only while viewing /assistance or /alerts. No visual
 * output of its own; it only watches and calls addToast.
 *
 * Only genuinely NEW items (ids not seen since this watcher mounted) pop a
 * toast — the existing backlog at page-load/refresh does not spam toasts.
 */
export function NotificationWatcher({ role }: { role: ConsoleRole | null }) {
  const notifFetcher = useMemo(
    () => () => getNotifications({ status: 'UNREAD', limit: 20 }).then((r) => r.notifications),
    [],
  );
  const { data: notifications } = usePoll<StaffNotification[]>(notifFetcher, 8000, []);

  // STAFF cannot call api/fleet/incidents (see the backend proxy's role
  // allow-list) — only poll it as ADMIN, so a STAFF session never 403s here.
  const incidentFetcher = useMemo(
    () => () => (role === 'ADMIN' ? getIncidents('open', 50).then((r) => r.incidents) : Promise.resolve([])),
    [role],
  );
  const { data: incidents } = usePoll<Incident[]>(incidentFetcher, 15000, []);

  const seenNotifIds = useRef<Set<string> | null>(null);
  const seenIncidentIds = useRef<Set<string> | null>(null);

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

  return null;
}
