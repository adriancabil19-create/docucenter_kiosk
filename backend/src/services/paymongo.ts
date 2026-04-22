import axios, { AxiosInstance } from 'axios';
import { PaymentTransaction, PayMongoPaymentRequest, PayMongoWebhookPayload } from '../types';
import { config } from '../utils/config';
import {
  generateTransactionId,
  generateReferenceNumber,
  calculateExpirationTime,
} from '../utils/helpers';
import { logger } from '../utils/logger';

export class PayMongoService {
  private transactions: Map<string, PaymentTransaction> = new Map();
  private axiosInstance: AxiosInstance;

  constructor() {
    const secretKeyEncoded = Buffer.from(`${config.PAYMONGO.secretKey}:`).toString('base64');

    logger.info('PayMongo Service Initialization', {
      secretKeyPresent: !!config.PAYMONGO.secretKey,
      secretKeyLength: config.PAYMONGO.secretKey?.length,
      apiBaseUrl: config.PAYMONGO.apiBaseUrl,
      authHeaderSample: `Basic ${secretKeyEncoded.substring(0, 20)}...`,
    });

    this.axiosInstance = axios.create({
      baseURL: config.PAYMONGO.apiBaseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${secretKeyEncoded}`,
      },
    });

    // Add request interceptor
    this.axiosInstance.interceptors.request.use((cfg) => {
      logger.debug('PAYMONGO API Request', { url: cfg.url, method: cfg.method });
      return cfg;
    });

    // Add response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('PAYMONGO API Response', { status: response.status });
        return response;
      },
      (error) => {
        logger.error('PAYMONGO API Error', {
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Create a new payment transaction
   */
  async createPayment(paymentRequest: PayMongoPaymentRequest): Promise<PaymentTransaction> {
    try {
      const description =
        paymentRequest.description ??
        `Payment for ${paymentRequest.serviceType ?? 'document service'}`;

      // Dynamic QR embeds the exact amount so the customer's GCash/Maya app
      // pre-fills the payment value — no manual entry needed.
      const payload = {
        data: {
          attributes: {
            kind: 'dynamic',
            amount: Math.round(paymentRequest.amount * 100), // centavos
            currency: paymentRequest.currency ?? 'PHP',
            description,
          },
        },
      };

      logger.info('Creating PayMongo QR PH code', {
        endpoint: `${config.PAYMONGO.apiBaseUrl}/qrph/generate`,
        amount: paymentRequest.amount,
        kind: payload.data.attributes.kind,
      });

      const response = await this.axiosInstance.post('/qrph/generate', payload);
      const code = response.data.data;
      const attributes = code.attributes;
      const qrCode = attributes.qr_image;

      if (!qrCode) {
        logger.error('Missing PayMongo QR PH image payload', {
          codeId: code?.id,
          attributes,
        });
        throw new Error('PayMongo returned incomplete QR PH payload');
      }

      const transaction: PaymentTransaction = {
        transactionId: generateTransactionId(),
        referenceNumber: generateReferenceNumber(),
        amount: paymentRequest.amount,
        currency: paymentRequest.currency || 'PHP',
        status: 'PENDING',
        qrCode,
        merchantId: config.PAYMONGO.merchantId,
        createdAt: new Date(),
        expiresAt: calculateExpirationTime(config.payment.timeoutSeconds),
        serviceType: paymentRequest.serviceType,
        documentCount: paymentRequest.documentCount,
      };

      this.transactions.set(transaction.transactionId, transaction);

      logger.info('Payment created', {
        transactionId: transaction.transactionId,
        amount: paymentRequest.amount,
        serviceType: paymentRequest.serviceType,
      });

      return transaction;
    } catch (error) {
      logger.error('Error creating payment', { error: String(error) });
      throw new Error('Failed to create payment');
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentTransaction | null> {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      return null;
    }

    logger.debug('Returning cached payment status', { transactionId, status: transaction.status });
    return transaction;
  }

  /**
   * Cancel a payment
   */
  async cancelPayment(transactionId: string, reason?: string): Promise<boolean> {
    try {
      const transaction = this.transactions.get(transactionId);

      if (!transaction) {
        return false;
      }

      if (transaction.status !== 'PENDING') {
        return false;
      }

      // In production, call PAYMONGO API to cancel
      transaction.status = 'CANCELLED';
      this.transactions.set(transactionId, transaction);

      logger.info('Payment cancelled', { transactionId, reason });

      return true;
    } catch (error) {
      logger.error('Error cancelling payment', { error: String(error) });
      throw new Error('Failed to cancel payment');
    }
  }

  /**
   * Process webhook from PAYMONGO
   */
  async processWebhook(payload: PayMongoWebhookPayload): Promise<boolean> {
    try {
      const { transactionId, status } = payload;

      const transaction = this.transactions.get(transactionId);

      if (!transaction) {
        logger.warn('Webhook received for unknown transaction', { transactionId });
        return false;
      }

      // Update transaction status
      transaction.status = status;
      if (status === 'SUCCESS') {
        transaction.completedAt = new Date();
      }

      this.transactions.set(transactionId, transaction);

      logger.info('Webhook processed', { transactionId, status });

      return true;
    } catch (error) {
      logger.error('Error processing webhook', { error: String(error) });
      throw new Error('Failed to process webhook');
    }
  }

  /**
   * Simulate payment success (for testing)
   */
  simulatePaymentSuccess(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.status = 'SUCCESS';
      transaction.completedAt = new Date();
      this.transactions.set(transactionId, transaction);
      logger.info('Simulated payment success', { transactionId });
    }
  }

  /**
   * Simulate payment failure (for testing)
   */
  simulatePaymentFailure(transactionId: string, reason: string): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.status = 'FAILED';
      this.transactions.set(transactionId, transaction);
      logger.info('Simulated payment failure', { transactionId, reason });
    }
  }
}

export const paymongoService = new PayMongoService();
