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
import { useVisibleInterval } from '@/lib/use-visible-interval';
import type { PrintJob } from '@/lib/types';
import { StatusChip } from './status-chip';
import { glassTableClassNames } from './table-styles';
import { HistoryToolbar } from './history-toolbar';
import { PrintJobDetailModal, BILLING_LABEL } from './print-job-detail-modal';
import { formatAmount } from './transactions-table';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Looked up from `rows` rather than held as its own copy, so a background
  // refresh is reflected in the open modal automatically.
  const selected = rows.find((j) => j.id === selectedId) ?? null;

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
  }, [refresh]);
  useVisibleInterval(() => refresh(true), 30_000);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((job) => {
      if (status !== 'all' && job.status !== status) return false;
      if (!q) return true;
      const mode = job.simulated ? 'simulated' : 'real';
      const color = job.color_mode === 'color' ? 'color' : 'black & white bw';
      return (
        job.id.toLowerCase().includes(q) ||
        (job.transaction_id ?? '').toLowerCase().includes(q) ||
        job.filenames.join(' ').toLowerCase().includes(q) ||
        job.paper_size.toLowerCase().includes(q) ||
        (job.method ?? '').toLowerCase().includes(q) ||
        (job.service_type ?? '').toLowerCase().includes(q) ||
        BILLING_LABEL[job.billing_type ?? 'paid'].toLowerCase().includes(q) ||
        color.includes(q) ||
        mode.includes(q)
      );
    });
  }, [rows, search, status]);

  return (
    <div>
      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Job ID, txn, file, paper, method, billing…"
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

      <div className="overflow-x-auto">
        <Table aria-label="Print jobs table" removeWrapper classNames={glassTableClassNames}>
          <TableHeader>
            <TableColumn>Job ID</TableColumn>
            <TableColumn>Files</TableColumn>
            <TableColumn>Paper</TableColumn>
            <TableColumn>Color</TableColumn>
            <TableColumn>Pages</TableColumn>
            <TableColumn>Copies</TableColumn>
            <TableColumn>Cost</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Billing</TableColumn>
            <TableColumn>Method</TableColumn>
            <TableColumn>Mode</TableColumn>
            <TableColumn>Created</TableColumn>
          </TableHeader>
          <TableBody emptyContent="No print jobs match these filters.">
            {filtered.map((job) => {
              const totalPages =
                job.page_count != null ? job.page_count * job.copies : null;
              const estTotal =
                job.unit_price != null && totalPages != null ? job.unit_price * totalPages : null;
              const billing = job.billing_type ?? 'paid';

              return (
                <TableRow
                  key={job.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(job.id)}
                >
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
                  <TableCell className="text-xs">
                    {job.paper_size}
                    {job.duplex && <span className="ml-1 text-slate-400">· 2-sided</span>}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {job.color_mode === 'color' ? 'Color' : 'B&W'}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {totalPages ?? '—'}
                    {job.page_count != null && job.copies > 1 && (
                      <span className="text-slate-400"> ({job.page_count}×{job.copies})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs">{job.copies}</TableCell>
                  <TableCell className="text-xs font-semibold">
                    {estTotal != null ? formatAmount(estTotal) : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={job.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{BILLING_LABEL[billing]}</TableCell>
                  <TableCell className="text-xs text-slate-500">{job.method ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color={job.simulated ? 'warning' : 'success'}>
                      {job.simulated ? 'Simulated' : 'Real'}
                    </Chip>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(job.created_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <PrintJobDetailModal job={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
