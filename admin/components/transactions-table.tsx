'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  addToast,
} from '@heroui/react';
import { getTransactions, reauthorizeRecovery, type DateRange } from '@/lib/api';
import { useVisibleInterval } from '@/lib/use-visible-interval';
import type { Transaction, PrintRecoveryAction, PrintRecoveryResult } from '@/lib/types';
import { StatusChip } from './status-chip';
import { StatCard } from './stat-card';
import { glassTableClassNames } from './table-styles';
import { HistoryToolbar } from './history-toolbar';

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

const REASON_LABEL: Record<string, string> = {
  paper_jam: '🔧 Paper Jam',
  printer_error: '🖨️ Printer Error',
  incorrect_output: '📄 Incorrect Output',
  power_interruption: '⚡ Power Interruption',
  printer_offline: '🔌 Printer Offline',
  other: '⚠️ Other',
};

const RESULT_COLOR: Record<PrintRecoveryResult, 'success' | 'danger' | 'warning'> = {
  success: 'success',
  failed: 'danger',
  pending: 'warning',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatAmount(amount: number) {
  return `₱${amount.toFixed(2)}`;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
            {filtered.flatMap((tx) => {
              const isOpen = expanded.has(tx.id);
              const hasDetail = tx.document_names.length > 0 || tx.recoveries.length > 0;
              const docsLabel =
                tx.document_names.length === 0
                  ? '—'
                  : tx.document_names.length === 1
                    ? tx.document_names[0]
                    : `${tx.document_names[0]} +${tx.document_names.length - 1} more`;

              const mainRow = (
                <TableRow
                  key={tx.id}
                  className={hasDetail ? 'cursor-pointer' : ''}
                  onClick={() => hasDetail && toggleExpanded(tx.id)}
                >
                  <TableCell className="max-w-[100px] truncate font-mono text-xs">{tx.id}</TableCell>
                  <TableCell className="font-mono text-xs">{tx.reference_number}</TableCell>
                  <TableCell className="font-semibold">{formatAmount(tx.amount)}</TableCell>
                  <TableCell>
                    <StatusChip status={tx.status} />
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
                    {hasDetail && (
                      <span className="text-xs text-accent-strong">{isOpen ? 'Hide ▲' : 'Details ▼'}</span>
                    )}
                  </TableCell>
                </TableRow>
              );

              if (!isOpen || !hasDetail) return [mainRow];

              const detailRow = (
                <TableRow key={`${tx.id}-detail`}>
                  <TableCell colSpan={9}>
                    <div className="space-y-4 rounded-lg bg-slate-900/[0.03] p-4">
                      {tx.document_names.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Documents
                          </p>
                          <ul className="list-inside list-disc text-sm text-slate-700">
                            {tx.document_names.map((name, i) => (
                              <li key={i}>{name}</li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs text-slate-500">
                            {[
                              tx.paper_size && `Paper: ${tx.paper_size}`,
                              tx.copies != null && `Copies: ${tx.copies}`,
                              tx.page_count != null && `Pages: ${tx.page_count}`,
                              tx.color_mode && `Color: ${tx.color_mode}`,
                              tx.print_status && `Print status: ${tx.print_status}`,
                              tx.completed_at && `Completed: ${formatDate(tx.completed_at)}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      )}

                      {tx.recoveries.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Recovery history
                          </p>
                          <div className="space-y-2">
                            {tx.recoveries.map((a) => (
                              <div
                                key={a.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/60 px-3 py-2 text-sm"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip size="sm" variant="flat" color={RESULT_COLOR[a.result]} className="capitalize">
                                    {a.result}
                                  </Chip>
                                  <span className="font-medium text-slate-700">{a.staff_name}</span>
                                  <span title={a.reason_note ?? undefined} className="text-slate-500">
                                    {REASON_LABEL[a.reason] ?? a.reason}
                                  </span>
                                  <span className="text-slate-400">
                                    {a.pages} × {a.copies}
                                  </span>
                                  <span className="text-xs text-slate-400">{formatDate(a.created_at)}</span>
                                </div>
                                {a.result === 'success' && !a.reauthorized_at && (
                                  <Button size="sm" variant="flat" onPress={() => reauthorize(a)}>
                                    Reauthorize
                                  </Button>
                                )}
                                {a.reauthorized_at && (
                                  <span className="text-xs text-slate-400">
                                    Reauthorized {formatDate(a.reauthorized_at)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );

              return [mainRow, detailRow];
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
