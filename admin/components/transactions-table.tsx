'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  addToast,
} from '@heroui/react';
import { getTransactions, type DateRange } from '@/lib/api';
import type { Transaction } from '@/lib/types';
import { StatusChip } from './status-chip';
import { glassTableClassNames } from './table-styles';
import { HistoryToolbar } from './history-toolbar';

interface Props {
  initialData: Transaction[];
}

const STATUS_OPTIONS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'SUCCESS', label: 'Success' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatAmount(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

export function TransactionsTable({ initialData }: Props) {
  const [rows, setRows] = useState<Transaction[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await getTransactions(500, range);
        setRows(res.transactions);
        if (!silent)
          addToast({
            title: 'Refreshed',
            description: `${res.count} transaction(s) loaded.`,
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

  // Refetch when the date range changes, and poll every 30s with current filters.
  useEffect(() => {
    refresh(true);
    const id = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((tx) => {
      if (status !== 'all' && tx.status !== status) return false;
      if (!q) return true;
      return (
        tx.reference_number.toLowerCase().includes(q) ||
        tx.id.toLowerCase().includes(q) ||
        (tx.service_type ?? '').toLowerCase().includes(q) ||
        String(tx.amount).includes(q)
      );
    });
  }, [rows, search, status]);

  return (
    <div>
      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Reference, ID, service…"
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

      <Table aria-label="Transactions table" removeWrapper classNames={glassTableClassNames}>
        <TableHeader>
          <TableColumn>ID</TableColumn>
          <TableColumn>Reference</TableColumn>
          <TableColumn>Amount</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Service</TableColumn>
          <TableColumn>Created</TableColumn>
          <TableColumn>Completed</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No transactions match these filters.">
          {filtered.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="max-w-[120px] truncate font-mono text-xs">{tx.id}</TableCell>
              <TableCell className="font-mono text-xs">{tx.reference_number}</TableCell>
              <TableCell className="font-semibold">{formatAmount(tx.amount)}</TableCell>
              <TableCell>
                <StatusChip status={tx.status} />
              </TableCell>
              <TableCell className="text-xs text-slate-500">{tx.service_type ?? '—'}</TableCell>
              <TableCell className="text-xs">{formatDate(tx.created_at)}</TableCell>
              <TableCell className="text-xs text-slate-500">
                {tx.completed_at ? formatDate(tx.completed_at) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
