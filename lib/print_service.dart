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
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/receipt'),
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
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/print/test'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'paperSize': paperSize,
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
}