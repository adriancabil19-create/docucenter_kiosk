/**
 * Web Push subscription management — admin-gated (mounted behind
 * requireAdminApiToken in index.ts, same as fleet.ts), called only by the
 * Next.js admin app's own API routes (never directly by the browser), which
 * attach the session-derived owner identity server-side rather than trusting
 * whatever a client claims (same pattern as /api/staff/verify-password).
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { savePushSubscription, removePushSubscription } from '../database';

const router = Router();

router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, keys, ownerRole, ownerUsername } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      ownerRole?: 'ADMIN' | 'STAFF';
      ownerUsername?: string;
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth || !ownerUsername) {
      res.status(400).json({ success: false, error: 'endpoint, keys, and ownerUsername are required' });
      return;
    }
    await savePushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      ownerRole: ownerRole === 'STAFF' ? 'STAFF' : 'ADMIN',
      ownerUsername,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Push: subscribe failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/unsubscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ success: false, error: 'endpoint is required' });
      return;
    }
    await removePushSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    logger.error('Push: unsubscribe failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
