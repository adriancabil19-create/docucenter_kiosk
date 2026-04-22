import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'storage_service.dart';

/// Transfer method types
enum TransferMethod { usb, wifiHotspot, qrCode }

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

  /// Get network information (WiFi hotspot only)
  Future<Map<String, String>> getNetworkInfo() async {
    throw UnsupportedError('Network info not supported by this service');
  }

  /// Generate transfer link (WiFi hotspot only)
  Future<String> generateTransferLink(List<StorageDocument> documents) async {
    throw UnsupportedError('Transfer link generation not supported by this service');
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

/// Local-network / Windows-hotspot web transfer service.
///
/// When [useWindowsHotspot] is true (default on Windows) the service runs
/// `netsh wlan hostednetwork` to create a dedicated WiFi access point with
/// SSID "DocuCenter". The HTTP server binds to 0.0.0.0 and the QR code URL
/// uses the hotspot gateway IP (192.168.137.1) so the user's phone can
/// connect directly without needing to be on the same corporate LAN.
///
/// Falls back to LAN IP discovery if the hotspot cannot be started
/// (e.g. incompatible WiFi adapter).
class LocalWebTransferService extends TransferService {
  static const int _defaultPort = 8888;

  // Windows hosted-network constants
  static const String _hotspotSsid = 'DocuCenter';
  static const String _hotspotKey  = 'docucenter1';   // min 8 chars
  static const String _hotspotGateway = '192.168.137.1';

  final bool useWindowsHotspot;
  bool _hotspotActive = false;

  int _port = _defaultPort;
  double _progress = 0.0;
  HttpServer? _httpServer;
  /// Temp directory that holds the locally saved copies of the transferred files.
  Directory? _serveDir;
  final List<String> _servedFiles = [];
  String? _localIp;

  LocalWebTransferService({this.useWindowsHotspot = true});

  // Exposed so the dialog can show connect instructions.
  String? get hotspotSsid     => _hotspotActive ? _hotspotSsid    : null;
  String? get hotspotPassword => _hotspotActive ? _hotspotKey     : null;

  Future<bool> _startHotspot() async {
    try {
      // Configure the hosted network SSID/key.
      final setup = await Process.run('netsh', [
        'wlan', 'set', 'hostednetwork',
        'mode=allow',
        'ssid=$_hotspotSsid',
        'key=$_hotspotKey',
      ]);
      if (setup.exitCode != 0) {
        debugPrint('Hotspot setup failed: ${setup.stderr}');
        return false;
      }

      // First attempt to start.
      var start = await Process.run('netsh', ['wlan', 'start', 'hostednetwork']);
      if (_hotspotStarted(start)) return true;

      // "Not in correct state" usually means the Microsoft Hosted Network
      // Virtual Adapter is disabled in Device Manager — enable it and retry.
      debugPrint('Hosted network start failed — enabling virtual adapter...');
      await Process.run('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        r'Get-PnpDevice -Class Net | '
        r'Where-Object { $_.FriendlyName -match "Hosted Network" } | '
        r'Enable-PnpDevice -Confirm:$false',
      ]);
      // Give Windows a moment to bring the adapter up.
      await Future.delayed(const Duration(seconds: 2));

      start = await Process.run('netsh', ['wlan', 'start', 'hostednetwork']);
      if (_hotspotStarted(start)) return true;

      debugPrint('Hotspot start output: ${start.stdout} ${start.stderr}');
      return false;
    } catch (e) {
      debugPrint('Could not start Windows hotspot: $e');
      return false;
    }
  }

  bool _hotspotStarted(ProcessResult r) =>
      r.exitCode == 0 && r.stdout.toString().toLowerCase().contains('started');

  Future<void> _stopHotspot() async {
    try {
      await Process.run('netsh', ['wlan', 'stop', 'hostednetwork']);
    } catch (_) {}
    _hotspotActive = false;
  }

  @override
  Future<void> initialize() async {
    status = TransferStatus.initializing;
    _port = _defaultPort;
    _hotspotActive = false;

    if (useWindowsHotspot && Platform.isWindows) {
      _hotspotActive = await _startHotspot();
      if (_hotspotActive) {
        _localIp = _hotspotGateway;
        debugPrint('Windows hotspot started — serving at $_hotspotGateway');
      } else {
        debugPrint('Hotspot unavailable, falling back to LAN IP');
      }
    }

    // Fall back to LAN IP discovery if hotspot is off or not on Windows.
    if (!_hotspotActive) {
      try {
        final interfaces = await NetworkInterface.list(
          type: InternetAddressType.IPv4,
          includeLinkLocal: false,
        );
        outer:
        for (final iface in interfaces) {
          for (final addr in iface.addresses) {
            if (!addr.isLoopback) {
              _localIp = addr.address;
              break outer;
            }
          }
        }
      } catch (e) {
        debugPrint('Could not determine local IP: $e');
      }
      _localIp ??= '127.0.0.1';
    }

    status = TransferStatus.idle;
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      _servedFiles.clear();

      // (Re)create a clean temp directory for this session.
      final tmp = await getTemporaryDirectory();
      final servePath = '${tmp.path}${Platform.pathSeparator}docucenter_wifi';
      _serveDir = Directory(servePath);
      if (await _serveDir!.exists()) await _serveDir!.delete(recursive: true);
      await _serveDir!.create(recursive: true);

      // Download each document from the backend and save locally.
      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null || bytes.isEmpty) continue;
        final displayName = doc.originalName.isNotEmpty ? doc.originalName : doc.name;
        await File('${_serveDir!.path}${Platform.pathSeparator}$displayName')
            .writeAsBytes(bytes, flush: true);
        _servedFiles.add(displayName);
        _progress = (i + 1) / documents.length;
      }

      // Bind server; auto-increment port if already in use.
      while (_httpServer == null) {
        try {
          _httpServer = await HttpServer.bind(InternetAddress.anyIPv4, _port);
        } on SocketException {
          _port++;
        }
      }
      _httpServer!.listen(_handleRequest);

      status = TransferStatus.completed;
      return TransferResult(
        success: _servedFiles.isNotEmpty,
        message: 'Web server started at http://$_localIp:$_port/',
        transferredDocumentIds: documents.map((d) => d.id).toList(),
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

  /// Each download request streams the file directly from disk — no bytes
  /// are buffered in memory, so large files don't spike server RAM.
  Future<void> _handleRequest(HttpRequest request) async {
    request.response.headers.set('Access-Control-Allow-Origin', '*');
    final segments = request.uri.pathSegments;

    try {
      if (request.uri.path == '/' || request.uri.path.isEmpty) {
        request.response.headers.contentType = ContentType.html;
        request.response.write(_buildHtmlPage());
        await request.response.close();
      } else if (segments.length == 2 && segments.first == 'download') {
        final filename = Uri.decodeComponent(segments.last);
        final file = File('${_serveDir!.path}${Platform.pathSeparator}$filename');
        if (await file.exists()) {
          request.response.headers.contentType = ContentType.binary;
          request.response.headers.set(
            'Content-Disposition',
            'attachment; filename="${Uri.encodeComponent(filename)}"',
          );
          // Stream from disk directly into the response — zero extra RAM.
          await file.openRead().pipe(request.response);
          // pipe() closes the response sink automatically.
        } else {
          request.response.statusCode = HttpStatus.notFound;
          request.response.write('File not found');
          await request.response.close();
        }
      } else {
        request.response.statusCode = HttpStatus.notFound;
        await request.response.close();
      }
    } catch (e) {
      debugPrint('HTTP handler error: $e');
      try {
        request.response.statusCode = HttpStatus.internalServerError;
        await request.response.close();
      } catch (_) {}
    }
  }

  String _buildHtmlPage() {
    final items = _servedFiles.map((name) {
      final enc = Uri.encodeComponent(name);
      return '<li><a href="/download/$enc">$name</a></li>';
    }).join('\n    ');
    return '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DocuCenter — File Transfer</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:20px;background:#f8fafc}
    h1{color:#2563EB;margin-bottom:4px}
    p{color:#555;margin-top:0}
    ul{list-style:none;padding:0}
    li{margin:10px 0}
    a{display:block;padding:14px 20px;background:#2563EB;color:#fff;text-decoration:none;
       border-radius:10px;font-size:15px;word-break:break-all}
    a:hover{background:#1d4ed8}
  </style>
</head>
<body>
  <h1>DocuCenter</h1>
  <p>Tap a file below to download it to your device.</p>
  <ul>
    $items
  </ul>
</body>
</html>''';
  }

  @override
  double getProgress() => _progress;

  @override
  Future<void> cancel() async {
    status = TransferStatus.cancelled;
    _progress = 0.0;
    await _httpServer?.close(force: true);
    _httpServer = null;
    _servedFiles.clear();
    // Delete the local temp copies so they don't linger on disk.
    if (_serveDir != null && await _serveDir!.exists()) {
      await _serveDir!.delete(recursive: true);
    }
    _serveDir = null;
    if (_hotspotActive) await _stopHotspot();
  }

  @override
  Future<Map<String, String>> getNetworkInfo() async {
    return {'ip': _localIp ?? '127.0.0.1', 'port': _port.toString()};
  }

  @override
  Future<String> generateTransferLink(List<StorageDocument> documents) async {
    return 'http://${_localIp ?? '127.0.0.1'}:$_port/';
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
        transferred.add(documents[i].id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: true,
        message: 'QR session created',
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
  static bool _created = false;

  final USBTransferService usb = USBTransferService();
  final TransferService wifiHotspot;
  final QrCodeTransferService qrCode = QrCodeTransferService();

  TransferManager() :
    wifiHotspot = LocalWebTransferService() {
    debugPrint('=== TransferManager constructor START ===');
    _created = true;
    debugPrint('TransferManager constructor called - Created: $_created');
    debugPrint('WiFi service type: ${wifiHotspot.runtimeType}');
    debugPrint('=== TransferManager constructor END ===');
  }

  /// Initialize all transfer services
  Future<void> initializeAll() async {
    debugPrint('=== TransferManager.initializeAll() START ===');
    debugPrint('TransferManager.initializeAll() called - Created: $_created');
    final services = [
      ('USB', usb),
      ('WiFi Hotspot', wifiHotspot),
      ('QR Code', qrCode),
    ];

    for (final serviceEntry in services) {
      final name = serviceEntry.$1;
      final service = serviceEntry.$2;
      try {
        await service.initialize();
        if (service.status == TransferStatus.failed) {
          debugPrint('$name transfer service unavailable on this hardware');
        } else {
          debugPrint('$name transfer service initialized successfully');
        }
      } catch (e) {
        debugPrint('Failed to initialize $name transfer service: $e');
        // Continue with other services
      }
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

  /// Check if a transfer service is available on this platform
  bool isServiceAvailable(TransferMethod method) {
    switch (method) {
      case TransferMethod.usb:
      case TransferMethod.qrCode:
        return true;
      case TransferMethod.wifiHotspot:
        return Platform.isAndroid || Platform.isWindows;
    }
  }

  /// Get available transfer methods for this platform
  List<TransferMethod> getAvailableMethods() {
    return TransferMethod.values.where((method) => isServiceAvailable(method)).toList();
  }

  TransferService _getService(TransferMethod method) {
    return switch (method) {
      TransferMethod.usb => usb,
      TransferMethod.wifiHotspot => wifiHotspot,
      TransferMethod.qrCode => qrCode,
    };
  }

  /// Clean up all services
  void dispose() {
    usb.dispose();
    wifiHotspot.dispose();
    qrCode.dispose();
  }
}
