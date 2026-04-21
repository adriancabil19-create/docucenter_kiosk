'use client';

import { useState, useCallback } from 'react';
import { Button } from '@heroui/react';
import { addToast } from '@heroui/react';
import type { KioskStatus, PaperTray } from '@/lib/types';
import { getKioskStatus } from '@/lib/api';

interface Props {
  initialData: KioskStatus | null;
}

const fmtUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const pct = (current: number, max: number) =>
  max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

const barColor = (p: number) => {
  if (p <= 10) return 'bg-red-500';
  if (p <= 30) return 'bg-yellow-400';
  return 'bg-green-500';
};

function TrayRow({ tray }: { tray: PaperTray }) {
  const p = pct(tray.current_count, tray.max_capacity);
  const low = tray.current_count <= tray.threshold;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 font-medium text-gray-700">{tray.tray_name}</span>
      <div className="flex-1">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>
            {tray.current_count}/{tray.max_capacity}
          </span>
          <span>{p}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className={`h-full rounded-full ${barColor(p)}`} style={{ width: `${p}%` }} />
        </div>
      </div>
      {low && (
        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Low
        </span>
      )}
    </div>
  );
}

export function KioskStatusPanel({ initialData }: Props) {
  const [status, setStatus] = useState<KioskStatus | null>(initialData);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getKioskStatus();
      setStatus(res.status);
      addToast({
        title: 'Status updated',
        description: 'Kiosk status refreshed.',
        color: 'success',
      });
    } catch (err) {
      addToast({ title: 'Refresh failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, []);

  if (!status) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-700">Cannot reach kiosk backend.</p>
        <Button size="sm" variant="flat" className="mt-3" onPress={refresh} isLoading={loading}>
          Retry
        </Button>
      </div>
    );
  }

  const { server, database, paperTrays, lowPaperAlerts, stats } = status;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Last refreshed: {new Date().toLocaleTimeString('en-PH')}
        </p>
        <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
          Refresh
        </Button>
      </div>

      {/* Server & DB */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Server</p>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${server.online ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-sm font-medium text-gray-800">
              {server.online ? 'Online' : 'Offline'}
            </span>
          </div>
          <dl className="space-y-1 text-xs text-gray-500">
            <div className="flex justify-between">
              <dt>Uptime</dt>
              <dd className="font-medium text-gray-700">{fmtUptime(server.uptimeSeconds)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Environment</dt>
              <dd className="font-medium text-gray-700">{server.environment}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Version</dt>
              <dd className="font-medium text-gray-700">v{server.version}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Database
          </p>
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${database.connected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-sm font-medium text-gray-800">
              {database.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <dl className="space-y-1 text-xs text-gray-500">
            <div className="flex justify-between">
              <dt>Total transactions</dt>
              <dd className="font-medium text-gray-700">{stats.totalTransactions}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Total print jobs</dt>
              <dd className="font-medium text-gray-700">{stats.totalPrintJobs}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Revenue collected</dt>
              <dd className="font-medium text-gray-700">₱{stats.totalRevenue.toFixed(2)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Paper Trays */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Paper Trays</p>
          {lowPaperAlerts > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              {lowPaperAlerts} low alert{lowPaperAlerts > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {paperTrays.map((t) => (
            <TrayRow key={t.tray_name} tray={t} />
          ))}
          {paperTrays.length === 0 && (
            <p className="text-center text-xs text-gray-400">No trays configured.</p>
          )}
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Successful', value: stats.successfulTransactions, color: 'text-green-700' },
          { label: 'Pending', value: stats.pendingTransactions, color: 'text-yellow-700' },
          { label: 'Failed', value: stats.failedTransactions, color: 'text-red-700' },
          { label: 'Simulated prints', value: stats.simulatedPrintJobs, color: 'text-gray-700' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm text-center"
          >
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
