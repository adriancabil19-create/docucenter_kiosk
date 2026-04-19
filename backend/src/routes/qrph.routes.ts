import { Router } from 'express';
import { paymongoService } from '../services/paymongo.service';

const router = Router();

/**
 * POST /api/payment/qrph/create
 * Accepts an optional description and returns the generated PayMongo QR PH image.
 */
router.post('/api/payment/qrph/create', async (req: any, res: any) => {
  try {
    const { description } = req.body;

    const finalDescription =
      typeof description === 'string' && description.length > 0
        ? description
        : 'PAYMONGO QR Ph Payment';

    const result = await paymongoService.createQRPhSource(0, finalDescription);

    return res.status(200).json({
      sourceId: result.sourceId,
      qrCode: result.qrCodeUrl,
      amount: result.amount,
    });
  } catch (error: any) {
    console.error('Error creating QR Ph source:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Failed to create QR Ph source', message: error.message });
  }
});

/**
 * GET /api/payment/qrph/status/:sourceId
 * Return the current status of the PayMongo source.
 */
router.get('/api/payment/qrph/status/:sourceId', async (req: any, res: any) => {
  try {
    const { sourceId } = req.params;

    if (!sourceId || typeof sourceId !== 'string') {
      return res.status(400).json({ error: 'sourceId is required' });
    }

    const status = await paymongoService.getSourceStatus(sourceId);

    return res.status(200).json({ status });
  } catch (error: any) {
    console.error('Error getting source status:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Failed to get source status', message: error.message });
  }
});

/**
 * POST /webhook/paymongo
 * Validate PayMongo webhook signature and handle events.
 */
router.post('/webhook/paymongo', async (req: any, res: any) => {
  try {
    const signature = (req.headers['x-webhook-signature'] ||
      req.headers['X-Webhook-Signature']) as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('Missing PAYMONGO_WEBHOOK_SECRET');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const isValid = paymongoService.validateWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;
    const eventType = event.type;

    if (eventType === 'source.chargeable') {
      const sourceId = event.data?.id;
      const amount = event.data?.attributes?.amount;
      const description = event.data?.attributes?.description || 'QR Ph payment';

      if (typeof sourceId === 'string' && typeof amount === 'number') {
        await paymongoService.createCharge(sourceId, amount, description);
      } else {
        console.error('Invalid source.chargeable payload', { event });
      }
    } else if (eventType === 'payment.paid' || eventType === 'payment.succeeded') {
      console.log('Payment confirmed:', event.data?.id);
      // TODO: update your order / transaction status in the database here
    } else {
      console.log('Unhandled PayMongo event type:', eventType);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Webhook processing failed', message: error.message });
  }
});

export default router;
