'use client';

import { useMemo, useState } from 'react';
import { Button, addToast } from '@heroui/react';
import type { Kiosk, KioskCommandName } from '@/lib/types';
import { getKiosks, sendKioskCommand } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';

const dot = (status: Kiosk['status']) =>
  status === 'ONLINE'
    ? 'bg-green-500'
    : status === 'MAINTENANCE'
      ? 'bg-amber-400'
      : 'bg-red-500';

const relative = (iso: string) => {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return '—';
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

function DeviceChip({ label, state }: { label: string; state: string }) {
  const good = /READY|ONLINE|OK/i.test(state);
  const bad = /OFFLINE|ERROR|JAM/i.test(state);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        good
          ? 'bg-green-500/15 text-green-700'
          : bad
            ? 'bg-red-500/15 text-red-700'
            : 'bg-slate-500/15 text-slate-600'
      }`}
    >
      {label}: {state}
    </span>
  );
}

function KioskCard({
  kiosk,
  onDone,
}: {
  kiosk: Kiosk;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<KioskCommandName | null>(null);

  const run = async (command: KioskCommandName, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(command);
    try {
      await sendKioskCommand(kiosk.kiosk_id, command);
      addToast({ title: 'Command queued', description: `${command} → ${kiosk.kiosk_id}`, color: 'success' });
      onDone();
    } catch (err) {
      addToast({ title: 'Command failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dot(kiosk.status)}`} />
            <p className="font-semibold text-slate-800">{kiosk.label ?? kiosk.kiosk_id}</p>
            <span className="text-xs text-slate-400">{kiosk.kiosk_id}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {kiosk.status} · last seen {relative(kiosk.last_seen)}
            {kiosk.app_version ? ` · v${kiosk.app_version}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <DeviceChip label="Printer" state={kiosk.printer_state} />
        <DeviceChip label="Scanner" state={kiosk.scanner_state} />
        {kiosk.printing_disabled && (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700">
            Printing disabled
          </span>
        )}
        {kiosk.current_job_id && (
          <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-600">
            Job {kiosk.current_job_id}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {kiosk.maintenance ? (
          <Button size="sm" color="success" variant="flat" isLoading={busy === 'MAINTENANCE_OFF'}
            onPress={() => run('MAINTENANCE_OFF')}>
            End maintenance
          </Button>
        ) : (
          <Button size="sm" color="warning" variant="flat" isLoading={busy === 'MAINTENANCE_ON'}
            onPress={() => run('MAINTENANCE_ON', 'Put this kiosk into maintenance mode? Customers will not be able to start transactions.')}>
            Maintenance mode
          </Button>
        )}
        {kiosk.printing_disabled ? (
          <Button size="sm" variant="flat" isLoading={busy === 'ENABLE_PRINTING'}
            onPress={() => run('ENABLE_PRINTING')}>
            Enable printing
          </Button>
        ) : (
          <Button size="sm" variant="flat" isLoading={busy === 'DISABLE_PRINTING'}
            onPress={() => run('DISABLE_PRINTING')}>
            Disable printing
          </Button>
        )}
        <Button size="sm" variant="flat" isLoading={busy === 'RESTART_PRINTER'}
          onPress={() => run('RESTART_PRINTER', 'Restart the print spooler on this kiosk?')}>
          Restart printer
        </Button>
        <Button size="sm" color="danger" variant="flat" isLoading={busy === 'RESTART_APP'}
          onPress={() => run('RESTART_APP', 'Request a restart of the kiosk application?')}>
          Restart app
        </Button>
      </div>
    </div>
  );
}

export function KioskFleetPanel({ initial }: { initial: Kiosk[] | null }) {
  const fetcher = useMemo(() => () => getKiosks().then((r) => r.kiosks), []);
  const { data, error, loading, refresh, updatedAt } = usePoll<Kiosk[]>(fetcher, 8000, initial);
  const kiosks = data ?? initial ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {updatedAt ? `Live · updated ${updatedAt}` : 'Connecting…'}
        </p>
        <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="glass border-red-300/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>
      )}

      {kiosks.length === 0 ? (
        <div className="glass p-6 text-center text-sm text-slate-400">
          No kiosks have reported in yet. A kiosk appears here after its first heartbeat.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {kiosks.map((k) => (
            <KioskCard key={k.kiosk_id} kiosk={k} onDone={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
