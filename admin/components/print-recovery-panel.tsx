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
  Chip,
  addToast,
} from '@heroui/react';
import type { PrintRecoveryAction, PrintRecoveryResult } from '@/lib/types';
import { getRecoveryActions, reauthorizeRecovery } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { StatCard } from '@/components/stat-card';
import { glassTableClassNames } from '@/components/table-styles';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' });

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

export function PrintRecoveryPanel({ currentAdmin }: { currentAdmin: string }) {
  const fetcher = useMemo(() => () => getRecoveryActions(200), []);
  const { data, loading, refresh, updatedAt } = usePoll(fetcher, 20000, null);
  const actions = data?.actions ?? [];
  const counts = data?.counts ?? { today: 0, thisWeek: 0, thisMonth: 0 };

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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recoveries Today" value={counts.today} icon="♻️" color="primary" />
        <StatCard label="This Week" value={counts.thisWeek} icon="📅" color="default" />
        <StatCard label="This Month" value={counts.thisMonth} icon="🗓️" color="default" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {updatedAt ? `Updated ${updatedAt}` : ''}
        </p>
        <Button size="sm" variant="flat" isLoading={loading} onPress={refresh}>
          Refresh
        </Button>
      </div>

      <Table aria-label="Print recovery actions" isStriped classNames={glassTableClassNames}>
        <TableHeader>
          <TableColumn>Transaction</TableColumn>
          <TableColumn>Staff</TableColumn>
          <TableColumn>Reason</TableColumn>
          <TableColumn>Pages × Copies</TableColumn>
          <TableColumn>Result</TableColumn>
          <TableColumn>When</TableColumn>
          <TableColumn>Actions</TableColumn>
        </TableHeader>
        <TableBody emptyContent={loading ? 'Loading…' : 'No recovery prints recorded yet.'}>
          {actions.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-xs">{a.transaction_id}</TableCell>
              <TableCell>{a.staff_name}</TableCell>
              <TableCell>
                <span title={a.reason_note ?? undefined}>{REASON_LABEL[a.reason] ?? a.reason}</span>
              </TableCell>
              <TableCell>
                {a.pages} × {a.copies}
              </TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={RESULT_COLOR[a.result]} className="capitalize">
                  {a.result}
                </Chip>
              </TableCell>
              <TableCell className="text-xs text-slate-400">{when(a.created_at)}</TableCell>
              <TableCell>
                {a.result === 'success' && !a.reauthorized_at && (
                  <Button size="sm" variant="flat" onPress={() => reauthorize(a)}>
                    Reauthorize
                  </Button>
                )}
                {a.reauthorized_at && (
                  <span className="text-xs text-slate-400">Reauthorized {when(a.reauthorized_at)}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
