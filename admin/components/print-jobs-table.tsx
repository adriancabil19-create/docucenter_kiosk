'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  addToast,
} from '@heroui/react';
import { getPrintJobs, type DateRange } from '@/lib/api';
import type { PrintJob } from '@/lib/types';
import { StatusChip } from './status-chip';
import { glassTableClassNames } from './table-styles';
import { HistoryToolbar } from './history-toolbar';

interface Props {
  initialData: PrintJob[];
}

const STATUS_OPTIONS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'printing', label: 'Printing' },
  { key: 'done', label: 'Done' },
  { key: 'failed', label: 'Failed' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PrintJobsTable({ initialData }: Props) {
  const [rows, setRows] = useState<PrintJob[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await getPrintJobs(500, range);
        setRows(res.jobs);
        if (!silent)
          addToast({
            title: 'Refreshed',
            description: `${res.count} print job(s) loaded.`,
            color: 'success',
          });
      } catch (err) {
        if (!silent)
          addToast({
            title: 'Refresh failed',
            description: err instanceof Error ? err.message : 'Could not reach the server.',
            color: 'danger',
          });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [range],
  );

  useEffect(() => {
    refresh(true);
    const id = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((job) => {
      if (status !== 'all' && job.status !== status) return false;
      if (!q) return true;
      const mode = job.simulated ? 'simulated' : 'real';
      return (
        job.id.toLowerCase().includes(q) ||
        job.filenames.join(' ').toLowerCase().includes(q) ||
        job.paper_size.toLowerCase().includes(q) ||
        (job.method ?? '').toLowerCase().includes(q) ||
        mode.includes(q)
      );
    });
  }, [rows, search, status]);

  return (
    <div>
      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Job ID, file, paper, method…"
        range={range}
        onRangeChange={setRange}
        statusOptions={STATUS_OPTIONS}
        status={status}
        onStatusChange={setStatus}
        count={filtered.length}
        total={rows.length}
        loading={loading}
        onRefresh={() => refresh()}
      />

      <Table aria-label="Print jobs table" removeWrapper classNames={glassTableClassNames}>
        <TableHeader>
          <TableColumn>Job ID</TableColumn>
          <TableColumn>Files</TableColumn>
          <TableColumn>Paper</TableColumn>
          <TableColumn>Copies</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Method</TableColumn>
          <TableColumn>Mode</TableColumn>
          <TableColumn>Created</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No print jobs match these filters.">
          {filtered.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="max-w-[120px] truncate font-mono text-xs">{job.id}</TableCell>
              <TableCell className="max-w-[160px]">
                <div className="space-y-0.5">
                  {job.filenames.map((f) => (
                    <p key={f} className="truncate text-xs text-slate-600">
                      {f}
                    </p>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-xs">{job.paper_size}</TableCell>
              <TableCell className="text-center text-xs">{job.copies}</TableCell>
              <TableCell>
                <StatusChip status={job.status} />
              </TableCell>
              <TableCell className="text-xs text-slate-500">{job.method ?? '—'}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={job.simulated ? 'warning' : 'success'}>
                  {job.simulated ? 'Simulated' : 'Real'}
                </Chip>
              </TableCell>
              <TableCell className="text-xs">{formatDate(job.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
