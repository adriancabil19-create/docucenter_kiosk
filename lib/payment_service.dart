import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'config.dart';

// ============================================================================
// Configuration
// ============================================================================

String get BACKEND_URL => BackendConfig.baseUrl;
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
// PAYMONGO Payment Service
// ============================================================================

class PAYMONGOPaymentService {
  static final PAYMONGOPaymentService _instance = PAYMONGOPaymentService._internal();

  factory PAYMONGOPaymentService() {
    return _instance;
  }

  PAYMONGOPaymentService._internal();

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

class PrintService {
  /// Print raw text content
  static Future<bool> printText(String content) async {
    try {
      final response = await http.post(
        Uri.parse(BackendConfig.printApiUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'content': content}),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      debugPrint('Error printing text: $e');
      return false;
    }
  }

  /// Print receipt content
  static Future<bool> printReceipt(String receiptContent, {String? paperSize}) async {
    try {
      final body = {'content': receiptContent};
      if (paperSize != null) body['paperSize'] = paperSize;
      final response = await http.post(
        Uri.parse('${BackendConfig.printApiUrl}/receipt'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      debugPrint('Error printing receipt: $e');
      return false;
    }
  }

  /// Print document content
  static Future<bool> printDocument(String content, {String? documentName}) async {
    try {
      final response = await http.post(
        Uri.parse('${BackendConfig.printApiUrl}/document'),
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
      debugPrint('Error printing document: $e');
      return false;
    }
  }

  /// Print files that exist in backend storage by filename(s)
  static Future<bool> printFromStorage(List<String> filenames, {String? paperSize, String? colorMode, String? quality}) async {
    try {
      final body = <String, dynamic>{'filenames': filenames};
      if (paperSize != null) body['paperSize'] = paperSize;
      if (colorMode != null) body['colorMode'] = colorMode;
      if (quality != null) body['quality'] = quality;
      final response = await http.post(
        Uri.parse('${BackendConfig.printApiUrl}/from-storage'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        // If simulation returned paths, print them to debug and show as info
        if (data['simulatedPaths'] != null) {
          try {
            final List<dynamic> paths = data['simulatedPaths'];
            debugPrint('Simulated print files:');
            for (final p in paths) {
              debugPrint(p.toString());
            }
          } catch (_) {}
        }
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      debugPrint('Error printing from storage: $e');
      return false;
    }
  }

  /// Upload scanned images and print them
  static Future<bool> printScannedImages(List<Uint8List> images, {String? paperSize, String? colorMode, String? quality}) async {
    try {
      // First upload the images
      final uploadResponse = await http.post(
        Uri.parse('${BackendConfig.printApiUrl}/upload-scanned'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'images': images.map((img) => base64Encode(img)).toList(),
        }),
      ).timeout(TIMEOUT_DURATION);

      if (uploadResponse.statusCode != 200) {
        debugPrint('Failed to upload scanned images');
        return false;
      }

      final uploadData = jsonDecode(uploadResponse.body);
      if (!(uploadData['success'] ?? false)) {
        debugPrint('Upload failed: ${uploadData['error']}');
        return false;
      }

      final List<String> filenames = List<String>.from(uploadData['filenames']);

      // Now print the uploaded files
      return await printFromStorage(filenames, paperSize: paperSize, colorMode: colorMode, quality: quality);
    } catch (e) {
      debugPrint('Error printing scanned images: $e');
      return false;
    }
  }

  /// Print a test page to verify printer is working
  static Future<bool> printTestPage({String paperSize = 'A4'}) async {
    try {
      final response = await http.post(
        Uri.parse('${BackendConfig.printApiUrl}/test'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'paperSize': paperSize}),
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['success'] ?? false;
      }
      return false;
    } catch (e) {
      debugPrint('Error printing test page: $e');
      return false;
    }
  }

  /// Get available printers with paper sizes
  static Future<List<Map<String, dynamic>>> getAvailablePrinters() async {
    try {
      final response = await http.get(
        Uri.parse('${BackendConfig.printApiUrl}/printers'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(TIMEOUT_DURATION);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['printers'] is List) {
          return List<Map<String, dynamic>>.from(
            (data['printers'] as List).map((p) => Map<String, dynamic>.from(p as Map)),
          );
        }
      }
      return [];
    } catch (e) {
      debugPrint('Error getting printers: $e');
      return [];
    }
  }
}

// ============================================================================
// Polling Manager
// ============================================================================

class PaymentPollingManager {
  final PAYMONGOPaymentService _service;
  final String transactionId;
  final Duration pollingInterval;
  final Duration maxDuration;
  final void Function(PaymentStatus) onStatusUpdate;
  final void Function(String)? onError;

  bool _cancelled = false;

  PaymentPollingManager({
    required this.transactionId,
    required this.onStatusUpdate,
    this.onError,
    this.pollingInterval = POLLING_INTERVAL,
    this.maxDuration = const Duration(minutes: 5),
  }) : _service = PAYMONGOPaymentService();

  void stopPolling() => _cancelled = true;

  Future<void> startPolling() async {
    final startTime = DateTime.now();
    _cancelled = false;

    while (!_cancelled) {
      try {
        final status = await _service.checkPaymentStatus(transactionId);
        if (_cancelled) return;
        onStatusUpdate(status);

        if (status.isSuccessful || status.isFailed) return;

        if (DateTime.now().difference(startTime) > maxDuration) {
          onError?.call('Payment polling timed out');
          return;
        }

        await Future.delayed(pollingInterval);
      } catch (e) {
        if (_cancelled) return;
        onError?.call('Error checking payment status: $e');
        return;
      }
    }
  }

  Future<Map<String, dynamic>> printFiles(List<String> filenames, String paperSize, String colorMode, String quality) async {
    final response = await http.post(
      Uri.parse('$BACKEND_URL/api/print/from-storage'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'filenames': filenames,
        'paperSize': paperSize,
        'colorMode': colorMode,
        'quality': quality,
      }),
    );
    return jsonDecode(response.body);
  }
}

