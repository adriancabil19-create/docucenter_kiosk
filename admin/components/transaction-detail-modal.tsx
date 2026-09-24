'use client';

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
} from '@heroui/react';
import type { Transaction, PrintRecoveryAction } from '@/lib/types';
import { StatusChip } from './status-chip';
import { RefundPanel } from './refund-panel';
import { PaymentStatusChip } from './transactions-table';
import { REASON_LABEL, RESULT_COLOR, formatDate, formatAmount } from './transactions-table';

const glassModalClassNames = {
  base: 'glass-strong',
  backdrop: 'bg-slate-900/20 backdrop-blur-sm',
};

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
  onReauthorize: (action: PrintRecoveryAction) => void;
  onRefundChanged: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? '—'}</p>
    </div>
  );
}

/**
 * The full-detail view of a single transaction — every field the record
 * carries, not just the columns that fit in the table row. Recovered
 * transactions keep their ORIGINAL job details here (paper size, color,
 * duplex, price) alongside — not instead of — the recovery history, since
 * that original config is exactly what a recovery reprint is supposed to
 * reproduce.
 */
export function TransactionDetailModal({ transaction, onClose, onReauthorize, onRefundChanged }: Props) {
  const tx = transaction;

  return (
    <Modal isOpen={tx != null} onClose={onClose} size="2xl" classNames={glassModalClassNames} scrollBehavior="inside">
      <ModalContent>
        {tx && (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <span className="font-mono text-base">{tx.reference_number}</span>
              <span className="text-xs font-normal text-slate-500">Transaction ID: {tx.id}</span>
            </ModalHeader>
            <ModalBody className="gap-5 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={tx.status} />
                <PaymentStatusChip transaction={tx} />
                {tx.print_status && <StatusChip status={tx.print_status} />}
                {tx.recoveries.length > 0 && (
                  <Chip size="sm" variant="flat" color="warning">
                    ♻️ Recovered {tx.recoveries.length}×
                  </Chip>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Document{tx.document_names.length === 1 ? '' : 's'}
                </p>
                {tx.document_names.length === 0 ? (
                  <p className="text-sm text-slate-400">No document on file for this transaction.</p>
                ) : (
                  <ul className="space-y-1">
                    {tx.document_names.map((name, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                        <span aria-hidden="true">📄</span>
                        <span className="break-all">{name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Service" value={tx.service_type} />
                <Field label="Paper Size" value={tx.paper_size} />
                <Field label="Color Mode" value={tx.color_mode === 'color' ? 'Color' : tx.color_mode ? 'Black & White' : null} />
                <Field label="Duplex" value={tx.duplex == null ? null : tx.duplex ? 'Yes (2-sided)' : 'No (1-sided)'} />
                <Field label="Pages per copy" value={tx.page_count} />
                <Field label="Copies" value={tx.copies} />
                <Field
                  label="Total Pages Printed"
                  value={tx.page_count != null && tx.copies != null ? tx.page_count * tx.copies : null}
                />
                <Field label="Price per Page" value={tx.unit_price != null ? formatAmount(tx.unit_price) : null} />
                <Field label="Amount Paid" value={formatAmount(tx.amount)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Created" value={formatDate(tx.created_at)} />
                <Field label="Completed" value={tx.completed_at ? formatDate(tx.completed_at) : null} />
              </div>

              <RefundPanel transaction={tx} onChanged={onRefundChanged} />

              {tx.recoveries.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recovery history
                  </p>
                  <div className="space-y-2">
                    {tx.recoveries.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-md bg-slate-900/[0.03] px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip size="sm" variant="flat" color={RESULT_COLOR[a.result]} className="capitalize">
                              {a.result}
                            </Chip>
                            <span className="font-medium text-slate-700">{a.staff_name}</span>
                            <span className="text-slate-500">{REASON_LABEL[a.reason] ?? a.reason}</span>
                          </div>
                          {a.result === 'success' && !a.reauthorized_at && (
                            <Button size="sm" variant="flat" onPress={() => onReauthorize(a)}>
                              Reauthorize
                            </Button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {a.pages} page(s) × {a.copies} · {formatDate(a.created_at)}
                          {a.reauthorized_at && <> · Reauthorized {formatDate(a.reauthorized_at)}</>}
                        </p>
                        {a.reason_note && (
                          <p className="mt-1 text-xs italic text-slate-500">&ldquo;{a.reason_note}&rdquo;</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={onClose}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
