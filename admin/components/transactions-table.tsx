'use client';

import { useState, useCallback } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  addToast,
} from '@heroui/react';
import { getTransactions } from '@/lib/api';
import type { Transaction } from '@/lib/types';
import { StatusChip } from './status-chip';

interface Props {
  initialData: Transaction[];
}

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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTransactions(100);
      setRows(res.transactions);
      addToast({
        title: 'Refreshed',
        description: `${res.count} transaction(s) loaded.`,
        color: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Refresh failed',
        description: err instanceof Error ? err.message : 'Could not reach the server.',
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rows.length} record(s)</p>
        <Button size="sm" variant="flat" color="primary" isLoading={loading} onPress={refresh}>
          Refresh
        </Button>
      </div>

      <Table aria-label="Transactions table" removeWrapper>
        <TableHeader>
          <TableColumn>ID</TableColumn>
          <TableColumn>Reference</TableColumn>
          <TableColumn>Amount</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Service</TableColumn>
          <TableColumn>Created</TableColumn>
          <TableColumn>Completed</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No transactions found.">
          {rows.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="max-w-[120px] truncate font-mono text-xs">{tx.id}</TableCell>
              <TableCell className="font-mono text-xs">{tx.reference_number}</TableCell>
              <TableCell className="font-semibold">{formatAmount(tx.amount)}</TableCell>
              <TableCell>
                <StatusChip status={tx.status} />
              </TableCell>
              <TableCell className="text-xs text-gray-500">{tx.service_type ?? '—'}</TableCell>
              <TableCell className="text-xs">{formatDate(tx.created_at)}</TableCell>
              <TableCell className="text-xs text-gray-500">
                {tx.completed_at ? formatDate(tx.completed_at) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
