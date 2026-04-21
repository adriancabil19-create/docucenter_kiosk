import { Router, Request, Response } from 'express';
import {
  getMonitoringStats,
  getRecentJobs,
  getRecentTransactions,
  getRecentLogs,
  getTransactionById,
  cancelTransactionById,
  getPaperTrays,
  insertLog,
} from '../database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/monitoring/stats
 */
router.get('/stats', (_req: Request, res: Response): void => {
  try {
    const stats = getMonitoringStats();
    res.json({ success: true, stats });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring stats error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/jobs?limit=20
 */
router.get('/jobs', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const jobs = getRecentJobs(limit);
    res.json({ success: true, jobs, count: jobs.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring jobs error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/transactions?limit=20
 */
router.get('/transactions', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const transactions = getRecentTransactions(limit);
    res.json({ success: true, transactions, count: transactions.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring transactions error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/monitoring/transactions/:id/cancel
 * Cancel a PENDING or PROCESSING transaction from the admin console.
 */
router.post('/transactions/:id/cancel', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const tx = getTransactionById(id);

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

    const ok = cancelTransactionById(id);
    if (ok) {
      insertLog('info', 'payment', 'Transaction cancelled by admin', {
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

/**
 * GET /api/monitoring/logs?limit=50
 */
router.get('/logs', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const logs = getRecentLogs(limit);
    res.json({ success: true, logs, count: logs.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring logs error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/kiosk-status
 * Returns server health, paper trays, and aggregate stats for the kiosk status dashboard.
 */
router.get('/kiosk-status', (_req: Request, res: Response): void => {
  try {
    const stats = getMonitoringStats();
    const paperTrays = getPaperTrays();
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
