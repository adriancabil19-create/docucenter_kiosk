import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'storage_service.dart';

/// Transfer method types
enum TransferMethod { usb, bluetooth, wifiHotspot, qrCode }

/// Transfer status
enum TransferStatus { idle, initializing, transferring, completed, failed, cancelled }

/// Result of a transfer operation
class TransferResult {
  final bool success;
  final String message;
  final List<String> transferredDocumentIds;
  final DateTime timestamp;

  TransferResult({
    required this.success,
    required this.message,
    required this.transferredDocumentIds,
    required this.timestamp,
  });
}

/// Base class for all transfer services
abstract class TransferService {
  TransferStatus _status = TransferStatus.idle;
  final ValueNotifier<TransferStatus> statusNotifier =
      ValueNotifier(TransferStatus.idle);

  TransferStatus get status => _status;

  set status(TransferStatus value) {
    _status = value;
    statusNotifier.value = value;
  }

  /// Initialize the transfer service
  Future<void> initialize();

  /// Start transferring documents
  Future<TransferResult> startTransfer(List<StorageDocument> documents);

  /// Get current transfer progress (0.0 to 1.0)
  double getProgress();

  /// Cancel ongoing transfer
  Future<void> cancel();

  /// Clean up resources
  void dispose() {
    statusNotifier.dispose();
  }
}

/// USB Transfer Service
/// Exports documents to a local folder (e.g., external storage or documents dir).
class USBTransferService extends TransferService {
  double _progress = 0.0;
  Directory? _exportDir;

  @override
  Future<void> initialize() async {
    try {
      status = TransferStatus.initializing;
      final baseDir = await getApplicationDocumentsDirectory();
      _exportDir = Directory('${baseDir.path}${Platform.pathSeparator}WebDoc_Export');
      if (!await _exportDir!.exists()) {
        await _exportDir!.create(recursive: true);
      }
      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      final transferred = <String>[];

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null) {
          // skip failed file
          continue;
        }

        final fileName = doc.originalName.isNotEmpty ? doc.originalName : doc.name;
        final outFile = File('${_exportDir!.path}${Platform.pathSeparator}$fileName');
        await outFile.writeAsBytes(bytes, flush: true);
        transferred.add(doc.id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: transferred.isNotEmpty,
        message: transferred.isNotEmpty
            ? 'Exported ${transferred.length} document(s) to ${_exportDir!.path}'
            : 'No documents were exported',
        transferredDocumentIds: transferred,
        timestamp: DateTime.now(),
      );
    } catch (e) {
      status = TransferStatus.failed;
      return TransferResult(
        success: false,
        message: 'USB export failed: $e',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }
  }

  @override
  double getProgress() => _progress;

  @override
  Future<void> cancel() async {
    try {
      status = TransferStatus.cancelled;
      _progress = 0.0;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }
}

/// Bluetooth Transfer Service
class BluetoothTransferService extends TransferService {
  static const String _serviceName = 'WebDoc Bluetooth Transfer';
  String? _deviceAddress;
  double _progress = 0.0;

