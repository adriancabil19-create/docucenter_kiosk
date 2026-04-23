import axios, { AxiosInstance } from 'axios';
import { PaymentTransaction, PayMongoPaymentRequest, PayMongoWebhookPayload, PaymentStatus } from '../types';
import { config } from '../utils/config';
import {
  generateReferenceNumber,
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
   * Create a Payment Intent with QR Ph allowed
   */
  async createPaymentIntent(amount: number, description: string): Promise<any> {
    const payload = {
      data: {
        attributes: {
          amount: Math.round(amount * 100), // centavos
          payment_method_allowed: ['qrph'],
          payment_method_options: {
            qrph: {
              label: 'DocuCenter Kiosk Payment',
            },
          },
          currency: 'PHP',
          description,
        },
      },
    };

    const response = await this.axiosInstance.post('/payment_intents', payload);
    return response.data.data;
  }

  /**
   * Create a QR Ph Payment Method
   */
  async createQRPhPaymentMethod(billing: any): Promise<any> {
    const payload = {
      data: {
        attributes: {
          type: 'qrph',
          billing,
        },
      },
    };

    const response = await this.axiosInstance.post('/payment_methods', payload);
    return response.data.data;
  }

  /**
   * Attach Payment Method to Payment Intent
   */
  async attachPaymentMethod(intentId: string, paymentMethodId: string): Promise<any> {
    const payload = {
      data: {
        attributes: {
          payment_method: paymentMethodId,
        },
      },
    };

    const response = await this.axiosInstance.post(`/payment_intents/${intentId}/attach`, payload);
    return response.data.data;
  }

  /**
   * Create a new payment transaction using Payment Intent workflow
   */
  async createPayment(paymentRequest: PayMongoPaymentRequest): Promise<PaymentTransaction> {
    try {
      const description =
        paymentRequest.description ??
        `Payment for ${paymentRequest.serviceType ?? 'document service'}`;

      // 1. Create Payment Intent
      const intent = await this.createPaymentIntent(paymentRequest.amount, description);
      const intentId = intent.id;

      // 2. Create QR Ph Payment Method
      const billing = {
        name: 'DocuCenter Kiosk User',
        email: 'payment@docucenter.com',
      };
      const paymentMethod = await this.createQRPhPaymentMethod(billing);
      const paymentMethodId = paymentMethod.id;

      // 3. Attach Payment Method
      const attachedIntent = await this.attachPaymentMethod(intentId, paymentMethodId);

      // 4. Get QR from next_action
      const nextAction = attachedIntent.attributes.next_action;
      if (!nextAction || nextAction.type !== 'consume_qr') {
        throw new Error('PayMongo did not provide QR code in next_action');
      }

      const qrCode = nextAction.code.image_url;
      if (!qrCode) {
        throw new Error('PayMongo returned incomplete QR code');
      }

      const transaction: PaymentTransaction = {
        transactionId: intentId, // Use intent ID as transaction ID
        referenceNumber: generateReferenceNumber(),
        amount: paymentRequest.amount,
        currency: paymentRequest.currency || 'PHP',
        status: 'PENDING',
        qrCode,
        merchantId: config.PAYMONGO.merchantId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        serviceType: paymentRequest.serviceType,
        documentCount: paymentRequest.documentCount,
      };

      this.transactions.set(transaction.transactionId, transaction);

      logger.info('Payment created with QR Ph', {
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
   * Check payment status by retrieving from PayMongo
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentTransaction | null> {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      return null;
    }

    try {
      // Retrieve the payment intent from PayMongo
      const response = await this.axiosInstance.get(`/payment_intents/${transactionId}`);
      const intent = response.data.data;
      const status = intent.attributes.status;

      // Map PayMongo status to our status
      let mappedStatus: PaymentStatus = 'PENDING';
      if (status === 'succeeded') {
        mappedStatus = 'SUCCESS';
      } else if (status === 'cancelled' || status === 'failed') {
        mappedStatus = 'FAILED';
      } else if (status === 'expired') {
        mappedStatus = 'EXPIRED';
      }

      // Update the cached transaction
      transaction.status = mappedStatus;
      if (status === 'succeeded') {
        transaction.completedAt = new Date();
      }

      this.transactions.set(transactionId, transaction);

      logger.debug('Updated payment status from PayMongo', { transactionId, status: mappedStatus });
      return transaction;
    } catch (error) {
      logger.error('Error checking payment status', { transactionId, error: String(error) });
      // Return cached status if API fails
      return transaction;
    }
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
