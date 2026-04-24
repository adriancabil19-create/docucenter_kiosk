import { Router } from 'express';
import { PaperTrackerService } from '../services/paperTracker.service';
import { updatePaperTrayThreshold, insertLog } from '../database';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/paper-tracker/paper-trays
router.get('/paper-trays', (_req, res) => {
  try {
    const trays = PaperTrackerService.getTrays();
    res.json({ success: true, data: trays });
  } catch (error) {
    logger.error('Failed to get paper trays', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper trays' });
  }
});

// PUT /api/paper-tracker/paper-trays/:trayName
// Body: { sheetsAdded?: number, maxCapacity?: number, threshold?: number }
// sheetsAdded = incremental refill (adds to current_count, capped at max_capacity)
// maxCapacity = full reset (sets current_count = max_capacity = value)
router.put('/paper-trays/:trayName', (req, res) => {
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
      const ok = PaperTrackerService.setCurrentCount(trayName, currentCount);
      if (!ok) {
        return res.status(500).json({ success: false, error: 'Failed to set tray count' });
      }
      insertLog('info', 'paper', `Tray "${trayName}" count set to ${currentCount}`, { trayName, currentCount });
    }

    if (sheetsAdded !== undefined) {
      if (typeof sheetsAdded !== 'number' || sheetsAdded <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid sheetsAdded' });
      }
      const ok = PaperTrackerService.refillTray(trayName, sheetsAdded);
      if (!ok) {
        return res.status(500).json({ success: false, error: 'Failed to refill tray' });
      }
      insertLog('info', 'paper', `Tray "${trayName}" refilled with ${sheetsAdded} sheets`, { trayName, sheetsAdded });
    }

    if (maxCapacity !== undefined) {
      if (typeof maxCapacity !== 'number' || maxCapacity < 0) {
        return res.status(400).json({ success: false, error: 'Invalid maxCapacity' });
      }
      const ok = PaperTrackerService.setTrayCapacity(trayName, maxCapacity);
      if (!ok) {
        return res.status(500).json({ success: false, error: 'Failed to update tray capacity' });
      }
      insertLog('info', 'paper', `Tray "${trayName}" capacity set to ${maxCapacity}`, { trayName, maxCapacity });
    }

    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0) {
        return res.status(400).json({ success: false, error: 'Invalid threshold' });
      }
      updatePaperTrayThreshold(trayName, threshold);
      insertLog('info', 'paper', `Tray "${trayName}" threshold updated`, { trayName, threshold });
    }

    return res.json({ success: true, message: `Tray "${trayName}" updated` });
  } catch (error) {
    logger.error('Failed to update paper tray', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to update paper tray' });
  }
});

// GET /api/paper-tracker/paper-trays/alerts
router.get('/paper-trays/alerts', (_req, res) => {
  try {
    const alerts = PaperTrackerService.getLowPaperAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Failed to get paper alerts', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper alerts' });
  }
});

// POST /api/paper-tracker/paper-trays/:trayName/use
router.post('/paper-trays/:trayName/use', (req, res) => {
  try {
    const { trayName } = req.params;
    const { sheets } = req.body as { sheets: number };

    if (typeof sheets !== 'number' || sheets <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid sheets count' });
    }

    PaperTrackerService.usePaper(trayName, sheets);
    return res.json({ success: true, message: `Used ${sheets} sheets from ${trayName}` });
  } catch (error) {
    logger.error('Failed to use paper', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to update paper count' });
  }
});

export default router;