  @override
  Future<void> initialize() async {
    try {
      status = TransferStatus.initializing;
      // TODO: initialize bluetooth adapter and permissions
      await Future.delayed(const Duration(milliseconds: 300));
      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      final transferred = <String>[];

      for (int i = 0; i < documents.length; i++) {
        // TODO: implement real bluetooth transfer
        await Future.delayed(const Duration(milliseconds: 200));
        transferred.add(documents[i].id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: true,
        message: 'Simulated Bluetooth transfer completed',
        transferredDocumentIds: transferred,
        timestamp: DateTime.now(),
      );
    } catch (e) {
      status = TransferStatus.failed;
      return TransferResult(
        success: false,
        message: 'Bluetooth transfer failed: $e',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }
  }

  @override
  double getProgress() => _progress;

  @override
  Future<void> cancel() async {
    status = TransferStatus.cancelled;
    _progress = 0.0;
  }

  /// Discover nearby Bluetooth devices (simulated)
  Future<List<BluetoothDevice>> discoverDevices() async {
    // TODO: replace with real discovery logic
    await Future.delayed(const Duration(milliseconds: 200));
    return [
      BluetoothDevice(address: '00:11:22:33:44:55', name: 'WebDoc-Printer-1'),
      BluetoothDevice(address: 'AA:BB:CC:DD:EE:FF', name: 'WebDoc-Phone-1'),
    ];
  }

  /// Connect to a specific device. Returns true on success.
  Future<bool> connectToDevice(String deviceAddress, [String? deviceName]) async {
    try {
      status = TransferStatus.initializing;
      _deviceAddress = deviceAddress;
      // TODO: implement actual connection
      await Future.delayed(const Duration(milliseconds: 400));
      status = TransferStatus.idle;
      return true;
    } catch (e) {
      status = TransferStatus.failed;
      return false;
    }
  }

  Future<void> disconnect() async {
    _deviceAddress = null;
    status = TransferStatus.idle;
  }
}

/// WiFi Hotspot Transfer Service
class WiFiHotspotTransferService extends TransferService {
  static const int defaultPort = 8888;
  String? _hotspotName;
  String? _hotspotPassword;
  late int _port;
  double _progress = 0.0;

  @override
  Future<void> initialize() async {
    try {
      status = TransferStatus.initializing;
      _port = defaultPort;
      // TODO: initialize wifi/hotspot and permissions
      await Future.delayed(const Duration(milliseconds: 300));
      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      final transferred = <String>[];

      for (int i = 0; i < documents.length; i++) {
        // TODO: implement real wifi/http transfer
        await Future.delayed(const Duration(milliseconds: 200));
        transferred.add(documents[i].id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: true,
        message: 'Simulated WiFi transfer completed',
        transferredDocumentIds: transferred,
        timestamp: DateTime.now(),
      );
    } catch (e) {
      status = TransferStatus.failed;
      return TransferResult(
        success: false,
        message: 'WiFi transfer failed: $e',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }
  }

  @override
  double getProgress() => _progress;

  @override
  Future<void> cancel() async {
    status = TransferStatus.cancelled;
    _progress = 0.0;
  }

  Future<Map<String, String>> getNetworkInfo() async {
    // TODO: return actual network info
    return {
      'ip': '192.168.0.100',
      'hostname': 'webdoc-device',
      'port': _port.toString(),
    };
  }

  Future<String> generateTransferLink(List<StorageDocument> documents) async {
    final info = await getNetworkInfo();
    return 'http://${info['ip']}:${info['port']}/transfer?token=demo';
  }

  void setPort(int port) {
    _port = port;
  }
}

/// QR Code Transfer Service
class QrCodeTransferService extends TransferService {
  String? _transferToken;
  String? _transferLink;
  double _progress = 0.0;
  DateTime? _tokenExpiration;

  @override
  Future<void> initialize() async {
    try {
      status = TransferStatus.initializing;
      await Future.delayed(const Duration(milliseconds: 200));
      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      final transferred = <String>[];

      for (int i = 0; i < documents.length; i++) {
        // TODO: implement QR-code driven transfer
        await Future.delayed(const Duration(milliseconds: 200));
        transferred.add(documents[i].id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: true,
        message: 'Simulated QR transfer completed',
        transferredDocumentIds: transferred,
        timestamp: DateTime.now(),
      );
    } catch (e) {
      status = TransferStatus.failed;
      return TransferResult(
        success: false,
        message: 'QR transfer failed: $e',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }
  }

  @override
  double getProgress() => _progress;

  @override
  Future<void> cancel() async {
    status = TransferStatus.cancelled;
    _transferToken = null;
    _transferLink = null;
    _progress = 0.0;
  }

  Future<String> generateQrCodeData(List<StorageDocument> documents) async {
    _transferToken = 'TOKEN_${DateTime.now().millisecondsSinceEpoch}';
    _transferLink = 'https://webdoc.transfer/session=$_transferToken';
    _tokenExpiration = DateTime.now().add(const Duration(minutes: 10));
    return _transferLink!;
  }

  Future<Map<String, dynamic>> getSessionDetails() async {
    return {
      'token': _transferToken,
      'link': _transferLink,
      'expiresAt': _tokenExpiration?.toIso8601String(),
      'isExpired': _tokenExpiration?.isBefore(DateTime.now()) ?? false,
    };
  }

  Future<void> revokeSession() async {
    _transferToken = null;
    _transferLink = null;
    _tokenExpiration = null;
  }
}

/// Manager for coordinating transfer operations
class TransferManager {
  final USBTransferService usb = USBTransferService();
  final BluetoothTransferService bluetooth = BluetoothTransferService();
  final WiFiHotspotTransferService wifiHotspot = WiFiHotspotTransferService();
  final QrCodeTransferService qrCode = QrCodeTransferService();

  /// Initialize all transfer services
  Future<void> initializeAll() async {
    try {
      await Future.wait([
        usb.initialize(),
        bluetooth.initialize(),
        wifiHotspot.initialize(),
        qrCode.initialize(),
      ]);
    } catch (e) {
      debugPrint('Error initializing transfer services: $e');
    }
  }

  /// Transfer documents using specified method
  Future<TransferResult> transferDocuments(
    TransferMethod method,
    List<StorageDocument> documents,
  ) async {
    final service = _getService(method);
    return service.startTransfer(documents);
  }

  /// Get service for transfer method
  TransferService _getService(TransferMethod method) {
    return switch (method) {
      TransferMethod.usb => usb,
      TransferMethod.bluetooth => bluetooth,
      TransferMethod.wifiHotspot => wifiHotspot,
      TransferMethod.qrCode => qrCode,
    };
  }

  /// Clean up all services
  void dispose() {
    usb.dispose();
    bluetooth.dispose();
    wifiHotspot.dispose();
    qrCode.dispose();
  }
}

/// Bluetooth Device (placeholder)
class BluetoothDevice {
  final String address;
  final String name;
  final bool isConnected;

  BluetoothDevice({
    required this.address,
    required this.name,
    this.isConnected = false,
  });
}
