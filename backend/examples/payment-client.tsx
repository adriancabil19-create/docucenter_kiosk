/**
 * GCash Payment Client Example
 * 
 * This example demonstrates how to integrate the GCash Payment API
 * from your React frontend application.
 * 
 * Features:
 * - Create payment transactions
 * - Display QR codes
 * - Poll payment status
 * - Handle timeouts
 * - Error handling
 */

import { useEffect, useState } from 'react';

// Types (match backend types)
interface PaymentTransaction {
  transactionId: string;
  referenceNumber: string;
  qrCode: string;
  expiresIn: number;
}

type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

interface PaymentStatusData {
  status: PaymentStatus;
  transactionId: string;
  referenceNumber: string;
  amount: number;
  completedAt?: string;
}

// Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/gcash';
const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds
const PAYMENT_TIMEOUT_SECONDS = 300; // 5 minutes

/**
 * Hook: useGCashPayment
 * Manages payment creation, status checking, and cancellation
 */
export const useGCashPayment = () => {
  const [transaction, setTransaction] = useState<PaymentTransaction | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('PENDING');
  const [timeLeft, setTimeLeft] = useState<number>(PAYMENT_TIMEOUT_SECONDS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new payment transaction
   */
  const createPayment = async (amount: number, serviceType?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          serviceType,
          documentCount: 1,
        }),
      });

      if (!response.ok) {
        const { error: errorMsg } = await response.json();
        throw new Error(errorMsg || 'Failed to create payment');
      }

      const { data } = await response.json();
      setTransaction(data);
      setPaymentStatus('PENDING');
      setTimeLeft(data.expiresIn);
      setError(null);

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Check payment status
   */
  const checkPaymentStatus = async (transactionId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/check-payment/${transactionId}`
      );

      if (!response.ok) {
        throw new Error('Failed to check payment status');
      }

      const { data } = await response.json();
      setPaymentStatus(data.status);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    }
  };

  /**
   * Cancel payment
   */
  const cancelPayment = async (transactionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/cancel-payment/${transactionId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'User cancelled' }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to cancel payment');
      }

      setPaymentStatus('CANCELLED');
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Reset payment state
   */
  const resetPayment = () => {
    setTransaction(null);
    setPaymentStatus('PENDING');
    setTimeLeft(PAYMENT_TIMEOUT_SECONDS);
    setError(null);
  };

  return {
    transaction,
    paymentStatus,
    timeLeft,
    isLoading,
    error,
    createPayment,
    checkPaymentStatus,
    cancelPayment,
    resetPayment,
  };
};

/**
 * Component: PaymentInterface
 * Main payment UI component
 */
export const PaymentInterface = ({
  amount,
  onSuccess,
  onFailure,
}: {
  amount: number;
  onSuccess: (transactionId: string) => void;
  onFailure: (error: string) => void;
}) => {
  const {
    transaction,
    paymentStatus,
    timeLeft,
    isLoading,
    error,
    createPayment,
    checkPaymentStatus,
    cancelPayment,
    resetPayment,
  } = useGCashPayment();

  // Poll payment status
  useEffect(() => {
    if (!transaction) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await checkPaymentStatus(transaction.transactionId);

        if (status.status === 'SUCCESS') {
          clearInterval(pollInterval);
          onSuccess(transaction.transactionId);
        } else if (status.status === 'FAILED' || status.status === 'EXPIRED') {
          clearInterval(pollInterval);
          onFailure(
            status.status === 'EXPIRED'
              ? 'Payment expired. Please try again.'
              : 'Payment failed. Please try again.'
          );
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
      }
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [transaction]);

  // Countdown timer
  useEffect(() => {
    if (!transaction || paymentStatus !== 'PENDING') return;

    const timer = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [transaction, paymentStatus]);

  // Initialize payment on mount
  useEffect(() => {
    createPayment(amount);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!transaction) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        {isLoading && <p className="text-gray-600">Creating payment...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-8 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">GCash Payment</h2>
        <div className="text-4xl font-bold text-blue-600">₱{amount.toFixed(2)}</div>
      </div>

      {/* Status */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg text-center">
        <p className="text-sm text-gray-600 mb-2">Status: {paymentStatus}</p>
        <p className="text-2xl font-bold text-blue-600">{formatTime(timeLeft)}</p>
        <p className="text-xs text-gray-500 mt-2">Time remaining</p>
      </div>

      {/* QR Code */}
      {paymentStatus === 'PENDING' && (
        <div className="mb-6">
          <div className="bg-gray-100 p-4 rounded-lg text-center mb-4">
            <div className="bg-white p-4 rounded inline-block">
              {/* In real implementation, render QR code using qrcode.react library */}
              <div className="w-48 h-48 flex items-center justify-center bg-gray-200 rounded">
                <span className="text-gray-500">QR Code: {transaction.qrCode.substring(0, 20)}...</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg text-center mb-4">
            <p className="text-xs text-gray-600 mb-2">Reference: {transaction.referenceNumber}</p>
            <p className="text-sm font-mono bg-white p-2 rounded">
              {transaction.transactionId}
            </p>
          </div>

          <ol className="text-sm text-gray-700 space-y-2 mb-6">
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                1
              </span>
              <span>Open GCash app on your phone</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                2
              </span>
              <span>Tap the QR scan button</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                3
              </span>
              <span>Scan the QR code above</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                4
              </span>
              <span>Complete payment with your MPIN</span>
            </li>
          </ol>
        </div>
      )}

      {/* Processing */}
      {paymentStatus === 'PROCESSING' && (
        <div className="mb-6 text-center">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="mt-4 text-gray-600">Processing payment...</p>
        </div>
      )}

      {/* Success */}
      {paymentStatus === 'SUCCESS' && (
        <div className="mb-6 text-center">
          <div className="text-5xl mb-4">✓</div>
          <p className="text-lg font-bold text-green-600">Payment Successful!</p>
          <p className="text-sm text-gray-600 mt-2">Your service will begin shortly</p>
        </div>
      )}

      {/* Failed/Expired */}
      {(paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED') && (
        <div className="mb-6">
          <div className="text-5xl text-center mb-4">✕</div>
          <div className="bg-red-50 p-4 rounded-lg text-center mb-4">
            <p className="text-red-600 font-bold">
              {paymentStatus === 'EXPIRED' ? 'Payment Expired' : 'Payment Failed'}
            </p>
            <p className="text-sm text-red-500 mt-2">
              {paymentStatus === 'EXPIRED'
                ? 'Your payment link has expired.'
                : 'Your payment could not be processed.'}
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {paymentStatus === 'PENDING' && (
          <button
            onClick={() => cancelPayment(transaction.transactionId)}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        {(paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED') && (
          <button
            onClick={() => {
              resetPayment();
              createPayment(amount);
            }}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Try Again
          </button>
        )}
      </div>

      {/* Development Testing */}
      {process.env.NODE_ENV === 'development' && paymentStatus === 'PENDING' && (
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
          <p className="text-xs text-gray-500 text-center mb-2">Development Testing</p>
          <button
            onClick={async () => {
              await fetch(
                `${API_BASE_URL}/simulate/success/${transaction.transactionId}`,
                { method: 'POST' }
              );
            }}
            className="w-full px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            Simulate Success
          </button>
          <button
            onClick={async () => {
              await fetch(
                `${API_BASE_URL}/simulate/failure/${transaction.transactionId}`,
                { method: 'POST' }
              );
            }}
            className="w-full px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Simulate Failure
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Usage Example
 */
export const PaymentExample = () => {
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string>('');

  if (paymentComplete) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-green-600 mb-4">Payment Complete!</h1>
        <p className="text-gray-600 mb-6">Your document is being processed.</p>
        <button
          onClick={() => {
            setPaymentComplete(false);
            setFailureMessage('');
          }}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          New Transaction
        </button>
      </div>
    );
  }

  if (failureMessage) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Payment Failed</h1>
        <p className="text-gray-600 mb-6">{failureMessage}</p>
        <button
          onClick={() => setFailureMessage('')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <PaymentInterface
      amount={50.00}
      onSuccess={(transactionId) => {
        console.log('Payment successful:', transactionId);
        setPaymentComplete(true);
      }}
      onFailure={(error) => {
        console.error('Payment failed:', error);
        setFailureMessage(error);
      }}
    />
  );
};
