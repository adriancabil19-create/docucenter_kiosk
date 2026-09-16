/**
 * Customer "Ask for Assistance" API.
 *
 * Mixed audience, so auth is applied per-route (not once via app.use), the
 * same pattern as staff.ts:
 *  - Kiosk-gated routes are called by the Flutter app against its own local
 *    backend (loopback) — create/cancel/poll the ONE request this kiosk may
 *    have active. Kiosk identity is never taken from the request body/client;
 *    it is always this instance's own config.kioskId (rule 14).
 *  - Admin-gated routes are called by the Next.js admin console through its
 *    `/api/backend/*` proxy — list/acknowledge/resolve/cancel + notifications.
 *    Both the ADMIN and STAFF console roles reach these (the proxy route
 *    itself restricts which prefixes a STAFF session may call — see
 *    admin/app/api/backend/[...path]/route.ts).
 */

import { Router, Request, Response } from 'express';
import { requireAdminApiToken, requireKioskApiToken } from '../middleware/api-auth';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  createAssistanceRequest,
  getKioskAssistanceStatus,
  getAssistanceRequestById,
  cancelAssistanceRequest,
  acknowledgeAssistanceRequest,
  resolveAssistanceRequest,
  listAssistanceRequests,
  listStaffNotifications,
  markNotificationRead,
  getUnreadNotificationCount,
  getActiveAssistanceCount,
  enqueueCommand,
  insertLog,
  type AssistanceStatus,
} from '../database';
import { syncEvent } from '../services/sync.service';

const router = Router();

const VALID_HISTORY_STATUSES: AssistanceStatus[] = [
  'PENDING',
  'ACKNOWLEDGED',
  'RESOLVED',
  'CANCELLED',
  'EXPIRED',
];

// ─── Kiosk-gated: customer flow ──────────────────────────────────────────────

router.post('/', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body as { message?: string };
    const kioskId = config.kioskId; // never trust a client-supplied kiosk id
    const result = await createAssistanceRequest(kioskId, message?.trim() || undefined);

    if (result.ok) {
      await insertLog('info', 'assistance', `Kiosk ${kioskId} requested staff assistance`, {
        kioskId,
        requestId: result.request.id,
      });
      res.json({ success: true, request: result.request });
      return;
    }

    // strictNullChecks is off project-wide, which defeats discriminated-union
    // narrowing across statements here — assert the failure shape explicitly
    // instead of relying on control-flow narrowing of `result.ok`.
    const failure = result as Exclude<typeof result, { ok: true }>;
    if (failure.reason === 'ACTIVE_EXISTS') {
      res.status(409).json({ success: false, error: 'ACTIVE_EXISTS', request: failure.request });
      return;
    }
    if (failure.reason === 'COOLDOWN') {
      res
        .status(429)
        .json({ success: false, error: 'COOLDOWN', retryAfterSeconds: failure.retryAfterSeconds });
      return;
    }
    res.status(429).json({ success: false, error: 'RATE_LIMITED' });
  } catch (err) {
    logger.error('Assistance: create failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/active', requireKioskApiToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const request = await getKioskAssistanceStatus(config.kioskId);
    res.json({ success: true, request });
  } catch (err) {
    logger.error('Assistance: active fetch failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/:id/cancel-request', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await getAssistanceRequestById(id);
    if (!existing || existing.kiosk_id !== config.kioskId) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }
    // Customers may only back out of a still-unclaimed request — once Staff
    // has acknowledged, cancellation is an Admin/Staff console action.
    const cancelled = await cancelAssistanceRequest(id, ['PENDING']);
    if (!cancelled) {
      res.status(409).json({ success: false, error: 'Request is no longer cancellable' });
      return;
    }
    syncEvent('assistance-cancel', { id });
    res.json({ success: true, request: cancelled });
  } catch (err) {
    logger.error('Assistance: kiosk cancel failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Admin-gated: Staff/Admin console ────────────────────────────────────────

router.get('/', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const statusParam = String(req.query.status ?? '').toUpperCase();
    const status = VALID_HISTORY_STATUSES.includes(statusParam as AssistanceStatus)
      ? (statusParam as AssistanceStatus)
      : undefined;
    const kioskId = typeof req.query.kioskId === 'string' ? req.query.kioskId : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const requests = await listAssistanceRequests({ status, kioskId, limit });
    res.json({ success: true, requests, count: requests.length });
  } catch (err) {
    logger.error('Assistance: list failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/active-count', requireAdminApiToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, count: await getActiveAssistanceCount() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** Push the decision down to the kiosk via the existing command downlink (same channel as STAFF_PIN_REQUEST_DECIDED). */
const notifyKiosk = (
  kioskId: string,
  requestId: string,
  status: 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED',
  by: string,
): Promise<string> => enqueueCommand(kioskId, 'ASSISTANCE_STATUS_CHANGED', { requestId, status, by }, by);

router.post('/:id/acknowledge', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { actor } = req.body as { actor?: string };
    const staffUsername = actor ?? 'staff';
    const request = await acknowledgeAssistanceRequest(id, staffUsername);
    if (!request) {
      res
        .status(409)
        .json({ success: false, error: 'This request is already being handled by another staff member.' });
      return;
    }
    await notifyKiosk(request.kiosk_id, id, 'ACKNOWLEDGED', staffUsername);
    await insertLog('info', 'assistance', `${staffUsername} acknowledged an assistance request`, {
      actor: staffUsername,
      requestId: id,
      kioskId: request.kiosk_id,
    });
    res.json({ success: true, request });
  } catch (err) {
    logger.error('Assistance: acknowledge failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/:id/resolve', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { actor } = req.body as { actor?: string };
    const staffUsername = actor ?? 'staff';
    const request = await resolveAssistanceRequest(id, staffUsername);
    if (!request) {
      res.status(409).json({ success: false, error: 'Request is not currently acknowledged' });
      return;
    }
    await notifyKiosk(request.kiosk_id, id, 'RESOLVED', staffUsername);
    await insertLog('info', 'assistance', `${staffUsername} resolved an assistance request`, {
      actor: staffUsername,
      requestId: id,
      kioskId: request.kiosk_id,
    });
    res.json({ success: true, request });
  } catch (err) {
    logger.error('Assistance: resolve failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/:id/cancel', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { actor } = req.body as { actor?: string };
    const staffUsername = actor ?? 'admin';
    const request = await cancelAssistanceRequest(id, ['PENDING', 'ACKNOWLEDGED']);
    if (!request) {
      res.status(409).json({ success: false, error: 'Request is no longer active' });
      return;
    }
    await notifyKiosk(request.kiosk_id, id, 'CANCELLED', staffUsername);
    await insertLog('warn', 'assistance', `${staffUsername} cancelled an assistance request`, {
      actor: staffUsername,
      requestId: id,
      kioskId: request.kiosk_id,
    });
    res.json({ success: true, request });
  } catch (err) {
    logger.error('Assistance: cancel failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Admin-gated: notifications ──────────────────────────────────────────────

router.get('/notifications', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const statusParam = String(req.query.status ?? '').toUpperCase();
    const status = statusParam === 'UNREAD' || statusParam === 'READ' ? (statusParam as 'UNREAD' | 'READ') : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const notifications = await listStaffNotifications({ status, limit });
    const unreadCount = await getUnreadNotificationCount();
    res.json({ success: true, notifications, count: notifications.length, unreadCount });
  } catch (err) {
    logger.error('Assistance: notifications fetch failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/notifications/:id/read', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    await markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('Assistance: mark notification read failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
