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
  const [selected, setSelected] = useState<PaperTray | null>(null);
  const [formCount, setFormCount] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();

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
      setFormCount(String(tray.current_count));
      setFormThreshold(String(tray.threshold));
      onOpen();
    },
    [onOpen],
  );

  const save = useCallback(async () => {
    if (!selected) return;
    const count = parseInt(formCount, 10);
    const thr = parseInt(formThreshold, 10);
    if (isNaN(count) || count < 0) {
      addToast({
        title: 'Invalid input',
        description: 'Current count must be a non-negative number.',
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
      await setTrayCount(selected.tray_name, count, thr);
      setTrays((prev) =>
        prev.map((t) =>
          t.tray_name !== selected.tray_name
            ? t
            : { ...t, current_count: count, threshold: thr, updated_at: new Date().toISOString() },
        ),
      );
      addToast({
        title: 'Updated',
        description: `${selected.tray_name} set to ${count} sheets.`,
        color: 'success',
      });
      onClose();
    } catch (err) {
      addToast({ title: 'Save failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [selected, formCount, formThreshold, onClose]);

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
                  Edit
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

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>Update Paper Count — {selected?.tray_name}</ModalHeader>
          <ModalBody className="space-y-4">
            <p className="text-xs text-gray-500">
              Current: <span className="font-semibold">{selected?.current_count}</span> /{' '}
              {selected?.max_capacity} sheets
            </p>
            <Input
              label="Current sheet count"
              type="number"
              min={0}
              value={formCount}
              onValueChange={setFormCount}
              placeholder="e.g. 250"
              description="Set the exact number of sheets currently in this tray."
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
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
