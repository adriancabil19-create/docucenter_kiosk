/**
 * Kiosk-facing runtime API — consumed by the Flutter app on the same machine.
 * Mounted at /api/kiosk behind requireKioskApiToken (loopback is allowed).
 *
 *  GET  /self        → this kiosk's live runtime flags + retention policy
 *  POST /incidents    → report a structured device/error incident
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  getKioskById,
  ensureKiosk,
  getStorageSettings,
  getOpenIncidentCount,
  insertIncident,
} from '../database';
import { syncEvent } from '../services/sync.service';

const router = Router();

router.get('/self', async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureKiosk(config.kioskId, config.kioskLabel);
    const [kiosk, storage, openIncidents] = await Promise.all([
      getKioskById(config.kioskId),
      getStorageSettings(),
      getOpenIncidentCount(),
    ]);
    res.json({
      success: true,
      kiosk_id: config.kioskId,
      label: config.kioskLabel,
      maintenance: kiosk?.maintenance ?? false,
      printing_disabled: kiosk?.printing_disabled ?? false,
      printer_state: kiosk?.printer_state ?? 'UNKNOWN',
      scanner_state: kiosk?.scanner_state ?? 'UNKNOWN',
      storage,
      openIncidents,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Kiosk self endpoint failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/incidents', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      device?: string;
      error_code?: string;
      severity?: 'info' | 'warning' | 'critical';
      message?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.error_code || !body.message) {
      res.status(400).json({ success: false, error: 'error_code and message are required' });
      return;
    }
    const id = randomUUID();
    await insertIncident({
      id,
      kiosk_id: config.kioskId,
      device: body.device ?? 'kiosk',
      error_code: body.error_code,
      severity: body.severity ?? 'warning',
      message: body.message,
      metadata: body.metadata,
    });
    // Forward to the cloud through the durable outbox.
    syncEvent('incident', {
      id,
      kiosk_id: config.kioskId,
      device: body.device ?? 'kiosk',
      error_code: body.error_code,
      severity: body.severity ?? 'warning',
      message: body.message,
      metadata: body.metadata,
    });
    logger.info('Kiosk incident reported', { id, code: body.error_code });
    res.json({ success: true, id });
  } catch (err) {
    logger.error('Kiosk incident endpoint failed', { error: String(err) });
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
