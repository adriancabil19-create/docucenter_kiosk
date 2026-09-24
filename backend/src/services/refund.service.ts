/**
 * Admin-issued PayMongo refunds. Runs on whichever instance serves the admin
 * console (needs PAYMONGO_SECRET_KEY there). Each refund is recorded before
 * PayMongo is called, then mirrored to the kiosks through the existing
 * command downlink so Staff Mode and Print Recovery see it too.
 */

import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  enqueueCommand,
  getKiosks,
  getTransactionById,
  insertLog,
  insertRefund,
  listRefundsForTransaction,
  listUnsettledRefunds,
  updateRefund,
  getRefundById,
  type RefundReason,
  type RefundRow,
} from '../database';
import { paymongoService, payMongoErrorMessage } from './paymongo';

export const REFUND_REASONS: RefundReason[] = ['requested_by_customer', 'duplicate', 'others'];

/** PayMongo's refund window for QR Ph payments. */
const REFUND_WINDOW_DAYS = 30;

export class RefundError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const inProgress = new Set<string>();

const notifyKiosks = async (refund: RefundRow, actor: string): Promise<void> => {
  try {
    const kiosks = await getKiosks();
    for (const k of kiosks) {
      await enqueueCommand(k.kiosk_id, 'TRANSACTION_REFUND_UPDATED', refund as unknown as Record<string, unknown>, actor);
    }
  } catch (err) {
    logger.warn('Refund: could not notify kiosks', { refundId: refund.id, error: String(err) });
  }
};

export const issueRefund = async (input: {
  transactionId: string;
  amount?: number;
  reason: string;
  notes?: string;
  actor: string;
}): Promise<RefundRow> => {
  const { transactionId, actor } = input;
  if (!config.PAYMONGO.secretKey) {
    throw new RefundError('PAYMONGO_SECRET_KEY is not set on this backend, so refunds cannot be issued here.', 503);
  }
  if (!REFUND_REASONS.includes(input.reason as RefundReason)) {
    throw new RefundError(`reason must be one of: ${REFUND_REASONS.join(', ')}`, 400);
  }
  const notes = input.notes?.trim() || null;
  if (input.reason === 'others' && !notes) {
    throw new RefundError('Please add a note when the reason is "Others".', 400);
  }
  if (inProgress.has(transactionId)) {
    throw new RefundError('A refund for this transaction is already being processed.', 409);
  }

  inProgress.add(transactionId);
  try {
    const txn = await getTransactionById(transactionId);
    if (!txn) throw new RefundError('Transaction not found.', 404);
    if (txn.status !== 'SUCCESS') throw new RefundError(`Only paid transactions can be refunded (status: ${txn.status}).`, 409);
    if (!transactionId.startsWith('pi_')) {
      throw new RefundError('This transaction was not paid through PayMongo, so there is nothing to refund.', 409);
    }
    const ageDays = (Date.now() - Date.parse(txn.created_at)) / 86_400_000;
    if (ageDays > REFUND_WINDOW_DAYS) {
      throw new RefundError(`PayMongo only refunds QR Ph payments within ${REFUND_WINDOW_DAYS} days.`, 409);
    }

    const existing = await listRefundsForTransaction(transactionId);
    const committed = existing
      .filter((r) => r.status !== 'failed')
      .reduce((s, r) => s + r.amount, 0);
    const remaining = Math.round((Number(txn.amount) - committed) * 100) / 100;
    const amount = input.amount == null ? remaining : Math.round(Number(input.amount) * 100) / 100;
    if (!(remaining > 0)) throw new RefundError('This transaction has already been fully refunded.', 409);
    if (!Number.isFinite(amount) || amount < 1) throw new RefundError('Refund amount must be at least ₱1.00.', 400);
    if (amount > remaining) {
      throw new RefundError(`Refund amount cannot exceed the refundable balance of ₱${remaining.toFixed(2)}.`, 400);
    }

    let refund = await insertRefund({
      transaction_id: transactionId,
      amount,
      reason: input.reason as RefundReason,
      notes,
      requested_by: actor,
    });

    try {
      const paymentId = await paymongoService.getPaidPaymentId(transactionId);
      if (!paymentId) throw new Error('PayMongo has no paid payment for this transaction.');
      const created = await paymongoService.createRefund({
        paymentId,
        amount,
        reason: input.reason,
        notes,
        metadata: { transaction_id: transactionId, docucenter_refund_id: refund.id, requested_by: actor },
      });
      refund = (await updateRefund(refund.id, {
        paymongo_payment_id: paymentId,
        paymongo_refund_id: created.id,
        status: created.status,
        livemode: created.livemode,
      }))!;
    } catch (err) {
      const message = payMongoErrorMessage(err);
      refund = (await updateRefund(refund.id, { status: 'failed', error: message }))!;
      logger.warn('Refund: PayMongo rejected refund', { refundId: refund.id, transactionId, error: message });
    }

    await insertLog(
      refund.status === 'failed' ? 'error' : 'warn',
      'payment',
      refund.status === 'failed'
        ? `${actor} tried to refund ₱${amount.toFixed(2)} on ${transactionId} — failed`
        : `${actor} refunded ₱${amount.toFixed(2)} on ${transactionId}`,
      {
        actor,
        transactionId,
        paymentReference: txn.reference_number,
        amountPaid: txn.amount,
        refundAmount: amount,
        refundId: refund.id,
        paymongoRefundId: refund.paymongo_refund_id,
        reason: refund.reason,
        notes,
        status: refund.status,
        error: refund.error,
      },
    );
    await notifyKiosks(refund, actor);
    return refund;
  } finally {
    inProgress.delete(transactionId);
  }
};

/** Re-read a refund's status from PayMongo; mirrors any change to the kiosks. */
export const refreshRefund = async (refundId: string): Promise<RefundRow> => {
  const refund = await getRefundById(refundId);
  if (!refund) throw new RefundError('Refund not found.', 404);
  if (!refund.paymongo_refund_id || refund.status === 'succeeded' || refund.status === 'failed') return refund;
  if (!config.PAYMONGO.secretKey) throw new RefundError('PAYMONGO_SECRET_KEY is not set on this backend.', 503);

  const remote = await paymongoService.retrieveRefund(refund.paymongo_refund_id);
  if (remote.status === refund.status) return refund;
  const updated = (await updateRefund(refund.id, { status: remote.status }))!;
  await insertLog('info', 'payment', `Refund on ${refund.transaction_id} is now ${remote.status}`, {
    refundId: refund.id,
    transactionId: refund.transaction_id,
    status: remote.status,
  });
  await notifyKiosks(updated, 'paymongo');
  return updated;
};

let pollerStarted = false;

/** Settles pending/processing refunds without the admin having to refresh. */
export const startRefundStatusPoller = (): void => {
  if (pollerStarted || !config.isCloudRole || !config.PAYMONGO.secretKey) return;
  pollerStarted = true;
  setInterval(async () => {
    try {
      for (const r of await listUnsettledRefunds()) {
        await refreshRefund(r.id).catch((err) =>
          logger.warn('Refund poller: refresh failed', { refundId: r.id, error: payMongoErrorMessage(err) }),
        );
      }
    } catch (err) {
      logger.warn('Refund poller error', { error: String(err) });
    }
  }, 2 * 60_000);
};
