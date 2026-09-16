import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'config.dart';
import 'kiosk_runtime_service.dart';

class PrintingService {
  static const String _baseUrl = BackendConfig.serverUrl;

  /// Print scanned images
  static Future<bool> printScannedImages(
    List<Uint8List> images, {
    String paperSize = 'A4',
    String colorMode = 'bw',
    String quality = 'standard',
    String? transactionId,
  }) async {
    try {
      // Convert images to base64 for sending to backend
      final base64Images = images.map((image) => base64Encode(image)).toList();

      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/upload-scanned'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'images': base64Images,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          // Now print the uploaded files
          final filenames = data['filenames'] as List<dynamic>;
          return await printFromStorage(
            filenames.cast<String>(),
            paperSize: paperSize,
            colorMode: colorMode,
            quality: quality,
            transactionId: transactionId,
          );
        }
      }

      print('Failed to upload scanned images: ${response.statusCode}');
      return false;
    } catch (e) {
      print('Error printing scanned images: $e');
      return false;
    }
  }

  /// Print files from storage
  static Future<bool> printFromStorage(
    List<String> filenames, {
    String paperSize = 'A4',
    String colorMode = 'bw',
    String quality = 'standard',
    String? transactionId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/from-storage'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'filenames': filenames,
          'paperSize': paperSize,
          'colorMode': colorMode,
          'quality': quality,
          if (transactionId != null) 'transactionId': transactionId,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }

      print('Failed to print from storage: ${response.statusCode}');
      // 423 = admin locked printing / maintenance — not a device fault.
      if (response.statusCode != 423) {
        KioskRuntime.reportIncident(
          device: 'printer',
          errorCode: 'PRINT_FAILED',
          severity: 'critical',
          message: 'Print from storage failed (HTTP ${response.statusCode})',
          metadata: {'paperSize': paperSize, 'files': filenames.length},
        );
      }
      return false;
    } catch (e) {
      print('Error printing from storage: $e');
      KioskRuntime.reportIncident(
        device: 'printer',
        errorCode: 'PRINT_ERROR',
        severity: 'critical',
        message: 'Print from storage threw: $e',
        metadata: {'paperSize': paperSize, 'files': filenames.length},
      );
      return false;
    }
  }

  /// Print a batch of images as a single N-up layout job (one multi-page
  /// print job, backend composes the grid and prints it as one unit so
  /// copies come out correctly collated).
  static Future<bool> printImageLayoutJob(
    List<String> filenames, {
    required int imagesPerPage,
    required String imageSize,
    double? customWidthIn,
    double? customHeightIn,
    required String orientation,
    String paperSize = 'A4',
    String colorMode = 'color',
    String quality = 'standard',
    int copies = 1,
    double? unitPrice,
    String serviceType = 'image-print',
    String? transactionId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/from-storage'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'filenames': filenames,
          'paperSize': paperSize,
          'colorMode': colorMode,
          'quality': quality,
          'copies': copies,
          'serviceType': serviceType,
          if (unitPrice != null) 'unitPrice': unitPrice,
          if (transactionId != null) 'transactionId': transactionId,
          'imageLayout': {
            'imagesPerPage': imagesPerPage,
            'imageSize': imageSize,
            if (customWidthIn != null) 'customWidthIn': customWidthIn,
            if (customHeightIn != null) 'customHeightIn': customHeightIn,
            'orientation': orientation,
          },
        }),
      );

      final data = response.statusCode == 200 ? json.decode(response.body) : null;
      if (response.statusCode == 200 && data is Map && data['success'] == true) {
        return true;
      }

      print('Failed to print image layout job: ${response.statusCode}');
      String msg = 'Unable to print the selected images. Please try again.';
      try {
        final body = data ?? json.decode(response.body);
        if (body is Map && body['error'] is String) msg = body['error'] as String;
      } catch (_) {}
      // 423 = admin locked printing / maintenance — not a device fault.
      if (response.statusCode != 423) {
        KioskRuntime.reportIncident(
          device: 'printer',
          errorCode: 'PRINT_FAILED',
          severity: 'critical',
          message: 'Image print job failed (HTTP ${response.statusCode})',
          metadata: {'paperSize': paperSize, 'files': filenames.length},
        );
      }
      throw Exception(msg);
    } on Exception {
      rethrow;
    } catch (e) {
      KioskRuntime.reportIncident(
        device: 'printer',
        errorCode: 'PRINT_ERROR',
        severity: 'critical',
        message: 'Image print job threw: $e',
        metadata: {'paperSize': paperSize, 'files': filenames.length},
      );
      throw Exception('Unable to print the selected images. Please try again.');
    }
  }

  /// Print text content
  static Future<bool> printText(
    String content, {
    String paperSize = 'A4',
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'content': content,
          'paperSize': paperSize,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }

      print('Failed to print text: ${response.statusCode}');
      return false;
    } catch (e) {
      print('Error printing text: $e');
      return false;
    }
  }

  /// Print receipt
  static Future<bool> printReceipt(
    String content, {
    String paperSize = 'A4',
    String? actor,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/receipt'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'content': content,
          'paperSize': paperSize,
          if (actor != null) 'actor': actor,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }

      print('Failed to print receipt: ${response.statusCode}');
      return false;
    } catch (e) {
      print('Error printing receipt: $e');
      return false;
    }
  }

  /// Print test page
  static Future<bool> printTestPage({
    String paperSize = 'A4',
    String? actor,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/test'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'paperSize': paperSize,
          if (actor != null) 'actor': actor,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }

      print('Failed to print test page: ${response.statusCode}');
      return false;
    } catch (e) {
      print('Error printing test page: $e');
      return false;
    }
  }

  // ── Staff Print Recovery ────────────────────────────────────────────────
  // Reprint a paid transaction's failed job without asking the customer to
  // pay again. Staff Mode only — see backend/src/routes/print.ts.

  static Future<List<RecoverableTransaction>> getRecoverableTransactions() async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/api/print/recoverable'))
          .timeout(const Duration(seconds: 10));
      final body = json.decode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && body['success'] == true) {
        return (body['recoverable'] as List<dynamic>)
            .map((e) => RecoverableTransaction.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return [];
    } catch (e) {
      print('Error fetching recoverable transactions: $e');
      return [];
    }
  }

  static Future<RecoveryOutcome> recoverPrint(
    String transactionId, {
    required String reason,
    String? reasonNote,
    required String actor,
    String? staffId,
  }) async {
    try {
      final response = await http
          .post(
            Uri.parse('$_baseUrl/api/print/recover/$transactionId'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({
              'reason': reason,
              if (reasonNote != null) 'reasonNote': reasonNote,
              'actor': actor,
              if (staffId != null) 'staffId': staffId,
            }),
          )
          .timeout(const Duration(seconds: 30));
      final body = json.decode(response.body) as Map<String, dynamic>;
      return RecoveryOutcome(
        success: response.statusCode == 200 && body['success'] == true,
        error: body['error'] as String?,
      );
    } catch (e) {
      print('Error recovering print: $e');
      return const RecoveryOutcome(success: false, error: 'Network error. Please try again.');
    }
  }
}

