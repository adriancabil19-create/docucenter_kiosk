import { Router } from 'express';
import { paymongoController } from '../controllers/paymongo';

const router = Router();

/**
 * POST /api/paymongo/create-payment
 * Create a new PayMongo payment transaction
 */
router.post('/create-payment', (req: any, res: any) => paymongoController.createPayment(req, res));

/**
 * GET /api/paymongo/check-payment/:transactionId
 * Check the status of a payment
 */
router.get('/check-payment/:transactionId', (req: any, res: any) =>
  paymongoController.checkPaymentStatus(req, res),
);

/**
 * POST /api/paymongo/cancel-payment/:transactionId
 * Cancel a pending payment
 */
router.post('/cancel-payment/:transactionId', (req: any, res: any) =>
  paymongoController.cancelPayment(req, res),
);

/**
 * POST /api/paymongo/webhook
 * Handle PayMongo webhook notifications
 */
router.post('/webhook', (req: any, res: any) => paymongoController.handleWebhook(req, res));

/**
 * GET /api/paymongo/health
 * Health check endpoint
 */
router.get('/health', (req: any, res: any) => paymongoController.healthCheck(req, res));

/**
 * Development and testing endpoints
 * Only available in development mode
 */

/**
 * POST /api/paymongo/simulate/success/:transactionId
 * Simulate a successful payment (development only)
 */
router.post('/simulate/success/:transactionId', (req: any, res: any) =>
  paymongoController.simulatePaymentSuccess(req, res),
);

/**
 * POST /api/paymongo/simulate/failure/:transactionId
 * Simulate a failed payment (development only)
 */
router.post('/simulate/failure/:transactionId', (req: any, res: any) =>
  paymongoController.simulatePaymentFailure(req, res),
);

export default router;
