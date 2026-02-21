import 'dart:convert';
import 'package:http/http.dart' as http;

// ============================================================================
// Configuration
// ============================================================================

const String BACKEND_URL = 'http://localhost:5000/api/gcash';
const Duration TIMEOUT_DURATION = Duration(seconds: 30);
const Duration POLLING_INTERVAL = Duration(seconds: 3);

// ============================================================================
// Models
// ============================================================================

class PaymentTransaction {
  final String transactionId;
  final String referenceNumber;
  final String qrCode;
  final int expiresIn;
  final double amount;
  final String status;

  PaymentTransaction({
    required this.transactionId,
    required this.referenceNumber,
    required this.qrCode,
    required this.expiresIn,
    required this.amount,
    required this.status,
  });

  factory PaymentTransaction.fromJson(Map<String, dynamic> json) {
    return PaymentTransaction(
      transactionId: json['transactionId'] as String,
      referenceNumber: json['referenceNumber'] as String,
      qrCode: json['qrCode'] as String,
      expiresIn: json['expiresIn'] as int,
      amount: (json['amount'] as num).toDouble(),
      status: json['status'] as String? ?? 'PENDING',
    );
  }

  Map<String, dynamic> toJson() => {
    'transactionId': transactionId,
    'referenceNumber': referenceNumber,
    'qrCode': qrCode,
    'expiresIn': expiresIn,
    'amount': amount,
    'status': status,
  };
}

class PaymentStatus {
  final String status; // PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED, CANCELLED
  final String transactionId;
  final String referenceNumber;
  final double amount;
  final String? completedAt;

  PaymentStatus({
    required this.status,
    required this.transactionId,
    required this.referenceNumber,
    required this.amount,
    this.completedAt,
  });

  factory PaymentStatus.fromJson(Map<String, dynamic> json) {
    return PaymentStatus(
      status: json['status'] as String,
      transactionId: json['transactionId'] as String,
      referenceNumber: json['referenceNumber'] as String,
      amount: (json['amount'] as num).toDouble(),
      completedAt: json['completedAt'] as String?,
    );
  }

  bool get isSuccessful => status == 'SUCCESS';
  bool get isFailed => status == 'FAILED' || status == 'EXPIRED';
  bool get isPending => status == 'PENDING' || status == 'PROCESSING';

  Map<String, dynamic> toJson() => {
    'status': status,
    'transactionId': transactionId,
    'referenceNumber': referenceNumber,
    'amount': amount,
    'completedAt': completedAt,
  };
}

class ApiResponse<T> {
  final bool success;
  final String message;
  final T? data;
  final String? error;

