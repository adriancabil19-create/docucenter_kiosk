'use client';

import { useMemo, useState } from 'react';
import { Button, addToast } from '@heroui/react';
import type { Incident, IncidentSeverity } from '@/lib/types';
import { getIncidents, resolveIncident } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';

const sevStyle: Record<IncidentSeverity, string> = {
  critical: 'bg-red-500/15 text-red-700 ring-red-500/30',
  warning: 'bg-amber-500/15 text-amber-700 ring-amber-500/30',
  info: 'bg-slate-500/15 text-slate-600 ring-slate-500/20',
};
const sevIcon: Record<IncidentSeverity, string> = { critical: '🔴', warning: '🟠', info: 'ℹ️' };

const when = (iso: string) => new Date(iso).toLocaleString('en-PH');

function Row({ incident, onResolved }: { incident: Incident; onResolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const resolve = async () => {
    setBusy(true);
    try {
      await resolveIncident(incident.id);
      addToast({ title: 'Incident resolved', color: 'success' });
      onResolved();
    } catch (err) {
      addToast({ title: 'Could not resolve', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/40 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${sevStyle[incident.severity]}`}
          >
            <span aria-hidden="true">{sevIcon[incident.severity]}</span>
            {incident.severity}
          </span>
          <span className="font-mono text-xs text-slate-500">{incident.error_code}</span>
          <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-xs text-slate-600">
            {incident.device}
          </span>
          <span className="text-xs text-slate-400">{incident.kiosk_id}</span>
        </div>
        <p className="mt-1 text-sm text-slate-800">{incident.message}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {when(incident.created_at)}
          {incident.status === 'resolved' && incident.resolved_at
            ? ` · resolved ${when(incident.resolved_at)}`
            : ''}
        </p>
      </div>
      {incident.status === 'open' ? (
        <Button size="sm" variant="flat" isLoading={busy} onPress={resolve}>
          Resolve
        </Button>
      ) : (
        <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700">
          Resolved
        </span>
      )}
    </div>
  );
}

export function IncidentsPanel({ initial }: { initial: Incident[] | null }) {
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const fetcher = useMemo(() => () => getIncidents(tab, 150).then((r) => r.incidents), [tab]);
  const { data, error, loading, refresh, updatedAt } = usePoll<Incident[]>(fetcher, 20000, initial);
  const incidents = data ?? initial ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(['open', 'resolved'] as const).map((t) => (
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
          <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="glass border-red-300/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="glass p-5">
        {incidents.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {tab === 'open' ? 'No open incidents. All clear. 🎉' : 'No resolved incidents yet.'}
          </p>
        ) : (
          incidents.map((i) => <Row key={i.id} incident={i} onResolved={refresh} />)
        )}
      </div>
    </div>
  );
}
