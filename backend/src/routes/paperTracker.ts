import { Router } from 'express';
import { PaperTrackerService } from '../services/paperTracker.service';
import { updatePaperTrayThreshold, getPaperTrays, enqueueCommand } from '../database';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const router = Router();

// Admin edits on the cloud instance only take effect locally (this table has
// no per-kiosk scoping) until the kiosk applies them. Rather than have the
// kiosk poll this table down every 2s (which used to race the kiosk's own
// concurrent decrements — see applyPaperTrayFromCloud), push the new state
// down once via the existing one-shot command channel. A local kiosk/'both'
// edit already lands in the table it's about to be read from, so no push is
// needed there.
const pushTrayToKiosk = async (trayName: string): Promise<void> => {
  if (!config.isCloudRole) return;
  const tray = (await getPaperTrays()).find((t) => t.tray_name === trayName);
  if (!tray) return;
  await enqueueCommand(config.kioskId, 'PAPER_TRAY_REFILLED', { ...tray });
};

// The frontend calls this only on its specific event triggers now (service
// opened, job completed, admin refresh) — never on a timer — so `reason`
// should always be one of those; log it verbatim to make that verifiable in
// the backend logs rather than trusting the client-side change alone.
router.get('/paper-trays', async (req, res) => {
  const reason = typeof req.query.reason === 'string' && req.query.reason ? req.query.reason : 'unspecified';
  logger.info(`[TRAY] Poll requested: ${reason}`);
  try {
    const trays = await PaperTrackerService.getTrays();
    logger.info('[TRAY] Poll completed');
    logger.info('[TRAY] Status updated');
    res.json({ success: true, data: trays });
  } catch (error) {
    logger.error('Failed to get paper trays', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper trays' });
  }
});

router.put('/paper-trays/:trayName', async (req, res) => {
  try {
    const { trayName } = req.params;
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
      const ok = await PaperTrackerService.setCurrentCount(trayName, currentCount);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to set tray count' });
    }

    if (sheetsAdded !== undefined) {
      if (typeof sheetsAdded !== 'number' || sheetsAdded <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid sheetsAdded' });
      }
      const ok = await PaperTrackerService.refillTray(trayName, sheetsAdded);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to refill tray' });
    }

    if (maxCapacity !== undefined) {
      if (typeof maxCapacity !== 'number' || maxCapacity < 0) {
        return res.status(400).json({ success: false, error: 'Invalid maxCapacity' });
      }
      const ok = await PaperTrackerService.setTrayCapacity(trayName, maxCapacity);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to update tray capacity' });
    }

    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0) {
        return res.status(400).json({ success: false, error: 'Invalid threshold' });
      }
      await updatePaperTrayThreshold(trayName, threshold);
    }

    await pushTrayToKiosk(trayName);

    return res.json({ success: true, message: `Tray "${trayName}" updated` });
  } catch (error) {
    logger.error('Failed to update paper tray', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to update paper tray' });
  }
});

router.get('/paper-trays/alerts', async (_req, res) => {
  try {
    const alerts = await PaperTrackerService.getLowPaperAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Failed to get paper alerts', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper alerts' });
  }
});

router.post('/paper-trays/:trayName/use', async (req, res) => {
  try {
    const { trayName } = req.params;
    const { sheets } = req.body as { sheets: number };

    if (typeof sheets !== 'number' || sheets <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid sheets count' });
    }

    await PaperTrackerService.usePaper(trayName, sheets);
    return res.json({ success: true, message: `Used ${sheets} sheets from ${trayName}` });
  } catch (error) {
    logger.error('Failed to use paper', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to update paper count' });
  }
});

export default router;
