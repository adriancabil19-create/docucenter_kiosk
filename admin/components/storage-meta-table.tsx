'use client';

import { useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
} from '@heroui/react';
import { getStorageDocuments } from '@/lib/api';
import type { StorageDocMeta } from '@/lib/types';
import { usePoll } from '@/lib/use-poll';
import { glassTableClassNames } from './table-styles';

const fmtBytes = (n: number) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-PH');
};

export function StorageMetaTable({ initial }: { initial: StorageDocMeta[] | null }) {
  const fetcher = useMemo(() => () => getStorageDocuments(500).then((r) => r.documents), []);
  const { data, error, loading, refresh, updatedAt } = usePoll<StorageDocMeta[]>(
    fetcher,
    30000,
    initial,
  );
  const rows = data ?? initial ?? [];

  const totalBytes = rows.reduce((s, r) => s + (r.size_bytes || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {rows.length} document{rows.length === 1 ? '' : 's'} · {fmtBytes(totalBytes)} on the kiosk
          {updatedAt ? ` · updated ${updatedAt}` : ''}
        </p>
        <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="glass border-red-300/40 bg-red-500/10 p-3 text-xs text-red-700">{error}</div>
      )}

      <Table aria-label="Kiosk documents (metadata)" removeWrapper classNames={glassTableClassNames}>
        <TableHeader>
          <TableColumn>NAME</TableColumn>
          <TableColumn>FORMAT</TableColumn>
          <TableColumn>PAGES</TableColumn>
          <TableColumn>SIZE</TableColumn>
          <TableColumn>KIOSK</TableColumn>
          <TableColumn>UPLOADED</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No documents. Files uploaded on a kiosk appear here (metadata only).">
          {rows.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="max-w-[22rem] truncate" title={d.original_name ?? d.name}>
                {d.original_name ?? d.name}
              </TableCell>
              <TableCell>{d.format ?? '—'}</TableCell>
              <TableCell>{d.pages}</TableCell>
              <TableCell>{d.size_label ?? fmtBytes(d.size_bytes)}</TableCell>
              <TableCell className="text-xs text-slate-500">{d.kiosk_id}</TableCell>
              <TableCell className="text-xs text-slate-500">{fmtDate(d.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-slate-400">
        Metadata only — document contents stay on the kiosk and are never uploaded to the cloud.
      </p>
    </div>
  );
}
