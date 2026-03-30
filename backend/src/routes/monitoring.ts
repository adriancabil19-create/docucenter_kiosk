import { Router, Request, Response } from 'express';
import {
  getMonitoringStats,
  getRecentJobs,
  getRecentTransactions,
} from '../database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/monitoring/stats
 * Returns aggregate counts: transactions, revenue, print jobs
 */
router.get('/stats', (_req: Request, res: Response): void => {
  try {
    const stats = getMonitoringStats();
    logger.info('Monitoring stats requested');
    res.json({ success: true, stats });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring stats error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/jobs?limit=20
 * Returns recent print jobs (newest first)
 */
router.get('/jobs', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const jobs = getRecentJobs(limit);
    logger.info('Recent jobs requested', { count: jobs.length });
    res.json({ success: true, jobs, count: jobs.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring jobs error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/monitoring/transactions?limit=20
 * Returns recent payment transactions (newest first)
 */
router.get('/transactions', (req: Request, res: Response): void => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
    const transactions = getRecentTransactions(limit);
    logger.info('Recent transactions requested', { count: transactions.length });
    res.json({ success: true, transactions, count: transactions.length });
  } catch (err) {
    const error = err as Error;
    logger.error('Monitoring transactions error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
