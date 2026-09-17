'use client';

import { useState, useCallback } from 'react';
import { Button } from '@heroui/react';
import { addToast } from '@heroui/react';
import type { PaperTray } from '@/lib/types';
import { getPaperTrays, setTrayCount } from '@/lib/api';

interface Props {
  initialData: PaperTray[];
}

const pct = (current: number, max: number) =>
  max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

const barColor = (p: number) => {
  if (p <= 10) return 'bg-red-500/80';
  if (p <= 30) return 'bg-amber-400/80';
  return 'bg-green-500/80';
};

export function PaperTraysManager({ initialData }: Props) {
  const [trays, setTrays] = useState<PaperTray[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTray, setEditingTray] = useState<string | null>(null);
  const [formCount, setFormCount] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const [formCapacity, setFormCapacity] = useState('');

  // Event-triggered only: the page load already fetches once server-side
  // (see app/paper/page.tsx's initialData), and this button is the one
  // explicit admin-triggered refresh — no interval polling the printer/DB
  // in the background.
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
    // A tray whose capacity was never set (0) is the source of the "X / 0
    // sheets, 0%" display — default the field to the current count so simply
    // saving fixes it, rather than leaving 0 in the box.
    setFormCapacity(String(tray.max_capacity > 0 ? tray.max_capacity : tray.current_count || 500));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingTray(null);
    setFormCount('');
    setFormThreshold('');
    setFormCapacity('');
  }, []);

  const save = useCallback(async (trayName: string) => {
    const count = parseInt(formCount, 10);
    const thr = parseInt(formThreshold, 10);
    const cap = parseInt(formCapacity, 10);

    if (isNaN(count) || count < 0) {
      addToast({ title: 'Invalid input', description: 'Sheet count must be 0 or more.', color: 'warning' });
      return;
    }
    if (isNaN(thr) || thr < 0) {
      addToast({ title: 'Invalid input', description: 'Threshold must be 0 or more.', color: 'warning' });
      return;
    }
    if (isNaN(cap) || cap <= 0) {
      addToast({ title: 'Invalid input', description: 'Tray capacity must be greater than 0.', color: 'warning' });
      return;
    }
    if (count > cap) {
      addToast({
        title: 'Invalid input',
        description: 'Sheet count cannot exceed the tray capacity.',
        color: 'warning',
      });
      return;
    }

    setSaving(true);
    try {
      await setTrayCount(trayName, count, thr, cap);
      setTrays((prev) =>
        prev.map((t) =>
          t.tray_name !== trayName
            ? t
            : { ...t, current_count: count, threshold: thr, max_capacity: cap, updated_at: new Date().toISOString() },
        ),
      );
      addToast({ title: 'Saved', description: `${trayName} updated to ${count} / ${cap} sheets.`, color: 'success' });
      setEditingTray(null);
    } catch (err) {
      addToast({ title: 'Save failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [formCount, formThreshold, formCapacity]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{trays.length} tray(s) tracked</p>
        <Button size="sm" variant="flat" onPress={() => refresh()} isLoading={loading}>
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
              className={`glass p-4 ${low && !isEditing ? 'border-red-300/40 bg-red-500/10' : ''}`}
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{tray.tray_name}</p>
                  {low && !isEditing && (
                    <span className="mt-0.5 inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700">
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
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Current sheet count
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formCount}
                      onChange={(e) => setFormCount(e.target.value)}
                      className="glass-inset w-full px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50"
                      placeholder="e.g. 250"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-slate-400">Set the exact number of sheets in this tray.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Tray capacity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formCapacity}
                      onChange={(e) => setFormCapacity(e.target.value)}
                      className="glass-inset w-full px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50"
                      placeholder="e.g. 500"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      How many sheets this tray holds when full — drives the percentage bar below.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Low-paper alert threshold
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formThreshold}
                      onChange={(e) => setFormThreshold(e.target.value)}
                      className="glass-inset w-full px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50"
                      placeholder="e.g. 20"
                    />
                    <p className="mt-1 text-xs text-slate-400">Alert when sheets drop to this number.</p>
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
                  <div className="mb-2 flex justify-between text-xs text-slate-500">
                    <span>
                      {tray.current_count} / {tray.max_capacity} sheets
                    </span>
                    <span>{p}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900/10">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(p)}`}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-500">{tray.paper_size ?? 'A4'}</span>
                    {' · '}Alert at {tray.threshold} sheets{' · '}Updated{' '}
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
