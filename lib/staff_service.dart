import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'config.dart';
import 'kiosk_runtime_service.dart';

class StaffMember {
  final String id;
  final String name;
  final String role; // 'admin' | 'staff'

  const StaffMember({required this.id, required this.name, required this.role});

  bool get isAdmin => role == 'admin';

  factory StaffMember.fromJson(Map<String, dynamic> json) => StaffMember(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        role: json['role'] as String? ?? 'staff',
      );
}

/// Result of a login attempt. [errorCode] is one of 'ACCOUNT_DISABLED',
/// 'ACCOUNT_LOCKED', or null for a generic invalid-credentials/network failure
/// — the UI never distinguishes "wrong username" from "wrong PIN".
class StaffLoginResult {
  final bool success;
  final StaffMember? staff;
  final String? errorCode;

  const StaffLoginResult({required this.success, this.staff, this.errorCode});
}

class PinResetRequestStatus {
  final String id;
  final String status; // pending | approved | denied | completed

  const PinResetRequestStatus({required this.id, required this.status});

  factory PinResetRequestStatus.fromJson(Map<String, dynamic> json) => PinResetRequestStatus(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'pending',
      );
}

class StaffTransactionEntry {
  final String id;
  final String createdAt;
  final String serviceType;
  final int pageCount;
  final int copies;
  final double? amount;
  final String? paymentStatus;
  final String printingStatus;

  const StaffTransactionEntry({
    required this.id,
    required this.createdAt,
    required this.serviceType,
    required this.pageCount,
    required this.copies,
    required this.amount,
    required this.paymentStatus,
    required this.printingStatus,
  });

  factory StaffTransactionEntry.fromJson(Map<String, dynamic> json) => StaffTransactionEntry(
        id: json['id'] as String? ?? '',
        createdAt: json['created_at'] as String? ?? '',
        serviceType: json['service_type'] as String? ?? 'printing',
        pageCount: (json['page_count'] as num?)?.toInt() ?? 0,
        copies: (json['copies'] as num?)?.toInt() ?? 1,
        amount: (json['amount'] as num?)?.toDouble(),
        paymentStatus: json['payment_status'] as String?,
        printingStatus: json['printing_status'] as String? ?? 'submitted',
      );
}

class StaffLogEntry {
  final int id;
  final String level;
  final String category;
  final String message;
  final String createdAt;

  const StaffLogEntry({
    required this.id,
    required this.level,
    required this.category,
    required this.message,
    required this.createdAt,
  });

  factory StaffLogEntry.fromJson(Map<String, dynamic> json) => StaffLogEntry(
        id: (json['id'] as num?)?.toInt() ?? 0,
        level: json['level'] as String? ?? 'info',
        category: json['category'] as String? ?? '',
        message: json['message'] as String? ?? '',
        createdAt: json['created_at'] as String? ?? '',
      );
}

/// HTTP calls to this kiosk's own local backend for Staff Mode. Same
/// conventions as StorageService/PrintingService — static methods, no shared
/// interceptor, failures are swallowed and reported via a return value.
class StaffService {
  static const String _baseUrl = BackendConfig.staffApiUrl;

  static Future<StaffLoginResult> login(String username, String pin) async {
    try {
      final response = await http
          .post(
            Uri.parse('$_baseUrl/login'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({'username': username, 'pin': pin}),
          )
          .timeout(const Duration(seconds: 10));

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return StaffLoginResult(
          success: true,
          staff: StaffMember.fromJson(body['staff'] as Map<String, dynamic>),
        );
      }
      return StaffLoginResult(success: false, errorCode: body['error'] as String?);
    } catch (e) {
      debugPrint('Staff login error: $e');
      return const StaffLoginResult(success: false);
    }
  }

  /// Returns the new request's id, or null if the username wasn't found or
  /// the request failed.
  static Future<String?> requestPinReset(String username) async {
    try {
      final response = await http
          .post(
            Uri.parse('$_baseUrl/pin-reset-requests'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({'username': username}),
          )
          .timeout(const Duration(seconds: 10));

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return (body['request'] as Map<String, dynamic>)['id'] as String?;
      }
      return null;
    } catch (e) {
      debugPrint('Staff pin-reset-request error: $e');
      return null;
    }
  }

  static Future<PinResetRequestStatus?> getPinResetRequestStatus(String requestId) async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/pin-reset-requests/$requestId'))
          .timeout(const Duration(seconds: 8));

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return PinResetRequestStatus.fromJson(body['request'] as Map<String, dynamic>);
      }
      return null;
    } catch (e) {
      debugPrint('Staff pin-reset-request status error: $e');
      return null;
    }
  }

  static Future<bool> setNewPin(String requestId, String newPin, String confirmPin) async {
    try {
      final response = await http
          .post(
            Uri.parse('$_baseUrl/pin-reset-requests/$requestId/set-new-pin'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({'newPin': newPin, 'confirmPin': confirmPin}),
          )
          .timeout(const Duration(seconds: 10));

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return response.statusCode == 200 && body['success'] == true;
    } catch (e) {
      debugPrint('Staff set-new-pin error: $e');
      return false;
    }
  }

  static Future<List<StaffTransactionEntry>> getTransactions({int limit = 50}) async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/transactions?limit=$limit'))
          .timeout(const Duration(seconds: 10));

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return (body['transactions'] as List<dynamic>)
            .map((e) => StaffTransactionEntry.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return [];
    } catch (e) {
      debugPrint('Staff transactions fetch error: $e');
      return [];
    }
  }

  static Future<List<StaffLogEntry>> getErrorLogs({int limit = 100}) async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/error-logs?limit=$limit'))
          .timeout(const Duration(seconds: 10));

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return (body['logs'] as List<dynamic>)
            .map((e) => StaffLogEntry.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return [];
    } catch (e) {
      debugPrint('Staff error-logs fetch error: $e');
      return [];
    }
  }

  /// Internet/cloud reachability — a real GET to the cloud-hosted backend's
  /// plain health endpoint, distinct from the PayMongo-specific gateway check.
  static Future<bool> checkInternet() async {
    try {
      final response = await http
          .get(Uri.parse('${BackendConfig.railwayUrl}/health'))
          .timeout(const Duration(seconds: 8));
      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Internet check error: $e');
      return false;
    }
  }

  /// Payment gateway connectivity check — never creates a charge. Reuses the
  /// backend's `/api/paymongo/health`, whose PayMongo check is now real (see
  /// PayMongoService.checkConnectivity).
  static Future<bool?> checkPaymentGateway() async {
    try {
      final response = await http
          .get(Uri.parse(BackendConfig.healthCheckUrl))
          .timeout(const Duration(seconds: 10));
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      final connected = data['paymongoApi'] == 'connected';
      if (!connected) {
        KioskRuntime.reportIncident(
          device: 'payment',
          errorCode: 'GATEWAY_UNREACHABLE',
          severity: 'warning',
          message: 'Staff payment diagnostic: gateway unreachable',
        );
      }
      return connected;
    } catch (e) {
      debugPrint('Payment gateway check error: $e');
      return null;
    }
  }
}
