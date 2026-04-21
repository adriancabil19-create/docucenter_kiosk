import { Router } from 'express';
import { PaperTrackerService } from '../services/paperTracker.service';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/paper-trays - Get all tray statuses
router.get('/paper-trays', (req, res) => {
  try {
    const trays = PaperTrackerService.getTrays();
    res.json({ success: true, data: trays });
  } catch (error) {
    logger.error('Failed to get paper trays', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper trays' });
  }
});

// PUT /api/paper-trays/:trayName - Set tray capacity (user inputs paper count)
router.put('/paper-trays/:trayName', (req, res) => {
  try {
    const { trayName } = req.params;
    const { maxCapacity } = req.body;

    if (typeof maxCapacity !== 'number' || maxCapacity < 0) {
      return res.status(400).json({ success: false, error: 'Invalid maxCapacity' });
    }

    const success = PaperTrackerService.setTrayCapacity(trayName, maxCapacity);
    if (success) {
      return res.json({ success: true, message: `Tray ${trayName} capacity set to ${maxCapacity}` });
    } else {
      return res.status(500).json({ success: false, error: 'Failed to update tray capacity' });
    }
  } catch (error) {
    logger.error('Failed to set tray capacity', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to set tray capacity' });
  }
});

// GET /api/paper-trays/alerts - Get low paper alerts for admin
router.get('/paper-trays/alerts', (req, res) => {
  try {
    const alerts = PaperTrackerService.getLowPaperAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    logger.error('Failed to get paper alerts', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to get paper alerts' });
  }
});

// POST /api/paper-trays/:trayName/use - Decrement paper count (for printing)
router.post('/paper-trays/:trayName/use', (req, res) => {
  try {
    const { trayName } = req.params;
    const { sheets } = req.body;

    if (typeof sheets !== 'number' || sheets <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid sheets count' });
    }

    const success = PaperTrackerService.usePaper(trayName, sheets);
    if (success) {
      return res.json({ success: true, message: `Used ${sheets} sheets from ${trayName}` });
    } else {
      return res.status(500).json({ success: false, error: 'Failed to update paper count' });
    }
  } catch (error) {
    logger.error('Failed to use paper', { error: String(error) });
    return res.status(500).json({ success: false, error: 'Failed to use paper' });
  }
});

export default router;