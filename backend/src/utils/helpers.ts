import crypto from 'crypto';
import { config } from './config';

/**
 * Generate HMAC-SHA256 signature for webhook verification
 */
export const generateSignature = (
  payload: string,
  secret: string = config.PAYMONGO.webhookSecret,
): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

/**
 * Verify webhook signature
 */
export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string = config.PAYMONGO.webhookSecret,
): boolean => {
  const expectedSignature = generateSignature(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  // timingSafeEqual requires equal-length buffers; differing lengths mean invalid signature
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Generate transaction ID
 */
export const generateTransactionId = (): string => {
  return `TXN-${Date.now()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
};

/**
 * Generate reference number
 */
export const generateReferenceNumber = (): string => {
  return `REF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

/**
 * Generate QR code content (mock implementation)
 */
export const generateQRCodeContent = (transactionId: string, amount: number): string => {
  return Buffer.from(
    JSON.stringify({
      transactionId,
      amount,
      timestamp: new Date().toISOString(),
    }),
  ).toString('base64');
};

/**
 * Calculate expiration timestamp
 */
export const calculateExpirationTime = (timeoutSeconds: number): Date => {
  return new Date(Date.now() + timeoutSeconds * 1000);
};

/**
 * Format error response
 */
export const formatError = (error: any): { message: string; details?: string } => {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack,
    };
  }
  return {
    message: String(error),
  };
};

/**
 * Sanitize error for client response
 */
export const sanitizeError = (error: any): string => {
  if (config.isDevelopment) {
    return error instanceof Error ? error.message : String(error);
  }
  // Don't expose internal errors in production
  return 'An error occurred processing your request';
};

/**
 * Validate phone number
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^(\+63|0)?9\d{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Validate amount
 */
export const isValidAmount = (
  amount: number,
  minAmount: number = 1,
  maxAmount: number = 100000,
): boolean => {
  return amount >= minAmount && amount <= maxAmount && Number.isFinite(amount);
};
