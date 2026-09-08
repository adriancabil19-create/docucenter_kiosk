/**
 * Server-side enforcement of the document retention policy.
 * Runs on the kiosk-role backend (that instance owns the files).
 */

import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { getStorageSettings, insertLog } from '../database';
import { purgeExpiredDocuments } from './storage.service';

let started = false;

const runPurge = async (): Promise<void> => {
  try {
    const { retention_hours } = await getStorageSettings();
    const { success, deleted, error } = await purgeExpiredDocuments(retention_hours);
    if (!success) {
      logger.warn('Retention purge failed', { error });
      return;
    }
    if (deleted > 0) {
      await insertLog('info', 'storage', `Retention purge removed ${deleted} expired file(s)`, {
        deleted,
        retentionHours: retention_hours,
      });
    }
  } catch (err) {
    logger.warn('Retention purge error', { error: String(err) });
  }
};

export const startRetentionJob = (): void => {
  if (started || !config.isKioskRole) return;
  started = true;
  logger.info('Retention job started', { everyMinutes: 60 });
  // First sweep shortly after boot, then hourly.
  setTimeout(() => void runPurge(), 30_000);
  setInterval(() => void runPurge(), 60 * 60 * 1000);
};
