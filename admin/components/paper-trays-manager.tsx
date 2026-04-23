'use client';

import { useState, useCallback } from 'react';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from '@heroui/react';
import { addToast } from '@heroui/react';
import type { PaperTray } from '@/lib/types';
import { getPaperTrays, refillPaperTray, updatePaperTray } from '@/lib/api';

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
  const [selected, setSelected] = useState<PaperTray | null>(null);
  const [formSheets, setFormSheets] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();

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

  const openEdit = useCallback(
    (tray: PaperTray) => {
      setSelected(tray);
      setFormSheets('');
      setFormThreshold(String(tray.threshold));
      onOpen();
    },
    [onOpen],
  );

  const save = useCallback(async () => {
    if (!selected) return;
    const sheets = parseInt(formSheets, 10);
    const thr = parseInt(formThreshold, 10);
    if (isNaN(sheets) || sheets <= 0) {
      addToast({
        title: 'Invalid input',
        description: 'Sheets to add must be a positive number.',
        color: 'warning',
      });
      return;
    }
    if (isNaN(thr) || thr < 0) {
      addToast({
        title: 'Invalid input',
        description: 'Alert threshold must be a non-negative number.',
        color: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      await refillPaperTray(selected.tray_name, sheets, thr);
      setTrays((prev) =>
        prev.map((t) => {
          if (t.tray_name !== selected.tray_name) return t;
          const newMax = t.max_capacity === 0 ? t.current_count + sheets : t.max_capacity;
          return {
            ...t,
            max_capacity: newMax,
            current_count: Math.min(newMax, t.current_count + sheets),
            threshold: thr,
            updated_at: new Date().toISOString(),
          };
        }),
      );
      addToast({
        title: 'Refilled',
        description: `${selected.tray_name} +${sheets} sheets.`,
        color: 'success',
      });
      onClose();
    } catch (err) {
      addToast({ title: 'Save failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [selected, formSheets, formThreshold, onClose]);

  return (
    <>
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
          return (
            <div
              key={tray.tray_name}
              className={`rounded-xl border p-4 shadow-sm ${low ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{tray.tray_name}</p>
                  {low && (
                    <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Low Paper
                    </span>
                  )}
                </div>
                <Button size="sm" variant="flat" onPress={() => openEdit(tray)}>
                  Refill
                </Button>
              </div>

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
            </div>
          );
        })}
      </div>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>Refill — {selected?.tray_name}</ModalHeader>
          <ModalBody className="space-y-4">
            <p className="text-xs text-gray-500">
              Current: <span className="font-semibold">{selected?.current_count}</span> /{' '}
              {selected?.max_capacity} sheets
            </p>
            <Input
              label="Sheets to add"
              type="number"
              min={1}
              value={formSheets}
              onValueChange={setFormSheets}
              placeholder="e.g. 100"
              description="Number of sheets you are physically loading into this tray."
            />
            <Input
              label="Low-paper alert threshold"
              type="number"
              min={0}
              value={formThreshold}
              onValueChange={setFormThreshold}
              description="Alert when sheets remaining drops to this number."
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              Cancel
            </Button>
            <Button color="primary" onPress={save} isLoading={saving}>
              Confirm Refill
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
