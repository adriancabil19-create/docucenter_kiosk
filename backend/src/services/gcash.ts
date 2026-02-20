import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { config } from '../utils/config';
import {
  PaymentTransaction,
  GCashPaymentRequest,
  GCashWebhookPayload,
} from '../types';
import {
  generateTransactionId,
  generateReferenceNumber,
  generateQRCodeContent,
  calculateExpirationTime,
} from '../utils/helpers';
import { logger } from '../utils/logger';

export class GCashService {
  private axiosInstance: AxiosInstance;
  private transactions: Map<string, PaymentTransaction> = new Map();

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: config.gcash.apiBaseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.gcash.apiKey}`,
        'X-Merchant-ID': config.gcash.merchantId,
      },
    });

    // Add request interceptor
    this.axiosInstance.interceptors.request.use((cfg: any) => {
      logger.debug('GCash API Request', { url: cfg.url, method: cfg.method });
      return cfg;
    });

    // Add response interceptor
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        logger.debug('GCash API Response', { status: response.status });
        return response;
      },
      (error: any) => {
        logger.error('GCash API Error', {
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new payment transaction
   */
  async createPayment(paymentRequest: GCashPaymentRequest): Promise<PaymentTransaction> {
    try {
      const transactionId = generateTransactionId();
      const referenceNumber = generateReferenceNumber();
      const qrCodeContent = generateQRCodeContent(transactionId, paymentRequest.amount);
      const expiresAt = calculateExpirationTime(config.payment.timeoutSeconds);

      // In demo mode, we simulate the GCash API response
      // In production, you would call the actual GCash API endpoint
      // const response = await this.axiosInstance.post('/payments', {
      //   amount: paymentRequest.amount,
      //   currency: paymentRequest.currency || 'PHP',
      //   referenceNumber,
      //   metadata: paymentRequest.metadata,
      // });

      const transaction: PaymentTransaction = {
        transactionId,
        referenceNumber,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency || 'PHP',
        status: 'PENDING',
        qrCode: qrCodeContent,
        merchantId: config.gcash.merchantId,
        createdAt: new Date(),
        expiresAt,
        serviceType: paymentRequest.serviceType,
        documentCount: paymentRequest.documentCount,
      };

      // Store transaction in memory
      this.transactions.set(transactionId, transaction);

      logger.info('Payment created', {
        transactionId,
        amount: paymentRequest.amount,
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to create payment', { error: String(error) });
      throw new Error('Failed to create payment');
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentTransaction | null> {
    try {
      // Check in-memory storage first
      const transaction = this.transactions.get(transactionId);

      if (!transaction) {
        logger.warn('Transaction not found', { transactionId });
        return null;
      }

      // Check if transaction has expired
      if (transaction.status === 'PENDING' && new Date() > transaction.expiresAt) {
        transaction.status = 'EXPIRED';
        logger.info('Transaction expired', { transactionId });
        return transaction;
      }

      // In production, you would query the GCash API here
      // const response = await this.axiosInstance.get(`/payments/${transactionId}`);
      // transaction.status = response.data.status;

      return transaction;
    } catch (error) {
      logger.error('Failed to check payment status', { transactionId, error: String(error) });
      throw new Error('Failed to check payment status');
    }
  }

  /**
   * Cancel a payment
   */
  async cancelPayment(transactionId: string, reason?: string): Promise<boolean> {
    try {
      const transaction = this.transactions.get(transactionId);

      if (!transaction) {
        logger.warn('Transaction not found for cancellation', { transactionId });
        return false;
      }

      if (transaction.status !== 'PENDING' && transaction.status !== 'PROCESSING') {
        logger.warn('Cannot cancel transaction', {
          transactionId,
          status: transaction.status,
        });
        return false;
      }

      transaction.status = 'CANCELLED';

      // In production, call GCash API to cancel
      // await this.axiosInstance.post(`/payments/${transactionId}/cancel`, { reason });

      logger.info('Payment cancelled', { transactionId, reason });
      return true;
    } catch (error) {
      logger.error('Failed to cancel payment', { transactionId, error: String(error) });
      throw new Error('Failed to cancel payment');
    }
  }

  /**
   * Process webhook from GCash
   */
  async processWebhook(payload: GCashWebhookPayload): Promise<boolean> {
    try {
      const transaction = this.transactions.get(payload.transactionId);

      if (!transaction) {
        logger.warn('Webhook received for unknown transaction', {
          transactionId: payload.transactionId,
        });
        return false;
      }

      // Update transaction status
      transaction.status = payload.status;

      if (payload.status === 'SUCCESS') {
        transaction.completedAt = new Date();
        logger.info('Payment successful', {
          transactionId: payload.transactionId,
          amount: payload.amount,
        });
      } else if (payload.status === 'FAILED') {
        logger.warn('Payment failed', { transactionId: payload.transactionId });
      }

      return true;
    } catch (error) {
      logger.error('Failed to process webhook', { error: String(error) });
      throw new Error('Failed to process webhook');
    }
  }

  /**
   * Get all transactions (for administrative purposes)
   */
  getAllTransactions(): PaymentTransaction[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): PaymentTransaction | undefined {
    return this.transactions.get(transactionId);
  }

  /**
   * Simulate payment success (for testing)
   */
  simulatePaymentSuccess(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.status = 'SUCCESS';
      transaction.completedAt = new Date();
      logger.info('Payment simulated as success', { transactionId });
    }
  }

  /**
   * Simulate payment failure (for testing)
   */
  simulatePaymentFailure(transactionId: string, reason: string = 'Insufficient funds'): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.status = 'FAILED';
      logger.info('Payment simulated as failure', { transactionId, reason });
    }
  }
}

// Export singleton instance
export const gcashService = new GCashService();