  ApiResponse({
    required this.success,
    required this.message,
    this.data,
    this.error,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic)? dataParser,
  ) {
    return ApiResponse(
      success: json['success'] as bool? ?? false,
      message: json['message'] as String? ?? '',
      data: json['data'] != null && dataParser != null
          ? dataParser(json['data'])
          : null,
      error: json['error'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'success': success,
    'message': message,
    'data': data,
    'error': error,
  };
}

// ============================================================================
// Exceptions
// ============================================================================

class PaymentException implements Exception {
  final String message;
  final String? code;

  PaymentException(this.message, {this.code});

  @override
  String toString() => 'PaymentException: $message${code != null ? ' ($code)' : ''}';
}

class NetworkException implements Exception {
  final String message;

  NetworkException(this.message);

  @override
  String toString() => 'NetworkException: $message';
}

class TimeoutException implements Exception {
  final String message;

  TimeoutException(this.message);

  @override
  String toString() => 'TimeoutException: $message';
}

// ============================================================================
// GCash Payment Service
// ============================================================================

class GCashPaymentService {
  static final GCashPaymentService _instance = GCashPaymentService._internal();

  factory GCashPaymentService() {
    return _instance;
  }

  GCashPaymentService._internal();

  // =========================================================================
  // Public Methods
  // =========================================================================

  /// Create a new payment transaction
  /// Returns PaymentTransaction with QR code to display
  Future<PaymentTransaction> createPayment({
    required double amount,
    String? serviceType,
    int documentCount = 1,
  }) async {
    try {
      final response = await http
          .post(
            Uri.parse('$BACKEND_URL/create-payment'),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'amount': amount,
              'serviceType': serviceType ?? 'document_service',
              'documentCount': documentCount,
            }),
          )
          .timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final jsonResponse = jsonDecode(response.body) as Map<String, dynamic>;
        final apiResponse = ApiResponse.fromJson(
          jsonResponse,
          (data) => PaymentTransaction.fromJson(data as Map<String, dynamic>),
        );

        if (apiResponse.success && apiResponse.data != null) {
          return apiResponse.data!;
        }

        throw PaymentException(
          apiResponse.error ?? 'Failed to create payment',
        );
      }

      throw PaymentException(
        'Server error: ${response.statusCode}',
        code: response.statusCode.toString(),
      );
    } on TimeoutException {
      rethrow;
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw NetworkException('Failed to create payment: $e');
    }
  }

  /// Check payment status
  /// Poll this method to track payment progress
  Future<PaymentStatus> checkPaymentStatus(String transactionId) async {
    try {
      final response = await http
          .get(
            Uri.parse('$BACKEND_URL/check-payment/$transactionId'),
            headers: {
              'Accept': 'application/json',
            },
          )
          .timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final jsonResponse = jsonDecode(response.body) as Map<String, dynamic>;
        final apiResponse = ApiResponse.fromJson(
          jsonResponse,
          (data) => PaymentStatus.fromJson(data as Map<String, dynamic>),
        );

        if (apiResponse.success && apiResponse.data != null) {
          return apiResponse.data!;
        }

        throw PaymentException(
          apiResponse.error ?? 'Failed to check payment status',
        );
      }

      throw PaymentException(
        'Server error: ${response.statusCode}',
        code: response.statusCode.toString(),
      );
    } on TimeoutException {
      rethrow;
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw NetworkException('Failed to check payment status: $e');
    }
  }

  /// Cancel a payment transaction
  Future<void> cancelPayment(
    String transactionId, {
    String reason = 'User cancelled',
  }) async {
    try {
      final response = await http
          .post(
            Uri.parse('$BACKEND_URL/cancel-payment/$transactionId'),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({'reason': reason}),
          )
          .timeout(TIMEOUT_DURATION);

      if (response.statusCode != 200) {
        throw PaymentException(
          'Failed to cancel payment: ${response.statusCode}',
          code: response.statusCode.toString(),
        );
      }
    } on TimeoutException {
      rethrow;
    } catch (e) {
      if (e is PaymentException) rethrow;
      throw NetworkException('Failed to cancel payment: $e');
    }
  }

  /// Simulate payment success (development only)
  /// Optionally pass filenames to instruct the backend to print files from storage
  Future<Map<String, dynamic>?> simulatePaymentSuccess(String transactionId, {List<String>? filenames}) async {
    try {
      final body = (filenames != null && filenames.isNotEmpty)
          ? jsonEncode({'filenames': filenames})
          : null;

      final response = await http
          .post(
            Uri.parse('$BACKEND_URL/simulate/success/$transactionId'),
            headers: body != null ? {'Content-Type': 'application/json'} : null,
            body: body,
          )
          .timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        try {
          return jsonDecode(response.body) as Map<String, dynamic>;
        } catch (_) {
          return null;
        }
      }

      return null;
    } catch (e) {
      // Dev endpoint, ignore errors
      return null;
    }
  }

  /// Simulate payment failure (development only)
  Future<void> simulatePaymentFailure(String transactionId) async {
    try {
      await http
          .post(
            Uri.parse('$BACKEND_URL/simulate/failure/$transactionId'),
          )
          .timeout(TIMEOUT_DURATION);
    } catch (e) {
      // Dev endpoint, ignore errors
    }
  }

  /// Check if backend is available
  Future<bool> healthCheck() async {
    try {
      final response = await http
          .get(
            Uri.parse('$BACKEND_URL/health'),
          )
          .timeout(const Duration(seconds: 5));

      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /// Decode QR code content (Base64 to String)
  String decodeQRCode(String base64QR) {
    try {
      return utf8.decode(base64.decode(base64QR));
    } catch (e) {
      return base64QR;
    }
  }

  /// Encode string to Base64 for QR code
  String encodeQRCode(String content) {
    return base64.encode(utf8.encode(content));
  }
}

// ============================================================================
// Print Service
// ============================================================================

const String PRINT_API_URL = 'http://localhost:5000/api/print';

class PrintService {
  /// Print raw text content
  static Future<bool> printText(String content) async {
    try {
      final response = await http.post(
        Uri.parse('$PRINT_API_URL'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'content': content}),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      print('Error printing text: $e');
      return false;
    }
  }

  /// Print receipt content
  static Future<bool> printReceipt(String receiptContent) async {
    try {
      final response = await http.post(
        Uri.parse('$PRINT_API_URL/receipt'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'content': receiptContent}),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      print('Error printing receipt: $e');
      return false;
    }
  }

  /// Print document content
  static Future<bool> printDocument(String content, {String? documentName}) async {
    try {
      final response = await http.post(
        Uri.parse('$PRINT_API_URL/document'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'content': content,
          'documentName': documentName,
        }),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      print('Error printing document: $e');
      return false;
    }
  }

  /// Print files that exist in backend storage by filename(s)
  static Future<bool> printFromStorage(List<String> filenames) async {
    try {
      final response = await http.post(
        Uri.parse('$PRINT_API_URL/from-storage'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'filenames': filenames}),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        // If simulation returned paths, print them to debug and show as info
        if (data['simulatedPaths'] != null) {
          try {
            final List<dynamic> paths = data['simulatedPaths'];
            print('Simulated print files:');
            for (final p in paths) {
              print(p.toString());
            }
          } catch (_) {}
        }
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      print('Error printing from storage: $e');
      return false;
    }
  }

  /// Get available printers
  static Future<List<String>> getAvailablePrinters() async {
    try {
      final response = await http.get(
        Uri.parse('$PRINT_API_URL/printers'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['printers'] is List) {
          return List<String>.from(data['printers']);
        }
      }
      return [];
    } catch (e) {
      print('Error getting printers: $e');
      return [];
    }
  }
}

// ============================================================================
// Polling Manager
// ============================================================================

class PaymentPollingManager {
  final GCashPaymentService _service;
  final String transactionId;
  final Duration pollingInterval;
  final Duration maxDuration;
  final void Function(PaymentStatus) onStatusUpdate;
  final void Function(String)? onError;

  PaymentPollingManager({
    required this.transactionId,
    required this.onStatusUpdate,
    this.onError,
    this.pollingInterval = POLLING_INTERVAL,
    this.maxDuration = const Duration(minutes: 5),
  }) : _service = GCashPaymentService();

  Future<void> startPolling() async {
    final startTime = DateTime.now();
    bool keepPolling = true;

    while (keepPolling) {
      try {
        final status = await _service.checkPaymentStatus(transactionId);
        onStatusUpdate(status);

        // Stop polling if payment is complete or failed
        if (status.isSuccessful || status.isFailed) {
          keepPolling = false;
        }

        // Check if polling has exceeded max duration
        if (DateTime.now().difference(startTime) > maxDuration) {
          keepPolling = false;
          onError?.call('Payment polling timed out');
        }

        if (keepPolling) {
          await Future.delayed(pollingInterval);
        }
      } catch (e) {
        onError?.call('Error checking payment status: $e');
        keepPolling = false;
      }
    }
  }
}
