/**
 * Staff/Maintenance Mode API.
 *
 * Mixed audience, so auth is applied per-route (not once via app.use):
 *  - Admin-gated routes are called by the Next.js admin console through its
 *    `/api/backend/*` proxy — staff CRUD and PIN-recovery approve/deny.
 *  - Kiosk-gated routes are called by the Flutter app against its own local
 *    backend (loopback) — PIN login, PIN-recovery request/completion, and
 *    trimmed read-only data for the Staff dashboard.
 */

import { Router, Request, Response } from 'express';
import { requireAdminApiToken, requireKioskApiToken } from '../middleware/api-auth';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  createStaff,
  getStaffById,
  listStaff,
  updateStaff,
  setStaffStatus,
  setStaffPin,
  getStaffRowByUsername,
  getStaffRowById,
  isStaffLocked,
  recordStaffPinFailure,
  bumpStaffLogin,
  verifyPin,
  getStaffActivityLogs,
  getStaffTransactionsView,
  createPinResetRequest,
  getPinResetRequest,
  listPendingPinResetRequests,
  decidePinResetRequest,
  completePinResetRequest,
  enqueueCommand,
  insertLog,
  getRecentLogs,
  type StaffRole,
} from '../database';

const router = Router();

const PIN_RE = /^\d{6}$/;
const isValidPin = (v: unknown): v is string => typeof v === 'string' && PIN_RE.test(v);

// ─── Admin-gated: Staff CRUD ──────────────────────────────────────────────────

