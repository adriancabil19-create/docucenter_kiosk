'use client';

import { useEffect, useState } from 'react';
import { Button, Chip, Input, Select, SelectItem, Textarea, addToast } from '@heroui/react';
import { refundTransaction, refreshRefundStatus } from '@/lib/api';
import type { Refund, RefundReason, Transaction } from '@/lib/types';

const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  requested_by_customer: 'Requested by customer',
  duplicate: 'Duplicate payment',
  others: 'Others',
};

const REFUND_STATUS_COLOR: Record<Refund['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  succeeded: 'success',
  pending: 'warning',
  processing: 'warning',
  failed: 'danger',
};

function formatAmount(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

interface Props {
  transaction: Transaction;
  onChanged: () => void;
}

/**
 * Refunds for one transaction via PayMongo. Sends real money back when the
 * backend runs with a live key, so every refund goes through an explicit
 * confirm step, and the history below is never edited — a failed attempt
 * stays on record next to the retry.
 */
export function RefundPanel({ transaction: tx, onChanged }: Props) {
  const refundable = tx.refundable_amount ?? 0;
  const [amount, setAmount] = useState(refundable.toFixed(2));
  const [reason, setReason] = useState<RefundReason>('requested_by_customer');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    setAmount(refundable.toFixed(2));
    setConfirming(false);
  }, [tx.id, refundable]);

  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed >= 1 && parsed <= refundable + 1e-9;
  const notesValid = reason !== 'others' || notes.trim().length > 0;
  const canRefund = tx.status === 'SUCCESS' && refundable >= 1;

  const submit = async () => {
    setBusy(true);
    const res = await refundTransaction(tx.id, {
      amount: Math.round(parsed * 100) / 100,
      reason,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    setConfirming(false);
    if (res.success) {
      addToast({
        title: res.refund?.status === 'succeeded' ? 'Refund sent' : 'Refund submitted',
        description: `${formatAmount(parsed)} to the customer (${res.refund?.status ?? 'pending'}).`,
        color: 'success',
      });
      setNotes('');
    } else {
      addToast({ title: 'Refund failed', description: res.error ?? 'PayMongo rejected the refund.', color: 'danger' });
    }
    onChanged();
  };

  const refreshStatus = async (refund: Refund) => {
    setRefreshingId(refund.id);
    const res = await refreshRefundStatus(refund.id);
    setRefreshingId(null);
    if (!res.success) addToast({ title: 'Could not check status', description: res.error, color: 'danger' });
    onChanged();
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Refunds</p>

      {tx.refunds.length > 0 && (
        <div className="mb-3 space-y-2">
          {tx.refunds.map((r) => (
            <div key={r.id} className="rounded-md bg-slate-900/[0.03] px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip size="sm" variant="flat" color={REFUND_STATUS_COLOR[r.status]} className="capitalize">
                    {r.status}
                  </Chip>
                  <span className="font-semibold text-slate-700">{formatAmount(r.amount)}</span>
                  <span className="text-slate-500">{REFUND_REASON_LABEL[r.reason] ?? r.reason}</span>
                  {r.livemode === false && (
                    <Chip size="sm" variant="flat">
                      Test mode
                    </Chip>
                  )}
                </div>
                {(r.status === 'pending' || r.status === 'processing') && r.paymongo_refund_id && (
                  <Button size="sm" variant="flat" isLoading={refreshingId === r.id} onPress={() => refreshStatus(r)}>
                    Check status
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                By {r.requested_by} · {formatDate(r.created_at)}
                {r.paymongo_refund_id && <> · PayMongo {r.paymongo_refund_id}</>}
              </p>
              {r.notes && <p className="mt-1 text-xs italic text-slate-500">&ldquo;{r.notes}&rdquo;</p>}
              {r.error && <p className="mt-1 text-xs text-danger">{r.error}</p>}
            </div>
          ))}
        </div>
      )}

      {canRefund ? (
        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">
            Refundable balance: <span className="font-semibold text-slate-700">{formatAmount(refundable)}</span>{' '}
            of {formatAmount(tx.amount)} paid. The money goes back to the customer&apos;s bank or e-wallet through
            PayMongo.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="number"
              label="Amount (₱)"
              size="sm"
              min={1}
              max={refundable}
              step="0.01"
              value={amount}
              onValueChange={(v) => {
                setAmount(v);
                setConfirming(false);
              }}
              isInvalid={!amountValid}
              errorMessage={amountValid ? undefined : `Enter ₱1.00 – ${formatAmount(refundable)}`}
            />
            <Select
              label="Reason"
              size="sm"
              selectedKeys={[reason]}
              onSelectionChange={(keys) => {
                const next = Array.from(keys)[0] as RefundReason | undefined;
                if (next) setReason(next);
              }}
            >
              {(Object.keys(REFUND_REASON_LABEL) as RefundReason[]).map((key) => (
                <SelectItem key={key}>{REFUND_REASON_LABEL[key]}</SelectItem>
              ))}
            </Select>
          </div>
          <Textarea
            label={reason === 'others' ? 'Note (required)' : 'Note (optional)'}
            size="sm"
            minRows={1}
            maxLength={255}
            value={notes}
            onValueChange={setNotes}
            isInvalid={!notesValid}
          />
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning-50 p-2 text-sm text-warning-700">
              <span className="grow">
                Send {formatAmount(parsed)} back to the customer? This cannot be undone.
              </span>
              <Button size="sm" variant="flat" onPress={() => setConfirming(false)} isDisabled={busy}>
                Cancel
              </Button>
              <Button size="sm" color="danger" onPress={submit} isLoading={busy}>
                Confirm refund
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              color="danger"
              variant="flat"
              isDisabled={!amountValid || !notesValid}
              onPress={() => setConfirming(true)}
            >
              Refund {amountValid ? formatAmount(parsed) : ''}
            </Button>
          )}
        </div>
      ) : (
        tx.refunds.length === 0 && (
          <p className="text-sm text-slate-400">
            {tx.status === 'SUCCESS' ? 'Nothing left to refund.' : 'Only paid transactions can be refunded.'}
          </p>
        )
      )}
    </div>
  );
}
