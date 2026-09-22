import { Router, Request } from 'express';
import { PaperTrackerService } from '../services/paperTracker.service';
import { updatePaperTrayThreshold, getPaperTrays, enqueueCommand } from '../database';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const router = Router();

// This router is mounted for both the kiosk's own local calls (reading/
// writing its own trays) and the admin dashboard (potentially any kiosk in
// the fleet). A kiosk-role caller never sends this — it's always acting on
// itself — so it falls through to config.kioskId, its own identity. An
// admin caller can target a specific kiosk with ?kioskId=; while the fleet
// is a single kiosk, omitting it also falls back to config.kioskId (this
// backend's own configured identity), which keeps today's one-kiosk admin
// UI working unchanged.
const resolveKioskId = (req: Request): string => {
  const q = req.query.kioskId;
  return typeof q === 'string' && q ? q : config.kioskId;
};

// Admin edits on the cloud instance only take effect locally until the kiosk
// applies them. Rather than have the kiosk poll this table down every 2s
// (which used to race the kiosk's own concurrent decrements — see
// applyPaperTrayFromCloud), push the new state down once via the existing
// one-shot command channel. A local kiosk/'both' edit already lands in the
// table it's about to be read from, so no push is needed there.
const pushTrayToKiosk = async (kioskId: string, trayName: string): Promise<void> => {
  if (!config.isCloudRole) return;
  const tray = (await getPaperTrays(kioskId)).find((t) => t.tray_name === trayName);
  if (!tray) return;
  await enqueueCommand(kioskId, 'PAPER_TRAY_REFILLED', { ...tray });
};

// The frontend calls this only on its specific event triggers now (service
// opened, job completed, admin refresh) — never on a timer — so `reason`
// should always be one of those; log it verbatim to make that verifiable in
// the backend logs rather than trusting the client-side change alone.
router.get('/paper-trays', async (req, res) => {
  const reason = typeof req.query.reason === 'string' && req.query.reason ? req.query.reason : 'unspecified';
  const kioskId = resolveKioskId(req);
  logger.info(`[TRAY] Poll requested: ${reason}`, { kioskId });
  try {
    const trays = await PaperTrackerService.getTrays(kioskId);
    logger.info('[TRAY] Poll completed');
    logger.info('[TRAY] Status updated');
    res.json({ success: true, data: trays });
  } catch (error) {
    logger.error('Failed to get paper trays', { kioskId, error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper trays' });
  }
});

router.put('/paper-trays/:trayName', async (req, res) => {
  try {
    const { trayName } = req.params;
    const kioskId = resolveKioskId(req);
    const { maxCapacity, threshold, sheetsAdded, currentCount } = req.body as {
      maxCapacity?: number;
      threshold?: number;
      sheetsAdded?: number;
      currentCount?: number;
    };

    // NOTE: routine tray edits (count / capacity / threshold / refill) are no
    // longer written to activity_logs — they were dominating the table. Paper
    // usage is logged once per print job instead (see routes/print.ts).

    if (currentCount !== undefined) {
      if (typeof currentCount !== 'number' || currentCount < 0) {
        return res.status(400).json({ success: false, error: 'Invalid currentCount' });
      }
      const ok = await PaperTrackerService.setCurrentCount(kioskId, trayName, currentCount);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to set tray count' });
    }

    if (sheetsAdded !== undefined) {
      if (typeof sheetsAdded !== 'number' || sheetsAdded <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid sheetsAdded' });
      }
      const ok = await PaperTrackerService.refillTray(kioskId, trayName, sheetsAdded);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to refill tray' });
    }

    if (maxCapacity !== undefined) {
      if (typeof maxCapacity !== 'number' || maxCapacity < 0) {
        return res.status(400).json({ success: false, error: 'Invalid maxCapacity' });
      }
      const ok = await PaperTrackerService.setTrayCapacity(kioskId, trayName, maxCapacity);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to update tray capacity' });
    }

    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0) {
        return res.status(400).json({ success: false, error: 'Invalid threshold' });
      }
      await updatePaperTrayThreshold(kioskId, trayName, threshold);
    }

    await pushTrayToKiosk(kioskId, trayName);

    return res.json({ success: true, message: `Tray "${trayName}" updated` });
  } catch (error) {
    logger.error('Failed to update paper tray', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to update paper tray' });
  }
});

router.get('/paper-trays/alerts', async (req, res) => {
  const kioskId = resolveKioskId(req);
  try {
    const alerts = await PaperTrackerService.getLowPaperAlerts(kioskId);
    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Failed to get paper alerts', { kioskId, error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper alerts' });
  }
});

router.post('/paper-trays/:trayName/use', async (req, res) => {
  try {
    const { trayName } = req.params;
    const kioskId = resolveKioskId(req);
    const { sheets } = req.body as { sheets: number };

    if (typeof sheets !== 'number' || sheets <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid sheets count' });
    }

    await PaperTrackerService.usePaper(kioskId, trayName, sheets);
    return res.json({ success: true, message: `Used ${sheets} sheets from ${trayName}` });
  } catch (error) {
    logger.error('Failed to use paper', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to update paper count' });
  }
});

export default router;