router.get('/', requireAdminApiToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const staff = await listStaff();
    res.json({ success: true, staff, count: staff.length });
  } catch (err) {
    logger.error('Staff: list failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, username, pin, confirmPin, role, actor } = req.body as {
      name?: string; username?: string; pin?: string; confirmPin?: string; role?: string; actor?: string;
    };
    if (!name?.trim() || !username?.trim()) {
      res.status(400).json({ success: false, error: 'Name and username are required' });
      return;
    }
    if (!isValidPin(pin)) {
      res.status(400).json({ success: false, error: 'PIN must be exactly 6 digits' });
      return;
    }
    if (pin !== confirmPin) {
      res.status(400).json({ success: false, error: 'PIN confirmation does not match' });
      return;
    }
    if (await getStaffRowByUsername(username)) {
      res.status(409).json({ success: false, error: 'Username is already taken' });
      return;
    }
    const roleValue: StaffRole = role === 'admin' ? 'admin' : 'staff';
    const staff = await createStaff({ name, username, pin, role: roleValue });
    await insertLog('info', 'staff', `${actor ?? 'Admin'} created staff account`, {
      actor: actor ?? 'admin',
      staffId: staff.id,
      username: staff.username,
    });
    res.json({ success: true, staff });
  } catch (err) {
    logger.error('Staff: create failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.put('/:id', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, username, role, actor } = req.body as {
      name?: string; username?: string; role?: string; actor?: string;
    };
    if (username) {
      const existing = await getStaffRowByUsername(username);
      if (existing && existing.id !== id) {
        res.status(409).json({ success: false, error: 'Username is already taken' });
        return;
      }
    }
    const staff = await updateStaff(id, {
      name,
      username,
      role: role === 'admin' ? 'admin' : role === 'staff' ? 'staff' : undefined,
    });
    if (!staff) {
      res.status(404).json({ success: false, error: 'Staff not found' });
      return;
    }
    await insertLog('info', 'staff', `${actor ?? 'Admin'} edited staff account`, {
      actor: actor ?? 'admin',
      staffId: id,
    });
    res.json({ success: true, staff });
  } catch (err) {
    logger.error('Staff: update failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/:id/disable', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { actor } = req.body as { actor?: string };
    await setStaffStatus(id, 'disabled');
    await insertLog('warn', 'staff', `${actor ?? 'Admin'} disabled a staff account`, {
      actor: actor ?? 'admin',
      staffId: id,
    });
    res.json({ success: true, staff: await getStaffById(id) });
  } catch (err) {
    logger.error('Staff: disable failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/:id/reactivate', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { actor } = req.body as { actor?: string };
    await setStaffStatus(id, 'active');
    await insertLog('info', 'staff', `${actor ?? 'Admin'} reactivated a staff account`, {
      actor: actor ?? 'admin',
      staffId: id,
    });
    res.json({ success: true, staff: await getStaffById(id) });
  } catch (err) {
    logger.error('Staff: reactivate failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** Admin-initiated direct PIN reset (rule 10) — distinct from the request/approval flow. */
router.post('/:id/reset-pin', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPin, confirmPin, actor } = req.body as { newPin?: string; confirmPin?: string; actor?: string };
    if (!isValidPin(newPin)) {
      res.status(400).json({ success: false, error: 'PIN must be exactly 6 digits' });
      return;
    }
    if (newPin !== confirmPin) {
      res.status(400).json({ success: false, error: 'PIN confirmation does not match' });
      return;
    }
    const staff = await getStaffById(id);
    if (!staff) {
      res.status(404).json({ success: false, error: 'Staff not found' });
      return;
    }
    await setStaffPin(id, newPin);
    await insertLog('warn', 'staff', `${actor ?? 'Admin'} reset a staff PIN`, {
      actor: actor ?? 'admin',
      staffId: id,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Staff: admin PIN reset failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/activity', requireAdminApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await getStaffActivityLogs(limit);
    res.json({ success: true, logs, count: logs.length });
  } catch (err) {
    logger.error('Staff: activity fetch failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Admin-gated: PIN-recovery approval ──────────────────────────────────────

router.get('/pin-reset-requests', requireAdminApiToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const requests = await listPendingPinResetRequests();
    res.json({ success: true, requests, count: requests.length });
  } catch (err) {
    logger.error('Staff: pin-reset-requests list failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

const decidePin = (decision: 'approved' | 'denied') =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { actor } = req.body as { actor?: string };
      const decidedBy = actor ?? 'admin';
      const request = await decidePinResetRequest(id, decision, decidedBy);
      if (!request) {
        res.status(404).json({ success: false, error: 'Request not found or already decided' });
        return;
      }
      // Push the decision down to the kiosk that raised it via the existing
      // fleet command downlink (same channel as MAINTENANCE_ON etc.).
      await enqueueCommand(
        request.kiosk_id,
        'STAFF_PIN_REQUEST_DECIDED',
        { requestId: id, decision, staffId: request.staff_id },
        decidedBy,
      );
      await insertLog('info', 'staff', `${decidedBy} ${decision} a staff PIN recovery request`, {
        actor: decidedBy,
        staffId: request.staff_id,
        requestId: id,
      });
      res.json({ success: true, request });
    } catch (err) {
      logger.error('Staff: pin-reset decision failed', { error: String(err) });
      res.status(500).json({ success: false, error: String(err) });
    }
  };

router.post('/pin-reset-requests/:id/approve', requireAdminApiToken, decidePin('approved'));
router.post('/pin-reset-requests/:id/deny', requireAdminApiToken, decidePin('denied'));

// ─── Kiosk-gated: PIN login ───────────────────────────────────────────────────

router.post('/login', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, pin } = req.body as { username?: string; pin?: string };
    if (!username || !isValidPin(pin)) {
      res.status(400).json({ success: false, error: 'Username and 6-digit PIN are required' });
      return;
    }
    const row = await getStaffRowByUsername(username);
    // Never reveal whether the username exists or which part of the check failed.
    if (!row) {
      res.status(401).json({ success: false, error: 'Invalid username or PIN' });
      return;
    }
    if (row.status === 'disabled') {
      res.status(403).json({ success: false, error: 'ACCOUNT_DISABLED' });
      return;
    }
    if (isStaffLocked(row)) {
      res.status(423).json({ success: false, error: 'ACCOUNT_LOCKED' });
      return;
    }
    if (!verifyPin(pin, row.pin_hash)) {
      const locked = await recordStaffPinFailure(row.id);
      await insertLog('warn', 'staff', 'Staff login failed', { username: row.username });
      res.status(401).json({ success: false, error: locked ? 'ACCOUNT_LOCKED' : 'Invalid username or PIN' });
      return;
    }
    await bumpStaffLogin(row.id);
    await insertLog('info', 'staff', 'Staff login', { username: row.username });
    res.json({ success: true, staff: { id: row.id, name: row.name, role: row.role } });
  } catch (err) {
    logger.error('Staff: login failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Kiosk-gated: PIN recovery (request → admin approves → staff sets new PIN) ─

router.post('/pin-reset-requests', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.body as { username?: string };
    if (!username) {
      res.status(400).json({ success: false, error: 'Username is required' });
      return;
    }
    const row = await getStaffRowByUsername(username);
    if (!row || row.status === 'disabled') {
      res.status(404).json({ success: false, error: 'Staff username not found' });
      return;
    }
    const request = await createPinResetRequest(row.id, row.username, config.kioskId);
    res.json({ success: true, request });
  } catch (err) {
    logger.error('Staff: pin-reset-request create failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/pin-reset-requests/:id', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await getPinResetRequest(req.params.id);
    if (!request) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }
    res.json({ success: true, request });
  } catch (err) {
    logger.error('Staff: pin-reset-request fetch failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post(
  '/pin-reset-requests/:id/set-new-pin',
  requireKioskApiToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { newPin, confirmPin } = req.body as { newPin?: string; confirmPin?: string };
      if (!isValidPin(newPin)) {
        res.status(400).json({ success: false, error: 'PIN must be exactly 6 digits' });
        return;
      }
      if (newPin !== confirmPin) {
        res.status(400).json({ success: false, error: 'PIN confirmation does not match' });
        return;
      }
      const request = await getPinResetRequest(id);
      if (!request) {
        res.status(404).json({ success: false, error: 'Request not found' });
        return;
      }
      const ok = await completePinResetRequest(id, request.staff_id, newPin);
      if (!ok) {
        res.status(409).json({ success: false, error: 'Request is not approved or was already used' });
        return;
      }
      await insertLog('info', 'staff', 'Staff completed PIN recovery', { username: request.username });
      res.json({ success: true });
    } catch (err) {
      logger.error('Staff: set-new-pin failed', { error: String(err) });
      res.status(500).json({ success: false, error: String(err) });
    }
  },
);

// ─── Kiosk-gated: trimmed read-only data for the Staff dashboard ────────────

router.get('/transactions', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const transactions = await getStaffTransactionsView(limit);
    res.json({ success: true, transactions, count: transactions.length });
  } catch (err) {
    logger.error('Staff: transactions fetch failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/error-logs', requireKioskApiToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const logs = (await getRecentLogs(limit * 2)).filter((l) => l.level !== 'info').slice(0, limit);
    res.json({ success: true, logs, count: logs.length });
  } catch (err) {
    logger.error('Staff: error-logs fetch failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
