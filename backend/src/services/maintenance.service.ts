/**
 * DB housekeeping — keeps the churny tables (activity_logs, sync_outbox,
 * sync_received_events, finished commands, tombstones, resolved incidents) from
 * growing without bound on the free tier. Runs on every role.
 */

import { logger } from '../utils/logger';
import { pruneOldRows } from '../database';

let started = false;

const run = async (): Promise<void> => {
  try {
    const counts = await pruneOldRows();
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total > 0) logger.info('DB prune completed', counts);
  } catch (err) {
    logger.warn('DB prune failed', { error: String(err) });
  }
};

export const startMaintenanceJob = (): void => {
  if (started) return;
  started = true;
  logger.info('DB maintenance job started', { everyHours: 6 });
  setTimeout(() => void run(), 60_000); // first pass a minute after boot
  setInterval(() => void run(), 6 * 60 * 60 * 1000);
};
