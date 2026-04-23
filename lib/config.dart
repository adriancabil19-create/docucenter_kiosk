/// Flutter App Configuration
/// 
/// This file contains configuration settings for the Flutter application,
/// including backend API endpoints, timeouts, and other settings.
library;

const String flutterAppVersion = '1.0.0';

// =============================================================================
// Backend Configuration
// =============================================================================

/// Backend API base URL
/// Change this to match your deployment environment
///
/// Development:  http://localhost:5000
/// Staging:      https://staging-api.yourdomain.com
/// Production:   https://api.yourdomain.com
class BackendConfig {
  /// Local backend — storage, printing, scanning (must be running on the kiosk machine)
  static const String serverUrl = 'http://localhost:5000';

  /// Render-hosted backend — payments and file transfer relay
  static const String renderUrl = 'https://docucenter-api.onrender.com';

  static const String baseUrl = '$renderUrl/api/paymongo';
  static const String printApiUrl = '$serverUrl/api/print';
  static const String storageApiUrl = '$serverUrl/api/storage';

  /// Upload endpoint on the Render transfer relay (kiosk → phone)
  static const String transferUploadUrl = '$renderUrl/api/transfer/upload';

  /// Create a receive session (phone → kiosk)
  static const String transferReceiveSessionUrl = '$renderUrl/api/transfer/receive-session';

  /// Poll receive session status
  static String transferReceiveStatusUrl(String sessionId) =>
      '$renderUrl/api/transfer/receive-session/$sessionId/status';

  /// Download a file the phone uploaded
  static String transferReceiveFileUrl(String sessionId, String filename) =>
      '$renderUrl/api/transfer/receive-session/$sessionId/file/${Uri.encodeComponent(filename)}';

  /// Delete a receive session after kiosk is done
  static String transferReceiveDeleteUrl(String sessionId) =>
      '$renderUrl/api/transfer/receive-session/$sessionId';
  
  // Endpoint paths
  static const String createPaymentPath = '/create-payment';
  static const String checkPaymentPath = '/check-payment';
  static const String cancelPaymentPath = '/cancel-payment';
  static const String webhookPath = '/webhook';
  static const String healthCheckPath = '/health';
  static const String simulateSuccessPath = '/simulate/success';
  static const String simulateFailurePath = '/simulate/failure';

  // Full endpoint URLs
  static String get createPaymentUrl => '$baseUrl$createPaymentPath';
  static String get healthCheckUrl => '$baseUrl$healthCheckPath';
  
  static String checkPaymentUrl(String transactionId) => 
    '$baseUrl$checkPaymentPath/$transactionId';
  
  static String cancelPaymentUrl(String transactionId) => 
    '$baseUrl$cancelPaymentPath/$transactionId';
  
  static String simulateSuccessUrl(String transactionId) => 
    '$baseUrl$simulateSuccessPath/$transactionId';
  
  static String simulateFailureUrl(String transactionId) => 
    '$baseUrl$simulateFailurePath/$transactionId';
}

// =============================================================================
// Payment Configuration
// =============================================================================

class PaymentConfig {
  /// Default timeout for API requests (in seconds)
  static const int requestTimeoutSeconds = 30;

  /// Polling interval for checking payment status (in milliseconds)
  static const int pollingIntervalMs = 3000;

  /// Maximum payment waiting time (in seconds)
  static const int maxPaymentDurationSeconds = 300; // 5 minutes

  /// Minimum payment amount (in PHP)
  static const double minPaymentAmount = 1.00;

  /// Maximum payment amount (in PHP)
  static const double maxPaymentAmount = 100000.00;
}

// =============================================================================
// UI Configuration
// =============================================================================

class UiConfig {
  /// Show development/testing tools
  /// Set to false in production builds
  static const bool showDevelopmentTools = false;

  /// Enable debug logging
  static const bool enableDebugLogging = false;

  /// Animation duration (in milliseconds)
  static const int animationDurationMs = 300;
}

// =============================================================================
// Error Messages
// =============================================================================

class ErrorMessages {
  static const String networkError = 'Network error. Please check your internet connection.';
  static const String timeoutError = 'Request timeout. Please try again.';
  static const String paymentCreationError = 'Failed to create payment. Please try again.';
  static const String paymentStatusError = 'Failed to check payment status. Please try again.';
  static const String paymentCancelError = 'Failed to cancel payment. Please try again.';
  static const String invalidAmountError = 'Invalid payment amount.';
  static const String serverError = 'Server error. Please try again later.';
}

// =============================================================================
// Success Messages
// =============================================================================

class SuccessMessages {
  static const String paymentCreated = 'Payment link generated successfully.';
  static const String paymentSuccessful = 'Payment successful!';
  static const String paymentCancelled = 'Payment cancelled.';
}

