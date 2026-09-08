'use client';

import { useMemo, useRef, useState } from 'react';
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

/**
 * Command button with an inline two-step confirm for the disruptive actions —
 * first click arms it (relabels to "Confirm?"), second click within 4s fires.
 * Avoids window.confirm(), which some embedded/hardened browsers suppress.
 */
function CmdButton({
  label,
  confirmLabel,
  command,
  color,
  busy,
  onRun,
}: {
  label: string;
  confirmLabel?: string;
  command: KioskCommandName;
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  busy: KioskCommandName | null;
  onRun: (command: KioskCommandName) => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  const handle = () => {
    if (!confirmLabel) {
      onRun(command);
      return;
    }
    if (armed) {
      disarm();
      onRun(command);
    } else {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
    }
  };

  return (
    <Button
      size="sm"
      variant="flat"
      color={armed ? 'danger' : color ?? 'default'}
      isLoading={busy === command}
      onPress={handle}
    >
      {armed ? (confirmLabel ?? `Confirm ${label}?`) : label}
    </Button>
  );
}

function KioskCard({ kiosk, onDone }: { kiosk: Kiosk; onDone: () => void }) {
  const [busy, setBusy] = useState<KioskCommandName | null>(null);

  const run = async (command: KioskCommandName) => {
    setBusy(command);
    try {
      await sendKioskCommand(kiosk.kiosk_id, command);
      addToast({
        title: 'Command sent',
        description: `${command} → ${kiosk.kiosk_id}. Applies on the kiosk's next poll (~5s).`,
        color: 'success',
      });
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
        {kiosk.maintenance && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">
            Maintenance
          </span>
        )}
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
          <CmdButton label="End maintenance" command="MAINTENANCE_OFF" color="success" busy={busy} onRun={run} />
        ) : (
          <CmdButton
            label="Maintenance mode"
            confirmLabel="Confirm — block customers?"
            command="MAINTENANCE_ON"
            color="warning"
            busy={busy}
            onRun={run}
          />
        )}
        {kiosk.printing_disabled ? (
          <CmdButton label="Enable printing" command="ENABLE_PRINTING" busy={busy} onRun={run} />
        ) : (
          <CmdButton label="Disable printing" command="DISABLE_PRINTING" busy={busy} onRun={run} />
        )}
        <CmdButton
          label="Restart printer"
          confirmLabel="Confirm restart printer?"
          command="RESTART_PRINTER"
          busy={busy}
          onRun={run}
        />
        <CmdButton
          label="Restart app"
          confirmLabel="Confirm restart app?"
          command="RESTART_APP"
          color="danger"
          busy={busy}
          onRun={run}
        />
      </div>
    </div>
  );
}

export function KioskFleetPanel({ initial }: { initial: Kiosk[] | null }) {
  const fetcher = useMemo(() => () => getKiosks().then((r) => r.kiosks), []);
  const { data, error, loading, refresh, updatedAt } = usePoll<Kiosk[]>(fetcher, 15000, initial);
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
