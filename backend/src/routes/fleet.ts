/**
 * Fleet & operations API — admin-console facing.
 * Mounted at /api/fleet behind requireAdminApiToken.
 *
 * Covers: kiosk roster + liveness, admin→kiosk commands, structured incidents,
 * the storage-retention policy, and the analytics rollup.
 */

import { Router, Request, Response } from 'express';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  getKiosks,
  getKioskById,
  deleteKiosk,
  getRecentCommands,
  enqueueCommand,
  setKioskFlags,
  getIncidents,
  resolveIncident,
  getOpenIncidentCount,
  getStorageSettings,
  updateStorageSettings,
  getPricingSettings,
  updatePricingSettings,
  type PricingInput,
  getStorageDocMetas,
  tombstoneAllStorageDocMetas,
  getAnalytics,
  insertLog,
  listPendingPinResetRequests,
  listAssistanceRequests,
  listRecoveryActions,
  getRecoveryActionCounts,
  reauthorizeRecovery,
  type KioskCommandName,
} from '../database';
import { deleteAllDocuments, purgeExpiredDocuments } from '../services/storage.service';
import { issueRefund, refreshRefund, RefundError } from '../services/refund.service';

const router = Router();

const VALID_COMMANDS: KioskCommandName[] = [
  'MAINTENANCE_ON',
  'MAINTENANCE_OFF',
  'DISABLE_PRINTING',
  'ENABLE_PRINTING',
  'RESTART_PRINTER',
  'RESTART_APP',
  'PURGE_STORAGE',
  'DELETE_ALL_FILES',
  'DELETE_ALL_FILES_KEEP_META',
];

/** Flag-type commands whose effect we also reflect immediately on the roster row. */
const FLAG_EFFECT: Partial<Record<KioskCommandName, { maintenance?: boolean; printing_disabled?: boolean }>> = {
  MAINTENANCE_ON: { maintenance: true },
  MAINTENANCE_OFF: { maintenance: false },
  DISABLE_PRINTING: { printing_disabled: true },
  ENABLE_PRINTING: { printing_disabled: false },
};

const isOnline = (lastSeen: string): boolean => {
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= config.kioskOfflineAfterSeconds * 1000;
};

const parseRange = (req: Request): { from?: string; to?: string } | undefined => {
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : '';
  if (!from && !to) return undefined;
  return { from: from || undefined, to: to || undefined };
};

// ─── Kiosks ─────────────────────────────────────────────────────────────────

