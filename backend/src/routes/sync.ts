/**
 * Sync ingest endpoints — only active on the Render-hosted backend.
 * The local kiosk backend POSTs events here after each DB write so the
 * admin dashboard sees live data.
 *
 * Auth: every request must carry X-Sync-Secret matching RENDER_SYNC_SECRET.
 */

import { Router, Request, Response } from 'express';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  insertTransaction,
  insertPrintJob,
  updateTransactionStatus,
  updatePaperTray,
  insertLog,
  TransactionRow,
  PrintJobRow,
} from '../database';

const router = Router();

const requireSyncSecret = (req: Request, res: Response, next: () => void): void => {
  const secret = req.headers['x-sync-secret'];
  if (!config.renderSync.secret || secret !== config.renderSync.secret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
};

router.use(requireSyncSecret);

router.post('/transaction', async (req: Request, res: Response): Promise<void> => {
  try {
    const row = req.body as Omit<TransactionRow, 'created_at'>;
    await insertTransaction(row);
    logger.info('Sync: transaction received', { id: row.id });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert transaction', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/transaction-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, status, completedAt } = req.body as { id: string; status: string; completedAt?: string };
    await updateTransactionStatus(id, status, completedAt);
    logger.info('Sync: transaction status updated', { id, status });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to update transaction status', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/print-job', async (req: Request, res: Response): Promise<void> => {
  try {
    const row = req.body as PrintJobRow;
    await insertPrintJob(row);
    logger.info('Sync: print job received', { id: row.id });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert print job', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/paper-tray', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tray_name, current_count, max_capacity } = req.body as {
      tray_name: string;
      current_count: number;
      max_capacity?: number;
    };
    await updatePaperTray(tray_name, current_count, max_capacity);
    logger.info('Sync: paper tray updated', { tray_name, current_count });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to update paper tray', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/log', async (req: Request, res: Response): Promise<void> => {
  try {
    const { level, category, message, metadata } = req.body as {
      level: 'info' | 'warn' | 'error';
      category: string;
      message: string;
      metadata?: Record<string, unknown>;
    };
    await insertLog(level, category, message, metadata);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert log', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
