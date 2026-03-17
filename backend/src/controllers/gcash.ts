import { Request, Response } from 'express';
import { gcashService } from '../services/gcash';
import { printFilesFromStorage } from '../services/print.service';
import { GCashPaymentRequest, ApiResponse, GCashPaymentResponse } from '../types';
import { sanitizeError, isValidAmount } from '../utils/helpers';
import { verifyWebhookSignature } from '../utils/helpers';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

export class GCashController {
  /**
   * Create a new payment
   */
  async createPayment(req: Request, res: Response): Promise<void> {
    try {
      const { amount, serviceType, documentCount, description, metadata } = req.body;

      // Validate amount
      if (!amount || !isValidAmount(amount)) {
        res.status(400).json({
          success: false,
          error: 'Invalid amount',
          message: 'Amount must be between 1 and 100,000',
        } as ApiResponse<null>);
        return;
      }

      const paymentRequest: GCashPaymentRequest = {
        amount,
        currency: 'PHP',
        serviceType,
        documentCount,
        description,
        metadata,
      };

      const transaction = await gcashService.createPayment(paymentRequest);

      logger.info('Payment creation endpoint called', {
        transactionId: transaction.transactionId,
        amount,
      });

      const response: GCashPaymentResponse = {
        success: true,
        data: {
          transactionId: transaction.transactionId,
          referenceNumber: transaction.referenceNumber,
          qrCode: transaction.qrCode,
          expiresIn: config.payment.timeoutSeconds,
          amount: transaction.amount,
        },
        message: 'Payment created successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in createPayment', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to create payment',
        message: sanitizeError(error),
      } as ApiResponse<null>);
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;

      if (!transactionId) {
        res.status(400).json({
          success: false,
          error: 'Missing transactionId',
          message: 'transactionId is required',
        } as ApiResponse<null>);
        return;
      }

      const transaction = await gcashService.checkPaymentStatus(transactionId);

      if (!transaction) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found',
          message: `No transaction found with ID: ${transactionId}`,
        } as ApiResponse<null>);
        return;
      }

      logger.info('Payment status checked', {
        transactionId,
        status: transaction.status,
      });

      res.status(200).json({
        success: true,
        data: {
          status: transaction.status,
          transactionId: transaction.transactionId,
          referenceNumber: transaction.referenceNumber,
          amount: transaction.amount,
          completedAt: transaction.completedAt,
        },
        message: 'Payment status retrieved successfully',
      } as ApiResponse<any>);
    } catch (error) {
      logger.error('Error in checkPaymentStatus', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to check payment status',
        message: sanitizeError(error),
      } as ApiResponse<null>);
    }
  }

  /**
   * Cancel a payment
   */
  async cancelPayment(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;

      if (!transactionId) {
        res.status(400).json({
          success: false,
          error: 'Missing transactionId',
          message: 'transactionId is required',
        } as ApiResponse<null>);
        return;
      }

      const success = await gcashService.cancelPayment(transactionId, reason);

      if (!success) {
        res.status(400).json({
          success: false,
          error: 'Cannot cancel payment',
          message: 'Payment cannot be cancelled in its current state',
        } as ApiResponse<null>);
        return;
      }

      logger.info('Payment cancelled', { transactionId, reason });

      res.status(200).json({
        success: true,
        data: { transactionId },
        message: 'Payment cancelled successfully',
      } as ApiResponse<any>);
    } catch (error) {
      logger.error('Error in cancelPayment', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to cancel payment',
        message: sanitizeError(error),
      } as ApiResponse<null>);
    }
  }

  /**
   * Handle GCash webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-webhook-signature'] as string;

      if (!signature) {
        logger.warn('Webhook received without signature');
        res.status(401).json({
          success: false,
          error: 'Missing signature',
          message: 'Webhook signature is required',
        } as ApiResponse<null>);
        return;
      }

      // Verify webhook signature
      const payloadString = JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(payloadString, signature, config.gcash.webhookSecret);

      if (!isValid) {
        logger.warn('Webhook signature verification failed');
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
          message: 'Webhook signature verification failed',
        } as ApiResponse<null>);
        return;
      }

      const payload = req.body;

      // Process webhook
      const processed = await gcashService.processWebhook(payload);

      if (!processed) {
        res.status(404).json({
          success: false,
          error: 'Transaction not found',
          message: 'Could not find transaction for webhook',
        } as ApiResponse<null>);
        return;
      }

      logger.info('Webhook processed successfully', {
        transactionId: payload.transactionId,
        status: payload.status,
      });

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
      } as ApiResponse<null>);
    } catch (error) {
      logger.error('Error in handleWebhook', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook',
        message: sanitizeError(error),
      } as ApiResponse<null>);
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(_req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    const uptime = process.uptime();

    try {
      // In production, you would check GCash API connectivity here
      // const gcashConnected = await this.checkGCashApiHealth();

      logger.debug('Health check performed');

      res.status(200).json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(uptime),
          gcashApi: 'connected', // Simulated in demo mode
          responseTime: `${Date.now() - startTime}ms`,
        },
        message: 'Server is healthy',
      } as ApiResponse<any>);
    } catch (error) {
      logger.error('Health check failed', { error: String(error) });
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(uptime),
        },
        message: 'Service unavailable',
      } as ApiResponse<any>);
    }
  }

  /**
   * Simulate payment success (for testing)
   */
  async simulatePaymentSuccess(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;

      if (!transactionId) {
        res.status(400).json({
          success: false,
          error: 'Missing transactionId',
          message: 'transactionId is required',
        } as ApiResponse<null>);
        return;
      }

      if (!config.isDevelopment) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'This endpoint is only available in development mode',
        } as ApiResponse<null>);
        return;
      }

      gcashService.simulatePaymentSuccess(transactionId);

      logger.info('Payment simulation - success', { transactionId });

      // If filenames were provided in the body, attempt to print them from storage
      const { filenames } = req.body as { filenames?: string[] };
      let printResult: any = null;
      if (Array.isArray(filenames) && filenames.length > 0) {
        try {
          printResult = await printFilesFromStorage(filenames);
          logger.info('Triggered print from storage for simulated success', { transactionId, filenames, printResult });
        } catch (printErr) {
          logger.error('Error printing files during simulated success', { transactionId, error: String(printErr) });
        }
      }

      const responseBody: any = {
        success: true,
        data: { transactionId },
        message: 'Payment simulated as successful',
      };

      if (printResult && printResult.simulatedPaths) {
        responseBody.simulatedPaths = printResult.simulatedPaths;
      }

      res.status(200).json(responseBody as ApiResponse<any>);
    } catch (error) {
      logger.error('Error in simulatePaymentSuccess', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Simulation failed',
        message: sanitizeError(error),
      } as ApiResponse<null>);
    }
  }

  /**
   * Simulate payment failure (for testing)
   */
  async simulatePaymentFailure(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;

      if (!transactionId) {
        res.status(400).json({
          success: false,
          error: 'Missing transactionId',
          message: 'transactionId is required',
        } as ApiResponse<null>);
        return;
      }

      if (!config.isDevelopment) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'This endpoint is only available in development mode',
        } as ApiResponse<null>);
        return;
      }

      gcashService.simulatePaymentFailure(transactionId, reason || 'Test failure');

      logger.info('Payment simulation - failure', { transactionId, reason });

      res.status(200).json({
        success: true,
        data: { transactionId },
        message: 'Payment simulated as failed',
      } as ApiResponse<any>);
    } catch (error) {
      logger.error('Error in simulatePaymentFailure', { error: String(error) });
      res.status(500).json({
        success: false,
        error: 'Simulation failed',
        message: sanitizeError(error),
      } as ApiResponse<null>);
    }
  }
}

export const gcashController = new GCashController();