class RecoveryOutcome {
  final bool success;
  final String? error;
  const RecoveryOutcome({required this.success, this.error});
}

class RecoverablePrintJob {
  final String id;
  final List<String> filenames;
  final String paperSize;
  final int copies;
  final int pageCount;
  final String serviceType;

  const RecoverablePrintJob({
    required this.id,
    required this.filenames,
    required this.paperSize,
    required this.copies,
    required this.pageCount,
    required this.serviceType,
  });

  factory RecoverablePrintJob.fromJson(Map<String, dynamic> j) => RecoverablePrintJob(
        id: j['id'] as String? ?? '',
        filenames: (j['filenames'] as List<dynamic>? ?? []).cast<String>(),
        paperSize: j['paper_size'] as String? ?? 'A4',
        copies: (j['copies'] as num?)?.toInt() ?? 1,
        pageCount: (j['page_count'] as num?)?.toInt() ?? 0,
        serviceType: j['service_type'] as String? ?? 'printing',
      );
}

class RecoverableTransaction {
  final String transactionId;
  final String referenceNumber;
  final double amount;
  final String createdAt;
  final RecoverablePrintJob printJob;

  const RecoverableTransaction({
    required this.transactionId,
    required this.referenceNumber,
    required this.amount,
    required this.createdAt,
    required this.printJob,
  });

  factory RecoverableTransaction.fromJson(Map<String, dynamic> j) {
    final t = j['transaction'] as Map<String, dynamic>;
    final p = j['printJob'] as Map<String, dynamic>;
    return RecoverableTransaction(
      transactionId: t['id'] as String? ?? '',
      referenceNumber: t['reference_number'] as String? ?? '',
      amount: (t['amount'] as num?)?.toDouble() ?? 0,
      createdAt: t['created_at'] as String? ?? '',
      printJob: RecoverablePrintJob.fromJson(p),
    );
  }
}