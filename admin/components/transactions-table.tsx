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
import { getTransactions, reauthorizeRecovery, type DateRange } from '@/lib/api';
import { useVisibleInterval } from '@/lib/use-visible-interval';
import type { Transaction, PrintRecoveryAction, PrintRecoveryResult, PaymentStatusLabel } from '@/lib/types';
import { StatusChip } from './status-chip';
import { StatCard } from './stat-card';
import { glassTableClassNames } from './table-styles';
import { HistoryToolbar } from './history-toolbar';
import { TransactionDetailModal } from './transaction-detail-modal';

interface Props {
  initialData: Transaction[];
  currentAdmin: string;
}

const STATUS_OPTIONS = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'SUCCESS', label: 'Success' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export const REASON_LABEL: Record<string, string> = {
  paper_jam: '🔧 Paper Jam',
  printer_error: '🖨️ Printer Hardware Error',
  printer_failed_to_print: '🚫 Printer Failed to Print',
  printer_no_error_reported: '❔ Printer Did Not Report Error',
  incorrect_output: '📄 Incorrect/Partial Print',
  power_interruption: '⚡ Power Interruption',
  printer_offline: '🔌 Printer Offline',
  other: '⚠️ Other',
};

export const RESULT_COLOR: Record<PrintRecoveryResult, 'success' | 'danger' | 'warning'> = {
  success: 'success',
  failed: 'danger',
  pending: 'warning',
};

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatAmount(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

const PAYMENT_CHIP: Partial<Record<PaymentStatusLabel, { label: string; color: 'success' | 'warning' | 'danger' }>> = {
  REFUND_PENDING: { label: '↩️ Refund pending', color: 'warning' },
  PARTIALLY_REFUNDED: { label: '↩️ Partly refunded', color: 'warning' },
  REFUNDED: { label: '↩️ Refunded', color: 'success' },
};

/** Only rendered once money has gone back — a plain paid/unpaid row needs no extra chip. */
export function PaymentStatusChip({ transaction }: { transaction: Transaction }) {
  const chip = PAYMENT_CHIP[transaction.payment_status];
  if (!chip) return null;
  return (
    <Chip size="sm" variant="flat" color={chip.color}>
      {chip.label}
    </Chip>
  );
}

function withinDays(iso: string, days: number): boolean {
  return Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000;
}

export function TransactionsTable({ initialData, currentAdmin }: Props) {
  const [rows, setRows] = useState<Transaction[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Looked up from `rows` rather than held as its own copy, so reauthorizing
  // (which calls refresh()) is reflected in the open modal automatically.
  const selected = rows.find((t) => t.id === selectedId) ?? null;

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

  // Refetch when the date range changes, and poll every 30s with current
  // filters — paused while this tab is hidden (see useVisibleInterval).
  useEffect(() => {
    refresh(true);
  }, [refresh]);
  useVisibleInterval(() => refresh(true), 30_000);

  const recoveryCounts = useMemo(() => {
    const all = rows.flatMap((tx) => tx.recoveries);
    return {
      today: all.filter((a) => withinDays(a.created_at, 1)).length,
      thisWeek: all.filter((a) => withinDays(a.created_at, 7)).length,
      thisMonth: all.filter((a) => withinDays(a.created_at, 30)).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((tx) => {
      if (status !== 'all' && tx.status !== status) return false;
      if (!q) return true;
      return (
        tx.reference_number.toLowerCase().includes(q) ||
        tx.id.toLowerCase().includes(q) ||
        (tx.service_type ?? '').toLowerCase().includes(q) ||
        tx.document_names.some((n) => n.toLowerCase().includes(q)) ||
        String(tx.amount).includes(q)
      );
    });
  }, [rows, search, status]);

  const reauthorize = async (action: PrintRecoveryAction) => {
    try {
      const res = await reauthorizeRecovery(action.transaction_id, currentAdmin);
      if (!res.success) throw new Error(res.error ?? 'Failed to reauthorize');
      addToast({
        title: 'Reauthorized',
        description: `Staff may recover transaction ${action.transaction_id} again.`,
        color: 'success',
      });
      refresh();
    } catch (err) {
      addToast({ title: 'Reauthorize failed', description: (err as Error).message, color: 'danger' });
    }
  };

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recoveries Today" value={recoveryCounts.today} icon="♻️" color="primary" />
        <StatCard label="This Week" value={recoveryCounts.thisWeek} icon="📅" color="default" />
        <StatCard label="This Month" value={recoveryCounts.thisMonth} icon="🗓️" color="default" />
      </div>

      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Reference, ID, service, document…"
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
        <Table aria-label="Transactions table" removeWrapper classNames={glassTableClassNames}>
          <TableHeader>
            <TableColumn>ID</TableColumn>
            <TableColumn>Reference</TableColumn>
            <TableColumn>Amount</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Service</TableColumn>
            <TableColumn>Documents</TableColumn>
            <TableColumn>Recovery</TableColumn>
            <TableColumn>Created</TableColumn>
            <TableColumn> </TableColumn>
          </TableHeader>
          <TableBody emptyContent="No transactions match these filters.">
            {filtered.map((tx) => {
              const docsLabel =
                tx.document_names.length === 0
                  ? '—'
                  : tx.document_names.length === 1
                    ? tx.document_names[0]
                    : `${tx.document_names[0]} +${tx.document_names.length - 1} more`;

              return (
                <TableRow key={tx.id} className="cursor-pointer" onClick={() => setSelectedId(tx.id)}>
                  <TableCell className="max-w-[100px] truncate font-mono text-xs">{tx.id}</TableCell>
                  <TableCell className="font-mono text-xs">{tx.reference_number}</TableCell>
                  <TableCell className="font-semibold">{formatAmount(tx.amount)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusChip status={tx.status} />
                      <PaymentStatusChip transaction={tx} />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{tx.service_type ?? '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-slate-600" title={tx.document_names.join(', ')}>
                    {docsLabel}
                  </TableCell>
                  <TableCell>
                    {tx.recoveries.length > 0 ? (
                      <Chip size="sm" variant="flat" color="warning">
                        ♻️ {tx.recoveries.length}
                      </Chip>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(tx.created_at)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-accent-strong">Details →</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TransactionDetailModal
        transaction={selected}
        onClose={() => setSelectedId(null)}
        onReauthorize={reauthorize}
        onRefundChanged={() => refresh(true)}
      />
    </div>
  );
}
