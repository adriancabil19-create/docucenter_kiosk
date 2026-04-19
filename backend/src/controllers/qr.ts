import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { aivenService } from '../services/aiven';

export const qrController = {
  async verify(req: Request, res: Response) {
    try {
      const { qr } = req.body as { qr?: string };
      if (!qr) {
        return res.status(400).json({ success: false, message: 'Missing qr in request body' });
      }

      const result = await aivenService.verifyQr(qr);
      if (!result.ok) {
        return res
          .status(404)
          .json({ success: false, verified: false, reason: result.reason || 'unknown' });
      }

      return res.json({ success: true, verified: result.verified });
    } catch (err: any) {
      logger.error('QR verify error', { error: err.message });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },
};

export default qrController;
