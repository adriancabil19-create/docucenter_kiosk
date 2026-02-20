import { Router } from 'express';
import { gcashController } from '../controllers/gcash';

const router = Router();

/**
 * POST /api/gcash/create-payment
 * Create a new GCash payment transaction
 */
router.post('/create-payment', (req: any, res: any) => gcashController.createPayment(req, res));

/**
 * GET /api/gcash/check-payment/:transactionId
 * Check the status of a payment
 */
router.get('/check-payment/:transactionId', (req: any, res: any) => gcashController.checkPaymentStatus(req, res));

/**
 * POST /api/gcash/cancel-payment/:transactionId
 * Cancel a pending payment
 */
router.post('/cancel-payment/:transactionId', (req: any, res: any) => gcashController.cancelPayment(req, res));

/**
 * POST /api/gcash/webhook
 * Handle GCash webhook notifications
 */
router.post('/webhook', (req: any, res: any) => gcashController.handleWebhook(req, res));

/**
 * GET /api/gcash/health
 * Health check endpoint
 */
router.get('/health', (req: any, res: any) => gcashController.healthCheck(req, res));

/**
 * Development and testing endpoints
 * Only available in development mode
 */

/**
 * POST /api/gcash/simulate/success/:transactionId
 * Simulate a successful payment (development only)
 */
router.post('/simulate/success/:transactionId', (req: any, res: any) =>
  gcashController.simulatePaymentSuccess(req, res)
);

/**
 * POST /api/gcash/simulate/failure/:transactionId
 * Simulate a failed payment (development only)
 */
router.post('/simulate/failure/:transactionId', (req: any, res: any) =>
  gcashController.simulatePaymentFailure(req, res)
);

export default router;
