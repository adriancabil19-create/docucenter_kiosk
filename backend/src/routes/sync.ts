/**
 * Sync ingest endpoints — used by the local kiosk backend after each DB write
 * so the admin dashboard sees live data.
 *
 * Auth: every request must carry X-Sync-Secret matching SYNC_SECRET.
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
  recordHeartbeat,
  insertIncident,
  resolveIncident,
  claimPendingCommands,
  ackCommand,
  getStorageSettings,
  getPricingSettings,
  upsertStorageDocMeta,
  softDeleteStorageDocMeta,
  listStaffRoster,
  insertPinResetRequestFromSync,
  applyStaffPinHash,
  bumpStaffLogin,
  getPaperTrays,
  insertAssistanceRequestFromSync,
  cancelAssistanceRequest,
  acknowledgeAssistanceRequest,
  resolveAssistanceRequest,
  insertRecoveryActionFromSync,
  TransactionRow,
  PrintJobRow,
  StorageDocMetaInput,
  PinResetRequestRow,
  AssistanceRequestRow,
  PrintRecoveryActionRow,
} from '../database';
import { getDb } from '../database';

const router = Router();

const requireSyncSecret = (req: Request, res: Response, next: () => void): void => {
  const secret = req.headers['x-sync-secret'];
  if (!config.sync.secret || secret !== config.sync.secret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
};

router.use(requireSyncSecret);

const acceptEventOnce = async (req: Request, res: Response): Promise<boolean> => {
  const eventId = req.header('x-sync-event-id');
  if (!eventId) return true;
  try {
    await getDb().execute({
      sql: 'INSERT INTO sync_received_events (event_id) VALUES (@eventId)',
      args: { eventId },
    });
    return true;
  } catch {
    res.json({ success: true, duplicate: true });
    return false;
  }
};

router.post('/transaction', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
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
    if (!(await acceptEventOnce(req, res))) return;
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
    if (!(await acceptEventOnce(req, res))) return;
    const row = req.body as PrintJobRow;
    await insertPrintJob(row);
    logger.info('Sync: print job received', { id: row.id });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert print job', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/print-recovery', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const row = req.body as PrintRecoveryActionRow;
    if (!row?.id || !row?.transaction_id) {
      res.status(400).json({ success: false, error: 'id and transaction_id required' });
      return;
    }
    await insertRecoveryActionFromSync(row);
    logger.info('Sync: print recovery action received', { id: row.id, transactionId: row.transaction_id });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert print recovery action', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/paper-tray', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
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
    if (!(await acceptEventOnce(req, res))) return;
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

// ─── Fleet: heartbeat, incidents, command downlink ───────────────────────────

/** Kiosk liveness ping. Not idempotency-guarded — a stale queued beat is noise. */
router.post('/heartbeat', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      kiosk_id?: string;
      label?: string;
      app_version?: string;
      printer_state?: string;
      scanner_state?: string;
      current_job_id?: string | null;
      meta?: Record<string, unknown>;
    };
    if (!body.kiosk_id) {
      res.status(400).json({ success: false, error: 'kiosk_id required' });
      return;
    }
    await recordHeartbeat({
      kiosk_id: body.kiosk_id,
      label: body.label,
      app_version: body.app_version,
      printer_state: body.printer_state,
      scanner_state: body.scanner_state,
      current_job_id: body.current_job_id ?? null,
      meta: body.meta,
    });
    // Reply with anything the kiosk needs to apply locally: pending commands,
    // the retention policy, the price list, the staff roster, and paper tray
    // levels (so an admin-side refill/capacity edit reaches the kiosk). One
    // round-trip.
    const [commands, storage, pricing, staff, paperTrays] = await Promise.all([
      claimPendingCommands(body.kiosk_id),
      getStorageSettings(),
      getPricingSettings(),
      listStaffRoster(),
      getPaperTrays(),
    ]);
    res.json({ success: true, commands, settings: { storage, pricing, staff, paperTrays } });
  } catch (err) {
    logger.warn('Sync: heartbeat failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/incident', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const body = req.body as {
      id?: string;
      kiosk_id?: string;
      device?: string;
      error_code?: string;
      severity?: 'info' | 'warning' | 'critical';
      message?: string;
      metadata?: Record<string, unknown>;
      created_at?: string;
    };
    if (!body.error_code || !body.message) {
      res.status(400).json({ success: false, error: 'error_code and message required' });
      return;
    }
    const id = await insertIncident({
      id: body.id,
      kiosk_id: body.kiosk_id,
      device: body.device,
      error_code: body.error_code,
      severity: body.severity,
      message: body.message,
      metadata: body.metadata,
      created_at: body.created_at,
    });
    logger.info('Sync: incident received', { id, code: body.error_code });
    res.json({ success: true, id });
  } catch (err) {
    logger.warn('Sync: incident failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/storage-doc', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const doc = req.body as StorageDocMetaInput;
    if (!doc?.id || !doc?.name) {
      res.status(400).json({ success: false, error: 'id and name required' });
      return;
    }
    // Never let a stale/reordered upload event revive a document the operator
    // has since deleted, and don't bounce the event back out.
    await upsertStorageDocMeta({ ...doc }, { clearDeleted: false, forward: false });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: storage-doc failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/storage-doc-delete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id } = req.body as { id?: string };
    if (!id) {
      res.status(400).json({ success: false, error: 'id required' });
      return;
    }
    // forward = false: this instance is the cloud endpoint, nothing downstream.
    await softDeleteStorageDocMeta(id, false);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: storage-doc-delete failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/staff-pin-reset-request', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const row = req.body as PinResetRequestRow;
    if (!row?.id || !row?.staff_id || !row?.username || !row?.kiosk_id) {
      res.status(400).json({ success: false, error: 'id, staff_id, username, kiosk_id required' });
      return;
    }
    await insertPinResetRequestFromSync(row);
    logger.info('Sync: staff PIN reset request received', { id: row.id, username: row.username });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert staff PIN reset request', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/staff-pin-set', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id, pin_hash, pin_updated_at } = req.body as { id?: string; pin_hash?: string; pin_updated_at?: string };
    if (!id || !pin_hash) {
      res.status(400).json({ success: false, error: 'id and pin_hash required' });
      return;
    }
    // Fallback for outbox rows queued before pin_updated_at existed.
    await applyStaffPinHash(id, pin_hash, pin_updated_at ?? new Date().toISOString());
    logger.info('Sync: staff PIN updated', { id });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to apply staff PIN', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/staff-login', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id } = req.body as { id?: string };
    if (!id) {
      res.status(400).json({ success: false, error: 'id required' });
      return;
    }
    await bumpStaffLogin(id);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to record staff login', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/assistance-request', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const row = req.body as AssistanceRequestRow;
    if (!row?.id || !row?.kiosk_id || !row?.status) {
      res.status(400).json({ success: false, error: 'id, kiosk_id, status required' });
      return;
    }
    await insertAssistanceRequestFromSync(row);
    logger.info('Sync: assistance request received', { id: row.id, kiosk_id: row.kiosk_id });
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: failed to insert assistance request', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/assistance-cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id } = req.body as { id?: string };
    if (!id) {
      res.status(400).json({ success: false, error: 'id required' });
      return;
    }
    await cancelAssistanceRequest(id);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: assistance-cancel failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * Staff acted from the kiosk itself (see assistance.ts's -local routes) —
 * apply the same transition to the cloud's copy. If the cloud's copy has
 * already moved on (e.g. a web Staff member claimed it first), the guarded
 * DB function just no-ops rather than erroring — same "first one wins,
 * everyone else told no" rule as the web path, just resolved by whichever
 * side got there first instead of a single atomic table.
 */
router.post('/assistance-ack', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id, staffUsername } = req.body as { id?: string; staffUsername?: string };
    if (!id || !staffUsername) {
      res.status(400).json({ success: false, error: 'id and staffUsername required' });
      return;
    }
    await acknowledgeAssistanceRequest(id, staffUsername);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: assistance-ack failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/assistance-resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id, staffUsername } = req.body as { id?: string; staffUsername?: string };
    if (!id || !staffUsername) {
      res.status(400).json({ success: false, error: 'id and staffUsername required' });
      return;
    }
    await resolveAssistanceRequest(id, staffUsername);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: assistance-resolve failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/incident-resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await acceptEventOnce(req, res))) return;
    const { id } = req.body as { id?: string };
    if (!id) {
      res.status(400).json({ success: false, error: 'id required' });
      return;
    }
    await resolveIncident(id);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: incident-resolve failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** Command poll — used when the kiosk does not piggyback on the heartbeat. */
router.get('/commands', async (req: Request, res: Response): Promise<void> => {
  try {
    const kioskId = String(req.query.kiosk_id ?? '').trim();
    if (!kioskId) {
      res.status(400).json({ success: false, error: 'kiosk_id required' });
      return;
    }
    const [commands, storage, pricing, staff, paperTrays] = await Promise.all([
      claimPendingCommands(kioskId),
      getStorageSettings(),
      getPricingSettings(),
      listStaffRoster(),
      getPaperTrays(),
    ]);
    res.json({ success: true, commands, settings: { storage, pricing, staff, paperTrays } });
  } catch (err) {
    logger.warn('Sync: command poll failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/commands/:id/ack', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { ok, result } = req.body as { ok?: boolean; result?: string };
    await ackCommand(id, ok !== false, result);
    res.json({ success: true });
  } catch (err) {
    logger.warn('Sync: command ack failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
