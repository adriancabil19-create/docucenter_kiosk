/**
 * Sync service — fires events from the local kiosk backend to the Render-hosted
 * backend so the admin dashboard reflects live kiosk activity.
 *
 * Completely fire-and-forget: failures are logged as warnings and never affect
 * the local operation. Disabled automatically when RENDER_SYNC_URL is not set.
 */

import { config } from '../utils/config';
import { logger } from '../utils/logger';

const { url: SYNC_URL, secret: SYNC_SECRET } = config.renderSync;

export type SyncEventType =
  | 'transaction'
  | 'transaction-status'
  | 'print-job'
  | 'paper-tray'
  | 'log';

export const syncEvent = (type: SyncEventType, payload: unknown): void => {
  if (!SYNC_URL || !SYNC_SECRET) return;

  fetch(`${SYNC_URL}/api/sync/${type}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Secret': SYNC_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  }).catch((err: unknown) => {
    logger.warn('Render sync failed', { type, error: String(err) });
  });
};
