/**
 * Reliable outbound metadata sync from the kiosk to the cloud backend.
 * Document bytes remain local to the kiosk.
 */

import { randomUUID } from 'crypto';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { getDb } from '../database';

const { url: SYNC_URL, secret: SYNC_SECRET } = config.sync;

export type SyncEventType =
  | 'transaction'
  | 'transaction-status'
  | 'print-job'
  | 'paper-tray'
  | 'log'
  | 'incident'
  | 'incident-resolve'
  | 'storage-doc'
  | 'storage-doc-delete'
  | 'staff-pin-reset-request'
  | 'staff-pin-set'
  | 'staff-login'
  | 'assistance-request'
  | 'assistance-cancel'
  | 'assistance-ack'
  | 'assistance-resolve';

/** Give up on an outbox row after this many failed POSTs (~1 day with backoff). */
const MAX_SYNC_ATTEMPTS = 25;

let workerStarted = false;

export const syncEvent = (type: SyncEventType, payload: unknown): void => {
  if (!SYNC_URL || !SYNC_SECRET) return;

  void getDb().execute({
    sql: `INSERT INTO sync_outbox (id, event_type, payload, status, attempts, next_attempt_at)
          VALUES (@id, @event_type, @payload, 'pending', 0, datetime('now'))`,
    args: {
      id: randomUUID(),
      event_type: type,
      payload: JSON.stringify(payload),
    },
  }).then(() => startSyncWorker()).catch((err: unknown) => {
    logger.error('Failed to queue cloud sync event', { type, error: String(err) });
  });
};

const startSyncWorker = (): void => {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(() => { void flushSyncOutbox(); }, 5000);
  void flushSyncOutbox();
};

export const flushSyncOutbox = async (): Promise<void> => {
  if (!SYNC_URL || !SYNC_SECRET) return;

  const result = await getDb().execute(`
    SELECT id, event_type, payload, attempts
    FROM sync_outbox
    WHERE status = 'pending' AND next_attempt_at <= datetime('now')
    ORDER BY created_at ASC
    LIMIT 25
  `);

  for (const row of result.rows) {
    const eventId = String(row[0]);
    const type = String(row[1]);
    const payload = String(row[2]);
    const attempts = Number(row[3] ?? 0);

    try {
      const response = await fetch(`${SYNC_URL}/api/sync/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Secret': SYNC_SECRET,
          'X-Sync-Event-Id': eventId,
        },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await getDb().execute({
        sql: `UPDATE sync_outbox SET status = 'sent', sent_at = datetime('now') WHERE id = @id`,
        args: { id: eventId },
      });
    } catch (err) {
      const nextAttempts = attempts + 1;
      // ~25 tries with exponential backoff is roughly a day of trying. After
      // that, dead-letter it so the outbox can't grow without bound when the
      // cloud is unreachable or SYNC_URL/SYNC_SECRET are wrong. Housekeeping
      // then clears 'failed' rows.
      if (nextAttempts >= MAX_SYNC_ATTEMPTS) {
        await getDb().execute({
          sql: `UPDATE sync_outbox SET status = 'failed', attempts = @a WHERE id = @id`,
          args: { id: eventId, a: nextAttempts },
        });
        logger.error('Cloud sync event dead-lettered', { type, eventId, attempts: nextAttempts });
        continue;
      }
      const nextDelay = Math.min(3600, 2 ** Math.min(attempts, 10));
      await getDb().execute({
        sql: `UPDATE sync_outbox SET attempts = @a,
                next_attempt_at = datetime('now', '+' || @delay || ' seconds')
              WHERE id = @id`,
        args: { id: eventId, a: nextAttempts, delay: nextDelay },
      });
      logger.warn('Cloud sync retry scheduled', { type, eventId, error: String(err) });
    }
  }
};
