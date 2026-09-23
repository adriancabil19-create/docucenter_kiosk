import { Router, Request, Response } from 'express';
import {
  getMonitoringStats,
  getRecentJobs,
  getTransactionsDetailed,
  getRecentLogs,
  getTransactionById,
  cancelTransactionById,
  getPaperTrays,
  insertLog,
  clearActivityLogs,
  pruneOldRows,
  vacuumDatabase,
} from '../database';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

const router = Router();

/** Parse ?from / ?to ISO date-time strings into an optional range filter. */
const parseRange = (req: Request): { from?: string; to?: string } | undefined => {
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  if (!from && !to) return undefined;
  return { from: from || undefined, to: to || undefined };
};

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getMonitoringStats();
    res.json({ success: true, stats });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring stats error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/jobs', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 500);
    const jobs = await getRecentJobs(limit, parseRange(req));
    res.json({ success: true, jobs, count: jobs.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring jobs error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Each transaction carries its real document/print details (joined from
// print_jobs) and its full recovery-reprint history (joined from
// print_recovery_actions) — see getTransactionsDetailed. This replaced two
// separate admin pages (Transactions, Print Recovery) with one.
router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 500);
    const transactions = await getTransactionsDetailed(limit, parseRange(req));
    res.json({ success: true, transactions, count: transactions.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring transactions error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/transactions/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tx = await getTransactionById(id);

    if (!tx) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }
    if (!['PENDING', 'PROCESSING'].includes(tx.status)) {
      res.status(400).json({
        success: false,
        error: `Cannot cancel a transaction with status "${tx.status}"`,
      });
      return;
    }

    const ok = await cancelTransactionById(id);
    if (ok) {
      await insertLog('info', 'payment', 'Transaction cancelled by admin', {
        transactionId: id,
        reference: tx.reference_number,
        amount: tx.amount,
      });
      res.json({ success: true, message: 'Transaction cancelled' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to cancel transaction' });
    }
  } catch (err) {
    const error = err as Error;
    logger.error('Cancel transaction error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1000);
    const logs = await getRecentLogs(limit, parseRange(req));
    res.json({ success: true, logs, count: logs.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring logs error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/monitoring/vacuum — run the same prune-old-rows + VACUUM pass the
 * 6-hourly maintenance job does, on demand. Safe to call any time; a no-op
 * pass just costs a little I/O. Use this to reclaim disk space immediately
 * instead of waiting for the next scheduled cycle (or a redeploy).
 */
router.post('/vacuum', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pruned = await pruneOldRows();
    const startedAt = Date.now();
    await vacuumDatabase();
    const ms = Date.now() - startedAt;
    logger.info('DB vacuum triggered by admin', { pruned, ms });
    res.json({ success: true, pruned, vacuumMs: ms });
  } catch (err) {
    const error = err as Error;
    logger.error('Manual vacuum error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/** DELETE /api/monitoring/logs — wipe the activity log to reclaim space. */
router.delete('/logs', async (_req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await clearActivityLogs();
    logger.info('Activity log cleared by admin', { deleted });
    res.json({ success: true, deleted });
  } catch (err) {
    const error = err as Error;
    logger.error('Clear logs error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/kiosk-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getMonitoringStats();
    const paperTrays = await getPaperTrays(config.kioskId);
    const lowPaperTrays = paperTrays.filter((t) => t.current_count <= t.threshold);

    res.json({
      success: true,
      status: {
        server: {
          online: true,
          uptimeSeconds: Math.floor(process.uptime()),
          environment: process.env.NODE_ENV || 'development',
          version: '1.0.0',
        },
        database: { connected: true },
        paperTrays,
        lowPaperAlerts: lowPaperTrays.length,
        stats,
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.error('Kiosk status error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
