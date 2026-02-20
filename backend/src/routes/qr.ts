import { Router } from 'express';
import qrController from '../controllers/qr';

const router = Router();

/**
 * POST /api/qr/verify
 * Body: { qr: string }
 * Verifies a QR payload via Aiven/Postgres (or dev mock)
 */
router.post('/verify', (req: any, res: any) => qrController.verify(req, res));

/**
 * GET /api/qr/health
 */
router.get('/health', (_req: any, res: any) => res.json({ success: true, service: 'qr', timestamp: new Date().toISOString() }));

export default router;
