'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Chip,
} from '@heroui/react';
import { addToast } from '@heroui/react';
import type { Transaction } from '@/lib/types';
import { getTransactions, cancelTransaction } from '@/lib/api';
import { StatusChip } from '@/components/status-chip';

interface Props {
  initialData: Transaction[];
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function PaymentsTable({ initialData }: Props) {
  const [data, setData] = useState<Transaction[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getTransactions(200);
      setData(res.transactions);
      if (!silent) addToast({ title: 'Refreshed', description: `${res.count} transaction(s) loaded.`, color: 'success' });
    } catch (err) {
      if (!silent) addToast({ title: 'Refresh failed', description: (err as Error).message, color: 'danger' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const openCancel = useCallback(
    (tx: Transaction) => {
      setSelected(tx);
      onOpen();
    },
    [onOpen],
  );

  const confirmCancel = useCallback(async () => {
    if (!selected) return;
    setCancelling(true);
    try {
      await cancelTransaction(selected.id);
      setData((prev) =>
        prev.map((t) =>
          t.id === selected.id
            ? { ...t, status: 'CANCELLED', completed_at: new Date().toISOString() }
            : t,
        ),
      );
      addToast({
        title: 'Cancelled',
        description: `Transaction ${selected.reference_number} cancelled.`,
        color: 'success',
      });
      onClose();
    } catch (err) {
      addToast({ title: 'Cancel failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setCancelling(false);
    }
  }, [selected, onClose]);

  const canCancel = (status: string) => status === 'PENDING' || status === 'PROCESSING';

  const totals = {
    paid: data.filter((t) => t.status === 'SUCCESS').reduce((s, t) => s + t.amount, 0),
    pending: data.filter((t) => canCancel(t.status)).length,
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm">
          <span className="rounded-md bg-green-50 px-2.5 py-1 font-semibold text-green-700">
            Revenue: ₱{totals.paid.toFixed(2)}
          </span>
          {totals.pending > 0 && (
            <span className="rounded-md bg-yellow-50 px-2.5 py-1 font-semibold text-yellow-700">
              {totals.pending} pending
            </span>
          )}
        </div>
        <Button size="sm" variant="flat" onPress={() => refresh()} isLoading={loading}>
          Refresh
        </Button>
      </div>

      <Table aria-label="Payment transactions" isStriped>
        <TableHeader>
          <TableColumn>Reference</TableColumn>
          <TableColumn>Amount</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Service</TableColumn>
          <TableColumn>Created</TableColumn>
          <TableColumn>Completed</TableColumn>
          <TableColumn>Action</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No transactions found.">
          {data.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="font-mono text-xs">{tx.reference_number}</TableCell>
              <TableCell className="font-semibold">₱{tx.amount.toFixed(2)}</TableCell>
              <TableCell>
                <StatusChip status={tx.status} />
              </TableCell>
              <TableCell className="text-xs text-gray-500">{tx.service_type ?? '—'}</TableCell>
              <TableCell className="text-xs text-gray-400">{fmt(tx.created_at)}</TableCell>
              <TableCell className="text-xs text-gray-400">{fmt(tx.completed_at)}</TableCell>
              <TableCell>
                {canCancel(tx.status) ? (
                  <Button size="sm" color="danger" variant="flat" onPress={() => openCancel(tx)}>
                    Cancel
                  </Button>
                ) : (
                  <Chip size="sm" variant="flat" color="default" className="text-xs">
                    —
                  </Chip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>Cancel Transaction</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-700">
              Cancel transaction{' '}
              <span className="font-mono font-semibold">{selected?.reference_number}</span> for{' '}
              <span className="font-semibold">₱{selected?.amount.toFixed(2)}</span>?
            </p>
            <p className="mt-1 text-xs text-gray-400">This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              Keep
            </Button>
            <Button color="danger" onPress={confirmCancel} isLoading={cancelling}>
              Yes, Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
