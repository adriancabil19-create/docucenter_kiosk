import { Router } from 'express';
import { PaperTrackerService } from '../services/paperTracker.service';
import { updatePaperTrayThreshold, insertLog } from '../database';
import { logger } from '../utils/logger';

const router = Router();

router.get('/paper-trays', async (_req, res) => {
  try {
    const trays = await PaperTrackerService.getTrays();
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

    if (currentCount !== undefined) {
      if (typeof currentCount !== 'number' || currentCount < 0) {
        return res.status(400).json({ success: false, error: 'Invalid currentCount' });
      }
      const ok = await PaperTrackerService.setCurrentCount(trayName, currentCount);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to set tray count' });
      await insertLog('info', 'paper', `Tray "${trayName}" count set to ${currentCount}`, { trayName, currentCount });
    }

    if (sheetsAdded !== undefined) {
      if (typeof sheetsAdded !== 'number' || sheetsAdded <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid sheetsAdded' });
      }
      const ok = await PaperTrackerService.refillTray(trayName, sheetsAdded);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to refill tray' });
      await insertLog('info', 'paper', `Tray "${trayName}" refilled with ${sheetsAdded} sheets`, { trayName, sheetsAdded });
    }

    if (maxCapacity !== undefined) {
      if (typeof maxCapacity !== 'number' || maxCapacity < 0) {
        return res.status(400).json({ success: false, error: 'Invalid maxCapacity' });
      }
      const ok = await PaperTrackerService.setTrayCapacity(trayName, maxCapacity);
      if (!ok) return res.status(500).json({ success: false, error: 'Failed to update tray capacity' });
      await insertLog('info', 'paper', `Tray "${trayName}" capacity set to ${maxCapacity}`, { trayName, maxCapacity });
    }

    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0) {
        return res.status(400).json({ success: false, error: 'Invalid threshold' });
      }
      await updatePaperTrayThreshold(trayName, threshold);
      await insertLog('info', 'paper', `Tray "${trayName}" threshold updated`, { trayName, threshold });
    }

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
