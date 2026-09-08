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
  getRecentCommands,
  enqueueCommand,
  setKioskFlags,
  getIncidents,
  resolveIncident,
  getOpenIncidentCount,
  getStorageSettings,
  updateStorageSettings,
  getStorageDocMetas,
  getAnalytics,
  insertLog,
  type KioskCommandName,
} from '../database';
import { deleteAllDocuments, purgeExpiredDocuments } from '../services/storage.service';

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
 * The files live on the kiosks, not on this (possibly cloud) instance. So run
 * the op locally only when THIS instance is a kiosk, and dispatch a command to
 * every other known kiosk to do the same.
 */
const runStorageOp = async (
  op: 'PURGE_STORAGE' | 'DELETE_ALL_FILES',
  res: Response,
): Promise<void> => {
  try {
    let localDeleted = 0;
    let queued = 0;

    if (config.isKioskRole) {
      if (op === 'PURGE_STORAGE') {
        const { retention_hours } = await getStorageSettings();
        localDeleted = (await purgeExpiredDocuments(retention_hours)).deleted;
      } else {
        localDeleted = (await deleteAllDocuments()).deleted;
      }
    }

    for (const k of await getKiosks()) {
      if (config.isKioskRole && k.kiosk_id === config.kioskId) continue;
      await enqueueCommand(k.kiosk_id, op, undefined, 'admin');
      queued += 1;
    }

    await insertLog('info', 'storage', `Admin ${op}: ${localDeleted} local, ${queued} queued`, {});
    res.json({ success: true, deleted: localDeleted, queued });
  } catch (err) {
    logger.error(`Fleet: ${op} failed`, { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
};

router.post('/storage/purge', (_req: Request, res: Response) => runStorageOp('PURGE_STORAGE', res));
router.post('/storage/delete-all', (_req: Request, res: Response) =>
  runStorageOp('DELETE_ALL_FILES', res),
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
    const [kiosks, openIncidents] = await Promise.all([getKiosks(), getOpenIncidentCount()]);
    const online = kiosks.filter((k) => isOnline(k.last_seen)).length;
    res.json({
      success: true,
      summary: {
        openIncidents,
        kiosks: { total: kiosks.length, online, offline: kiosks.length - online },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
