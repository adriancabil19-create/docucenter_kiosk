'use client';

import { useState } from 'react';
import { Button, Switch, Input, addToast } from '@heroui/react';
import type { StorageSettings } from '@/lib/types';
import {
  updateStorageSettings,
  purgeStorage,
  deleteAllStorage,
  deleteAllStorageKeepMeta,
} from '@/lib/api';

type BusyOp = 'purge' | 'deleteAll' | 'deleteFilesOnly' | null;

export function StorageSettingsForm({ initial }: { initial: StorageSettings | null }) {
  const [deleteAfterPrint, setDeleteAfterPrint] = useState(initial?.delete_after_print ?? false);
  const [retentionHours, setRetentionHours] = useState(String(initial?.retention_hours ?? 24));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<BusyOp>(null);
  const [armed, setArmed] = useState<'deleteAll' | 'deleteFilesOnly' | null>(null);

  const save = async () => {
    const hours = parseInt(retentionHours, 10);
    if (!Number.isFinite(hours) || hours < 1) {
      addToast({ title: 'Invalid retention', description: 'Hours must be 1 or more.', color: 'danger' });
      return;
    }
    setSaving(true);
    try {
      const res = await updateStorageSettings({
        delete_after_print: deleteAfterPrint,
        retention_hours: hours,
      });
      setDeleteAfterPrint(res.settings.delete_after_print);
      setRetentionHours(String(res.settings.retention_hours));
      addToast({ title: 'Retention policy saved', color: 'success' });
    } catch (err) {
      addToast({ title: 'Save failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const summarise = (res: { deleted?: number; tombstoned?: number; queued?: number }) => {
    const parts: string[] = [];
    if (res.deleted) parts.push(`${res.deleted} file${res.deleted === 1 ? '' : 's'} removed here`);
    if (res.tombstoned) parts.push(`${res.tombstoned} record${res.tombstoned === 1 ? '' : 's'} cleared`);
    if (res.queued) parts.push(`sent to ${res.queued} kiosk${res.queued === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'Nothing to do.';
  };

  const runPurge = async () => {
    setBusy('purge');
    try {
      const res = await purgeStorage();
      addToast({ title: 'Purge dispatched', description: summarise(res), color: 'success' });
    } catch (err) {
      addToast({ title: 'Purge failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  // Two-step arm/confirm shared by both destructive buttons.
  const runDelete = async (
    which: 'deleteAll' | 'deleteFilesOnly',
    call: () => Promise<{ deleted?: number; tombstoned?: number; queued?: number }>,
  ) => {
    if (armed !== which) {
      setArmed(which);
      setTimeout(() => setArmed((a) => (a === which ? null : a)), 4000);
      return;
    }
    setArmed(null);
    setBusy(which === 'deleteAll' ? 'deleteAll' : 'deleteFilesOnly');
    try {
      const res = await call();
      addToast({ title: 'Delete dispatched', description: summarise(res), color: 'success' });
    } catch (err) {
      addToast({ title: 'Delete failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass space-y-5 p-5">
      <div>
        <p className="text-sm font-semibold text-slate-800">Retention policy</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Enforced server-side on the kiosk. Applies to every uploaded document.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Delete files immediately after printing</p>
          <p className="text-xs text-slate-500">
            When off, files are kept so users can reprint, then removed on expiry.
          </p>
        </div>
        <Switch isSelected={deleteAfterPrint} onValueChange={setDeleteAfterPrint} aria-label="Delete after print" />
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          label="Auto-delete after (hours)"
          value={retentionHours}
          onValueChange={setRetentionHours}
          min={1}
          className="max-w-[16rem]"
          size="sm"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button color="primary" size="sm" onPress={save} isLoading={saving}>
          Save policy
        </Button>
        <Button size="sm" variant="flat" onPress={runPurge} isLoading={busy === 'purge'}>
          Purge expired now
        </Button>
        <Button
          size="sm"
          variant="flat"
          color="warning"
          onPress={() => runDelete('deleteFilesOnly', deleteAllStorageKeepMeta)}
          isLoading={busy === 'deleteFilesOnly'}
        >
          {armed === 'deleteFilesOnly' ? 'Confirm — wipe kiosk files?' : 'Delete files, keep records'}
        </Button>
        <Button
          size="sm"
          variant="flat"
          color="danger"
          onPress={() => runDelete('deleteAll', deleteAllStorage)}
          isLoading={busy === 'deleteAll'}
        >
          {armed === 'deleteAll' ? 'Confirm — delete everything?' : 'Delete files + records'}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        <span className="font-medium">Delete files, keep records</span> frees disk on every kiosk but
        leaves the document list here intact.{' '}
        <span className="font-medium">Delete files + records</span> also removes the documents from
        this list. Both run on the kiosk that owns the files, on its next poll (~5&nbsp;s).
      </p>
    </div>
  );
}
