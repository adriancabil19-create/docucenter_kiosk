'use client';

import { useState, useCallback } from 'react';
import { Button, Input } from '@heroui/react';
import { addToast } from '@heroui/react';
import type { PaperTray } from '@/lib/types';
import { getPaperTrays, setTrayCount } from '@/lib/api';

interface Props {
  initialData: PaperTray[];
}

const pct = (current: number, max: number) =>
  max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

const barColor = (p: number) => {
  if (p <= 10) return 'bg-red-500';
  if (p <= 30) return 'bg-yellow-400';
  return 'bg-green-500';
};

export function PaperTraysManager({ initialData }: Props) {
  const [trays, setTrays] = useState<PaperTray[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTray, setEditingTray] = useState<string | null>(null);
  const [formCount, setFormCount] = useState('');
  const [formThreshold, setFormThreshold] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPaperTrays();
      setTrays(res.data);
      addToast({ title: 'Refreshed', description: 'Paper tray data updated.', color: 'success' });
    } catch (err) {
      addToast({ title: 'Refresh failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, []);

  const startEdit = useCallback((tray: PaperTray) => {
    setEditingTray(tray.tray_name);
    setFormCount(String(tray.current_count));
    setFormThreshold(String(tray.threshold));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingTray(null);
    setFormCount('');
    setFormThreshold('');
  }, []);

  const save = useCallback(async (trayName: string) => {
    const count = parseInt(formCount, 10);
    const thr = parseInt(formThreshold, 10);

    if (isNaN(count) || count < 0) {
      addToast({ title: 'Invalid input', description: 'Sheet count must be 0 or more.', color: 'warning' });
      return;
    }
    if (isNaN(thr) || thr < 0) {
      addToast({ title: 'Invalid input', description: 'Threshold must be 0 or more.', color: 'warning' });
      return;
    }

    setSaving(true);
    try {
      await setTrayCount(trayName, count, thr);
      setTrays((prev) =>
        prev.map((t) =>
          t.tray_name !== trayName
            ? t
            : { ...t, current_count: count, threshold: thr, updated_at: new Date().toISOString() },
        ),
      );
      addToast({ title: 'Saved', description: `${trayName} updated to ${count} sheets.`, color: 'success' });
      setEditingTray(null);
    } catch (err) {
      addToast({ title: 'Save failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [formCount, formThreshold]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{trays.length} tray(s) tracked</p>
        <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trays.map((tray) => {
          const p = pct(tray.current_count, tray.max_capacity);
          const low = tray.current_count <= tray.threshold;
          const isEditing = editingTray === tray.tray_name;

          return (
            <div
              key={tray.tray_name}
              className={`rounded-xl border p-4 shadow-sm ${low && !isEditing ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{tray.tray_name}</p>
                  {low && !isEditing && (
                    <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Low Paper
                    </span>
                  )}
                </div>
                {!isEditing && (
                  <Button size="sm" variant="flat" onPress={() => startEdit(tray)}>
                    Edit
                  </Button>
                )}
              </div>

              {isEditing ? (
                /* ── Inline edit form ── */
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Current sheet count
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formCount}
                      onChange={(e) => setFormCount(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. 250"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-gray-400">Set the exact number of sheets in this tray.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Low-paper alert threshold
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formThreshold}
                      onChange={(e) => setFormThreshold(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. 20"
                    />
                    <p className="mt-1 text-xs text-gray-400">Alert when sheets drop to this number.</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      color="primary"
                      className="flex-1"
                      isLoading={saving}
                      onPress={() => save(tray.tray_name)}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="flat" className="flex-1" onPress={cancelEdit} isDisabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Display view ── */
                <>
                  <div className="mb-2 flex justify-between text-xs text-gray-500">
                    <span>
                      {tray.current_count} / {tray.max_capacity} sheets
                    </span>
                    <span>{p}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(p)}`}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Alert threshold: {tray.threshold} sheets &middot; Updated{' '}
                    {new Date(tray.updated_at).toLocaleString('en-PH', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