router.get('/kiosks', async (_req: Request, res: Response): Promise<void> => {
  try {
    const kiosks = (await getKiosks()).map((k) => ({
      ...k,
      online: isOnline(k.last_seen),
      status: k.maintenance ? 'MAINTENANCE' : isOnline(k.last_seen) ? 'ONLINE' : 'OFFLINE',
    }));
    res.json({ success: true, kiosks, count: kiosks.length });
  } catch (err) {
    logger.error('Fleet: list kiosks failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/kiosks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const kiosk = await getKioskById(req.params.id);
    if (!kiosk) {
      res.status(404).json({ success: false, error: 'Kiosk not found' });
      return;
    }
    const commands = await getRecentCommands(kiosk.kiosk_id, 30);
    res.json({
      success: true,
      kiosk: {
        ...kiosk,
        online: isOnline(kiosk.last_seen),
        status: kiosk.maintenance
          ? 'MAINTENANCE'
          : isOnline(kiosk.last_seen)
            ? 'ONLINE'
            : 'OFFLINE',
      },
      commands,
    });
  } catch (err) {
    logger.error('Fleet: get kiosk failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * Forget a kiosk's roster row — for a decommissioned device or a stale
 * duplicate left behind by a KIOSK_ID rename. Refuses to delete a kiosk
 * that's currently online so a live device can't be removed out from under
 * itself; it'll just reappear on its next heartbeat anyway.
 */
router.delete('/kiosks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const kiosk = await getKioskById(req.params.id);
    if (!kiosk) {
      res.status(404).json({ success: false, error: 'Kiosk not found' });
      return;
    }
    if (isOnline(kiosk.last_seen)) {
      res.status(409).json({ success: false, error: 'Kiosk is online — cannot remove' });
      return;
    }
    await deleteKiosk(kiosk.kiosk_id);
    await insertLog('info', 'system', `Kiosk ${kiosk.kiosk_id} removed from fleet roster`, {
      kioskId: kiosk.kiosk_id,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Fleet: delete kiosk failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/kiosks/:id/commands', async (req: Request, res: Response): Promise<void> => {
  try {
    const kioskId = req.params.id;
    const { command, params } = req.body as {
      command?: string;
      params?: Record<string, unknown>;
    };
    if (!command || !VALID_COMMANDS.includes(command as KioskCommandName)) {
      res.status(400).json({
        success: false,
        error: `command must be one of: ${VALID_COMMANDS.join(', ')}`,
      });
      return;
    }
    const name = command as KioskCommandName;
    const id = await enqueueCommand(kioskId, name, params, 'admin');

    // Reflect flag intent on the roster row right away so the console updates
    // without waiting for the kiosk's next heartbeat.
    const effect = FLAG_EFFECT[name];
    if (effect) await setKioskFlags(kioskId, effect);

    await insertLog('info', 'fleet', `Command "${name}" queued for ${kioskId}`, { commandId: id });
    res.json({ success: true, commandId: id });
  } catch (err) {
    logger.error('Fleet: queue command failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Incidents ──────────────────────────────────────────────────────────────

router.get('/incidents', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status === 'resolved' ? 'resolved' : req.query.status === 'open' ? 'open' : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const incidents = await getIncidents({ status, limit, range: parseRange(req) });
    res.json({ success: true, incidents, count: incidents.length });
  } catch (err) {
    logger.error('Fleet: list incidents failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/incidents/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await resolveIncident(req.params.id);
    if (!ok) {
      res.status(404).json({ success: false, error: 'Incident not found or already resolved' });
      return;
    }
    await insertLog('info', 'fleet', `Incident ${req.params.id} resolved by admin`, {});
    res.json({ success: true });
  } catch (err) {
    logger.error('Fleet: resolve incident failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Storage retention policy ───────────────────────────────────────────────

router.get('/storage-settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, settings: await getStorageSettings() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.put('/storage-settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { delete_after_print, retention_hours } = req.body as {
      delete_after_print?: boolean;
      retention_hours?: number;
    };
    if (retention_hours !== undefined && (typeof retention_hours !== 'number' || retention_hours < 1)) {
      res.status(400).json({ success: false, error: 'retention_hours must be a positive number' });
      return;
    }
    const settings = await updateStorageSettings({ delete_after_print, retention_hours });
    await insertLog('info', 'storage', 'Retention policy updated by admin', { ...settings });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Kiosk pricing ─────────────────────────────────────────────────────────

router.get('/pricing-settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, settings: await getPricingSettings() });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.put('/pricing-settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await updatePricingSettings((req.body ?? {}) as PricingInput);
    await insertLog('info', 'pricing', 'Kiosk pricing updated by admin', {
      print: settings.print,
      photocopy: settings.photocopy,
    });
    res.json({ success: true, settings });
  } catch (err) {
    logger.error('Fleet: update pricing failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/storage-documents', async (req: Request, res: Response): Promise<void> => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const limit = Math.min(parseInt(String(req.query.limit ?? '500'), 10) || 500, 2000);
    const documents = await getStorageDocMetas({ includeDeleted, limit });
    res.json({ success: true, documents, count: documents.length });
  } catch (err) {
    logger.error('Fleet: storage-documents failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * The file bytes live on the kiosks. So:
 *  - if THIS instance is itself a kiosk, run the op on its own files;
 *  - queue the same op for every known kiosk so they clear their bytes;
 *  - for a full "delete + records" wipe, also tombstone the metadata right here
 *    (on the box the console reads from) so the list clears immediately, without
 *    waiting on the kiosk's delete + its storage-doc-delete sync landing.
 *
 * deleteAllDocuments / purgeExpiredDocuments are idempotent, so a kiosk that
 * both ran locally and receives the queued command is harmless.
 */
type StorageOp = 'PURGE_STORAGE' | 'DELETE_ALL_FILES' | 'DELETE_ALL_FILES_KEEP_META';

const runStorageOp = async (op: StorageOp, res: Response): Promise<void> => {
  try {
    let localDeleted = 0;
    let queued = 0;
    let tombstoned = 0;

    if (config.isKioskRole) {
      if (op === 'PURGE_STORAGE') {
        const { retention_hours } = await getStorageSettings();
        localDeleted = (await purgeExpiredDocuments(retention_hours)).deleted;
      } else {
        localDeleted = (await deleteAllDocuments({ keepMeta: op === 'DELETE_ALL_FILES_KEEP_META' }))
          .deleted;
      }
    }

    // "Delete files + records" → clear the metadata the admin sees, now.
    if (op === 'DELETE_ALL_FILES') {
      tombstoned = await tombstoneAllStorageDocMetas();
    }

    for (const k of await getKiosks()) {
      // Only skip self on a dedicated kiosk box, where the local run already
      // covered this kiosk. A "both" instance may not actually own the files
      // (e.g. a mis-set cloud), so it must still queue the command.
      if (config.instanceRole === 'kiosk' && k.kiosk_id === config.kioskId) continue;
      await enqueueCommand(k.kiosk_id, op, undefined, 'admin');
      queued += 1;
    }

    await insertLog(
      'info',
      'storage',
      `Admin ${op}: ${localDeleted} files here, ${tombstoned} records cleared, ${queued} queued`,
      {},
    );
    res.json({ success: true, deleted: localDeleted, tombstoned, queued });
  } catch (err) {
    logger.error(`Fleet: ${op} failed`, { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
};

router.post('/storage/purge', (_req: Request, res: Response) => runStorageOp('PURGE_STORAGE', res));
// "Delete files + records" — wipes bytes on every kiosk and tombstones the
// metadata so the documents also leave the admin Storage list.
router.post('/storage/delete-all', (_req: Request, res: Response) =>
  runStorageOp('DELETE_ALL_FILES', res),
);
// "Delete files, keep records" — frees kiosk disk but leaves the metadata rows,
// so the admin still lists the documents.
router.post('/storage/delete-all-keep-meta', (_req: Request, res: Response) =>
  runStorageOp('DELETE_ALL_FILES_KEEP_META', res),
);

// ─── Analytics & nav summary ────────────────────────────────────────────────

router.get('/analytics', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, analytics: await getAnalytics(parseRange(req)) });
  } catch (err) {
    logger.error('Fleet: analytics failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [kiosks, openIncidents, pendingPinRequests, pendingAssistance] = await Promise.all([
      getKiosks(),
      getOpenIncidentCount(),
      listPendingPinResetRequests(),
      listAssistanceRequests({ status: 'PENDING', limit: 500 }),
    ]);
    const online = kiosks.filter((k) => isOnline(k.last_seen)).length;
    res.json({
      success: true,
      summary: {
        openIncidents,
        kiosks: { total: kiosks.length, online, offline: kiosks.length - online },
        pendingStaffPinRequests: pendingPinRequests.length,
        pendingAssistanceRequests: pendingAssistance.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Staff Print Recovery — admin visibility ─────────────────────────────────

router.get('/recovery-actions', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const [actions, counts] = await Promise.all([listRecoveryActions(limit), getRecoveryActionCounts()]);
    res.json({ success: true, actions, counts, count: actions.length });
  } catch (err) {
    logger.error('Fleet: recovery-actions list failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/recovery-actions/:transactionId/reauthorize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.params;
    const { actor } = req.body as { actor?: string };
    const ok = await reauthorizeRecovery(transactionId);
    if (!ok) {
      res.status(404).json({ success: false, error: 'No locked recovery action found for this transaction' });
      return;
    }
    await insertLog('warn', 'print-recovery', `${actor ?? 'Admin'} reauthorized recovery for transaction ${transactionId}`, {
      actor: actor ?? 'admin',
      transactionId,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('Fleet: reauthorize recovery failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Refunds (PayMongo) ───────────────────────────────────────────────────────
// Admin-only: the console proxy blocks role STAFF from every non-GET fleet
// route. The acting admin comes from the X-Console-User header the proxy sets
// from the signed-in session.

const consoleUser = (req: Request): string | null => {
  const header = req.header('x-console-user');
  return header && header.trim() ? header.trim() : null;
};

router.post('/transactions/:transactionId/refunds', async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = consoleUser(req);
    if (!actor) {
      res.status(401).json({ success: false, error: 'Refunds must be issued from a signed-in admin session.' });
      return;
    }
    const { amount, reason, notes } = req.body as { amount?: number; reason?: string; notes?: string };
    const refund = await issueRefund({
      transactionId: req.params.transactionId,
      amount: amount == null ? undefined : Number(amount),
      reason: reason ?? 'requested_by_customer',
      notes,
      actor,
    });
    if (refund.status === 'failed') {
      res.status(502).json({ success: false, error: refund.error ?? 'PayMongo rejected the refund.', refund });
      return;
    }
    res.json({ success: true, refund });
  } catch (err) {
    if (err instanceof RefundError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    logger.error('Fleet: refund failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/refunds/:refundId/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const refund = await refreshRefund(req.params.refundId);
    res.json({ success: true, refund });
  } catch (err) {
    if (err instanceof RefundError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    logger.error('Fleet: refund refresh failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
