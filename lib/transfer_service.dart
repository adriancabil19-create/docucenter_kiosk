import 'dart:io';
import 'dart:async';
import 'dart:ffi';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart' as fb;
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';
import 'package:win32/win32.dart';
import 'package:ffi/ffi.dart' show calloc;
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

  /// Discover available devices (Bluetooth only)
  Future<List<LocalBluetoothDevice>> discoverDevices() async {
    throw UnsupportedError('Device discovery not supported by this service');
  }

  /// Connect to a specific device (Bluetooth only)
  Future<bool> connectToDevice(String deviceAddress, [String? deviceName]) async {
    throw UnsupportedError('Device connection not supported by this service');
  }

  /// Connect to default device (Bluetooth only)
  Future<bool> connectToDefaultDevice() async {
    throw UnsupportedError('Default device connection not supported by this service');
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

/// Bluetooth Transfer Service
class BluetoothTransferService extends TransferService {
  String? _deviceAddress;
  double _progress = 0.0;
  fb.BluetoothDevice? _connectedDevice;

  @override
  Future<void> initialize() async {
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS && !Platform.isLinux && !Platform.isWindows) {
      status = TransferStatus.failed;
      throw Exception('Bluetooth not supported on this platform');
    }

    try {
      status = TransferStatus.initializing;

      if (Platform.isAndroid || Platform.isIOS) {
        if (!await Permission.bluetooth.request().isGranted) {
          status = TransferStatus.failed;
          throw Exception('Bluetooth permission denied');
        }
      }

      final adapterState = await fb.FlutterBluePlus.adapterState.first;
      if (adapterState != fb.BluetoothAdapterState.on) {
        status = TransferStatus.failed;
        throw Exception('Bluetooth is not enabled. Please enable Bluetooth in settings.');
      }

      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    // Check platform support - flutter_blue_plus supports Android, iOS, macOS, Linux
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS && !Platform.isLinux) {
      return TransferResult(
        success: false,
        message: 'Bluetooth not supported on this platform',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }

    try {
      status = TransferStatus.transferring;
      _progress = 0.0;

      if (_connectedDevice == null) {
        final connected = await connectToDefaultDevice();
        if (!connected) {
          status = TransferStatus.failed;
          return TransferResult(
            success: false,
            message: 'No system Bluetooth device available',
            transferredDocumentIds: [],
            timestamp: DateTime.now(),
          );
        }
      }

      final transferred = <String>[];

      // discover services and characteristics
      final services = await _connectedDevice!.discoverServices();
      fb.BluetoothCharacteristic? writeChar;

      for (var service in services) {
        for (var char in service.characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
        if (writeChar != null) break;
      }

      if (writeChar == null) {
        status = TransferStatus.failed;
        return TransferResult(
          success: false,
          message: 'No writable Bluetooth characteristic found',
          transferredDocumentIds: [],
          timestamp: DateTime.now(),
        );
      }

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null || bytes.isEmpty) {
          continue;
        }

        const chunkSize = 512;
        for (var offset = 0; offset < bytes.length; offset += chunkSize) {
          final end = (offset + chunkSize < bytes.length) ? offset + chunkSize : bytes.length;
          await writeChar.write(bytes.sublist(offset, end), withoutResponse: true);
          await Future.delayed(const Duration(milliseconds: 20));
        }

        transferred.add(doc.id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: transferred.isNotEmpty,
        message: transferred.isNotEmpty
            ? 'Bluetooth transfer to default device (${_deviceAddress ?? 'unknown'}) completed'
            : 'No documents were transferred',
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

  @override
  Future<List<LocalBluetoothDevice>> discoverDevices() async {
    // Check platform support - flutter_blue_plus supports Android, iOS, macOS, Linux, Windows
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS && !Platform.isLinux && !Platform.isWindows) {
      throw Exception('Bluetooth not supported on this platform');
    }

    final List<LocalBluetoothDevice> devices = [];
    final List<fb.ScanResult> results = [];

    final subscription = fb.FlutterBluePlus.scanResults.listen((list) {
      results.clear();
      results.addAll(list);
    });

    fb.FlutterBluePlus.startScan(timeout: const Duration(seconds: 4));
    await Future.delayed(const Duration(seconds: 5));
    await subscription.cancel();
    await fb.FlutterBluePlus.stopScan();

    for (var result in results) {
      final id = result.device.remoteId.str;
      final name = result.device.platformName.isNotEmpty
          ? result.device.platformName
          : 'Unknown Device';
      devices.add(LocalBluetoothDevice(address: id, name: name));
    }

    return devices;
  }

  /// Connect to a specific device. Returns true on success.
  @override
  Future<bool> connectToDevice(String deviceAddress, [String? deviceName]) async {
    // Check platform support - flutter_blue_plus supports Android, iOS, macOS, Linux, Windows
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS && !Platform.isLinux && !Platform.isWindows) {
      throw Exception('Bluetooth not supported on this platform');
    }

    try {
      status = TransferStatus.initializing;

      List<fb.ScanResult> currentResults = [];
      final subscription = fb.FlutterBluePlus.scanResults.listen((list) {
        currentResults = list;
      });
      fb.FlutterBluePlus.startScan(timeout: const Duration(seconds: 4));
      await Future.delayed(const Duration(seconds: 5));
      await subscription.cancel();
      await fb.FlutterBluePlus.stopScan();

      final found = currentResults.firstWhere(
        (r) => r.device.remoteId.str == deviceAddress,
        orElse: () => throw Exception('Device not found'),
      );

      _connectedDevice = found.device;
      _deviceAddress = deviceAddress;

      await _connectedDevice!.connect(timeout: const Duration(seconds: 10));
      await _connectedDevice!.discoverServices();

      status = TransferStatus.idle;
      return true;
    } catch (e) {
      status = TransferStatus.failed;
      return false;
    }
  }

  /// Connect to the default system Bluetooth device (first available)
  @override
  Future<bool> connectToDefaultDevice() async {
    final devices = await discoverDevices();
    if (devices.isEmpty) return false;
    return connectToDevice(devices.first.address, devices.first.name);
  }

  Future<void> disconnect() async {
    _deviceAddress = null;
    status = TransferStatus.idle;
  }
}

/// Windows Bluetooth Transfer Service
/// Uses Win32 API to enumerate paired/nearby devices, then opens the Windows
/// "Send a File via Bluetooth" wizard (bthprops.cpl) for each file.
class WindowsBluetoothTransferService extends TransferService {
  String? _deviceAddress;
  double _progress = 0.0;

  @override
  Future<void> initialize() async {
    if (!Platform.isWindows) {
      status = TransferStatus.failed;
      throw Exception('Windows Bluetooth not supported on this platform');
    }
    // Win32 discovery is used directly — no WinBle/BLE server needed.
    status = TransferStatus.idle;
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    if (!Platform.isWindows) {
      return TransferResult(
        success: false,
        message: 'Windows Bluetooth not supported on this platform',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }

    if (_deviceAddress == null) {
      return TransferResult(
        success: false,
        message: 'No Bluetooth device selected. Scan and connect first.',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }

    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      final transferred = <String>[];

      final baseDir = await getApplicationDocumentsDirectory();
      final exportDir = Directory('${baseDir.path}${Platform.pathSeparator}Bluetooth_Transfer');
      if (!await exportDir.exists()) {
        await exportDir.create(recursive: true);
      }

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null) continue;

        final fileName = doc.originalName.isNotEmpty ? doc.originalName : doc.name;
        final outFile = File('${exportDir.path}${Platform.pathSeparator}$fileName');
        await outFile.writeAsBytes(bytes, flush: true);

        // Open the Windows Bluetooth Send File wizard non-blocking.
        // bthprops.cpl,BluetoothSendFile receives the file path as lpszCmdLine.
        await Process.start(
          'rundll32.exe',
          ['bthprops.cpl,BluetoothSendFile', outFile.path],
          runInShell: false,
        );

        transferred.add(doc.id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: transferred.isNotEmpty,
        message: transferred.isNotEmpty
            ? 'Bluetooth send wizard opened for ${transferred.length} file(s). '
              'Select the target device in each dialog to complete the transfer.'
            : 'No documents could be downloaded for transfer',
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

  @override
  Future<List<LocalBluetoothDevice>> discoverDevices() async {
    if (!Platform.isWindows) {
      throw Exception('Windows Bluetooth not supported on this platform');
    }

    final devices = <LocalBluetoothDevice>[];

    final searchParams = calloc<BLUETOOTH_DEVICE_SEARCH_PARAMS>();
    searchParams.ref.dwSize = sizeOf<BLUETOOTH_DEVICE_SEARCH_PARAMS>();
    searchParams.ref.fReturnAuthenticated = TRUE;
    searchParams.ref.fReturnRemembered = TRUE;
    searchParams.ref.fReturnUnknown = TRUE;
    searchParams.ref.fReturnConnected = TRUE;
    searchParams.ref.fIssueInquiry = TRUE;
    searchParams.ref.cTimeoutMultiplier = 4;

    final deviceInfo = calloc<BLUETOOTH_DEVICE_INFO>();
    deviceInfo.ref.dwSize = sizeOf<BLUETOOTH_DEVICE_INFO>();

    final hFind = BluetoothFindFirstDevice(searchParams, deviceInfo);
    if (hFind == NULL) {
      calloc.free(searchParams);
      calloc.free(deviceInfo);
      // No devices found — return empty list instead of throwing.
      return devices;
    }

    try {
      do {
        final address = deviceInfo.ref.Address.ullLong;
        final hex = address.toRadixString(16).padLeft(12, '0').toUpperCase();
        final formattedAddress =
            '${hex.substring(0, 2)}:${hex.substring(2, 4)}:'
            '${hex.substring(4, 6)}:${hex.substring(6, 8)}:'
            '${hex.substring(8, 10)}:${hex.substring(10, 12)}';
        final name = deviceInfo.ref.szName.replaceAll('\x00', '').trim();
        devices.add(LocalBluetoothDevice(
          address: formattedAddress,
          name: name.isNotEmpty ? name : 'Unknown Device',
        ));
      } while (BluetoothFindNextDevice(hFind, deviceInfo) != FALSE);
    } finally {
      BluetoothFindDeviceClose(hFind);
      calloc.free(searchParams);
      calloc.free(deviceInfo);
    }

    return devices;
  }

  @override
  Future<bool> connectToDevice(String deviceAddress, [String? deviceName]) async {
    if (!Platform.isWindows) return false;
    _deviceAddress = deviceAddress;
    status = TransferStatus.idle;
    debugPrint('BT device selected: $deviceAddress (${deviceName ?? '?'})');
    return true;
  }

  @override
  Future<bool> connectToDefaultDevice() async {
    final devices = await discoverDevices();
    if (devices.isEmpty) return false;
    return connectToDevice(devices.first.address, devices.first.name);
  }

  @override
  void dispose() {
    _deviceAddress = null;
    super.dispose();
  }
}

/// Local-network web transfer service.
/// Downloads files once to a temp directory, then serves them from disk via an
/// HTTP server. The QR code from [generateTransferLink] lets a nearby phone
/// open the download page without needing a hotspot — just the same LAN.
/// Serving from disk means no file bytes are held in RAM between requests.
class LocalWebTransferService extends TransferService {
  static const int _defaultPort = 8888;
  int _port = _defaultPort;
  double _progress = 0.0;
  HttpServer? _httpServer;
  /// Temp directory that holds the locally saved copies of the transferred files.
  Directory? _serveDir;
  final List<String> _servedFiles = [];
  String? _localIp;

  @override
  Future<void> initialize() async {
    status = TransferStatus.initializing;
    _port = _defaultPort;

    // Discover LAN IP.
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
  final TransferService bluetooth;
  final TransferService wifiHotspot;
  final QrCodeTransferService qrCode = QrCodeTransferService();

  TransferManager() :
    bluetooth = WindowsBluetoothTransferService(),
    wifiHotspot = LocalWebTransferService() {
    debugPrint('=== TransferManager constructor START ===');
    _created = true;
    debugPrint('TransferManager constructor called - Created: $_created');
    debugPrint('Bluetooth service type: ${bluetooth.runtimeType}');
    debugPrint('WiFi service type: ${wifiHotspot.runtimeType}');
    debugPrint('=== TransferManager constructor END ===');
  }

  /// Initialize all transfer services
  Future<void> initializeAll() async {
    debugPrint('=== TransferManager.initializeAll() START ===');
    debugPrint('TransferManager.initializeAll() called - Created: $_created');
    final services = [
      ('USB', usb),
      ('Bluetooth', bluetooth),
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

  /// Get service for transfer method
  /// Check if a transfer service is available on this platform
  bool isServiceAvailable(TransferMethod method) {
    switch (method) {
      case TransferMethod.usb:
      case TransferMethod.qrCode:
        return true; // Always available
      case TransferMethod.bluetooth:
        return Platform.isAndroid || Platform.isIOS || Platform.isMacOS || Platform.isLinux || Platform.isWindows;
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

/// Local Bluetooth Device wrapper
class LocalBluetoothDevice {
  final String address;
  final String name;
  final bool isConnected;

  LocalBluetoothDevice({
    required this.address,
    required this.name,
    this.isConnected = false,
  });

  @override
  String toString() => '$name ($address)';
}
