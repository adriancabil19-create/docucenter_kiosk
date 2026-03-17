// GCash Payment Types

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentTransaction {
  transactionId: string;
  referenceNumber: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  qrCode: string;
  merchantId: string;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  serviceType?: string;
  documentCount?: number;
}

export interface GCashPaymentRequest {
  amount: number;
  currency?: string;
  serviceType?: string;
  documentCount?: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface GCashPaymentResponse {
  success: boolean;
  data: {
    transactionId: string;
    referenceNumber: string;
    qrCode: string;
    expiresIn: number;
    amount: number;
  };
  message: string;
}

export interface GCashStatusResponse {
  data: {
    status: PaymentStatus;
    transactionId: string;
    referenceNumber: string;
    amount: number;
    completedAt?: Date;
  };
  status: 'success' | 'error';
  message: string;
}

export interface GCashWebhookPayload {
  eventType: string;
  transactionId: string;
  referenceNumber: string;
  status: PaymentStatus;
  amount: number;
  timestamp: string;
  signature: string;
}

export interface WebhookVerificationRequest {
  payload: GCashWebhookPayload;
  signature: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message: string;
}

export interface CancelPaymentRequest {
  transactionId: string;
  reason?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  gcashApi: 'connected' | 'disconnected';
  message: string;
}
