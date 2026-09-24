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
import type { PrintJob, PrintBillingType } from '@/lib/types';
import { StatusChip } from './status-chip';
import { formatDate, formatAmount } from './transactions-table';

const glassModalClassNames = {
  base: 'glass-strong',
  backdrop: 'bg-slate-900/20 backdrop-blur-sm',
};

export const BILLING_LABEL: Record<PrintBillingType, string> = {
  paid: 'Paid',
  recovery: 'Recovery reprint',
  staff_test: 'Staff test print',
  admin_authorized: 'Admin authorized',
};

export const BILLING_COLOR: Record<PrintBillingType, 'success' | 'warning' | 'secondary'> = {
  paid: 'success',
  recovery: 'warning',
  staff_test: 'secondary',
  admin_authorized: 'warning',
};

interface Props {
  job: PrintJob | null;
  onClose: () => void;
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
 * Full-detail view of a single print job — every field the record carries,
 * not just the columns that fit in the table row. Sheets consumed is shown
 * alongside total pages because duplex makes the two differ, and that gap is
 * what reconciles a job against the paper-tray counts.
 */
export function PrintJobDetailModal({ job, onClose }: Props) {
  const totalPages =
    job?.page_count != null && job?.copies != null ? job.page_count * job.copies : null;
  // Duplex puts two pages on one physical sheet, so a 2-sided job draws half
  // the sheets (rounded up for an odd page count).
  const sheets = totalPages == null ? null : job?.duplex ? Math.ceil(totalPages / 2) : totalPages;
  const estTotal =
    job?.unit_price != null && totalPages != null ? job.unit_price * totalPages : null;
  const billing = job?.billing_type ?? 'paid';

  return (
    <Modal
      isOpen={job != null}
      onClose={onClose}
      size="2xl"
      classNames={glassModalClassNames}
      scrollBehavior="inside"
    >
      <ModalContent>
        {job && (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <span className="font-mono text-base">{job.id}</span>
              <span className="text-xs font-normal text-slate-500">
                Transaction: {job.transaction_id ?? 'none (not tied to a payment)'}
              </span>
            </ModalHeader>
            <ModalBody className="gap-5 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={job.status} />
                <Chip size="sm" variant="flat" color={job.simulated ? 'warning' : 'success'}>
                  {job.simulated ? 'Simulated' : 'Real'}
                </Chip>
                <Chip size="sm" variant="flat" color={BILLING_COLOR[billing]}>
                  {BILLING_LABEL[billing]}
                </Chip>
                {job.duplex && (
                  <Chip size="sm" variant="flat" color="primary">
                    2-sided
                  </Chip>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Document{job.filenames.length === 1 ? '' : 's'}
                </p>
                {job.filenames.length === 0 ? (
                  <p className="text-sm text-slate-400">No document on file for this job.</p>
                ) : (
                  <ul className="space-y-1">
                    {job.filenames.map((name, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                        <span aria-hidden="true">📄</span>
                        <span className="break-all">{name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Service" value={job.service_type} />
                <Field label="Paper Size" value={job.paper_size} />
                <Field
                  label="Color Mode"
                  value={
                    job.color_mode === 'color'
                      ? 'Color'
                      : job.color_mode
                        ? 'Black & White'
                        : null
                  }
                />
                <Field
                  label="Duplex"
                  value={job.duplex == null ? null : job.duplex ? 'Yes (2-sided)' : 'No (1-sided)'}
                />
                <Field label="Pages per copy" value={job.page_count} />
                <Field label="Copies" value={job.copies} />
                <Field label="Total Pages Printed" value={totalPages} />
                <Field label="Sheets Consumed" value={sheets} />
                <Field
                  label="Price per Page"
                  value={job.unit_price != null ? formatAmount(job.unit_price) : null}
                />
                <Field label="Estimated Total" value={estTotal != null ? formatAmount(estTotal) : null} />
                <Field label="Method" value={job.method} />
                <Field label="Created" value={formatDate(job.created_at)} />
              </div>
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
