import 'dart:io';
import 'dart:async';
import 'dart:ffi';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart' as fb;
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:wifi_iot/wifi_iot.dart';
import 'package:win_ble/win_ble.dart';
import 'package:win_ble/win_file.dart';
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
    // Check platform support - flutter_blue_plus supports Android, iOS, macOS, Linux
    if (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS && !Platform.isLinux && !Platform.isWindows) {
      status = TransferStatus.failed;
      throw Exception('Bluetooth not supported on this platform - REGULAR SERVICE');
    }

    try {
      status = TransferStatus.initializing;

      if (!await Permission.bluetooth.request().isGranted) {
        status = TransferStatus.failed;
        throw Exception('Bluetooth permission denied');
      }

      // Check if Bluetooth is available and enabled
      if (!await fb.FlutterBluePlus.isAvailable) {
        status = TransferStatus.failed;
        throw Exception('Bluetooth not available on this device');
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

    await fb.FlutterBluePlus.startScan(timeout: const Duration(seconds: 4)); // wait for scan to complete
    await subscription.cancel();

    for (var result in results) {
      devices.add(LocalBluetoothDevice(address: result.device.id.id, name: result.device.name));
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

      // First scan if no recent results
      List<fb.ScanResult> currentResults = [];
      final subscription = fb.FlutterBluePlus.scanResults.listen((list) {
        currentResults = list;
      });
      if (currentResults.isEmpty) {
        await fb.FlutterBluePlus.startScan(timeout: const Duration(seconds: 4)); // wait for scan to complete
        await subscription.cancel();
      } else {
        await subscription.cancel();
      }

      final results = currentResults;
      final found = results.firstWhere(
        (r) => r.device.id.id == deviceAddress,
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

/// Windows Bluetooth Transfer Service (using win_ble)
class WindowsBluetoothTransferService extends TransferService {
  String? _deviceAddress;
  double _progress = 0.0;
  final Map<String, BleDevice> _discoveredDevices = {};
  StreamSubscription? _scanSubscription;
  StreamSubscription? _connectionSubscription;

  @override
  Future<void> initialize() async {
    debugPrint('WindowsBluetoothTransferService.initialize() called');
    try {
      status = TransferStatus.initializing;

      // Windows Bluetooth is only supported on Windows
      if (!Platform.isWindows) {
        status = TransferStatus.failed;
        throw Exception('Windows Bluetooth not supported on this platform - WRONG SERVICE USED');
      }

      // Initialize win_ble
      await WinBle.initialize(serverPath: await WinServer.path());
      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    // Windows Bluetooth is only supported on Windows
    if (!Platform.isWindows) {
      return TransferResult(
        success: false,
        message: 'Windows Bluetooth not supported on this platform',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }

    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      final transferred = <String>[];

      // For classic Bluetooth, export files to a folder for manual transfer
      final baseDir = await getApplicationDocumentsDirectory();
      final exportDir = Directory('${baseDir.path}${Platform.pathSeparator}Bluetooth_Transfer');
      if (!await exportDir.exists()) {
        await exportDir.create(recursive: true);
      }

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null) {
          continue;
        }

        final fileName = doc.originalName.isNotEmpty ? doc.originalName : doc.name;
        final outFile = File('${exportDir.path}${Platform.pathSeparator}$fileName');
        await outFile.writeAsBytes(bytes, flush: true);
        // Open Bluetooth send dialog for the file
        final result = await Process.run('rundll32.exe', ['bthprops.cpl,BluetoothSendFile', outFile.path]);
        debugPrint('Bluetooth send result: ${result.exitCode} ${result.stdout} ${result.stderr}');
        transferred.add(doc.id);
        _progress = (i + 1) / documents.length;
      }

      status = TransferStatus.completed;
      return TransferResult(
        success: transferred.isNotEmpty,
        message: transferred.isNotEmpty
            ? 'Files prepared for Bluetooth transfer. Sending dialogs have opened for each file. Select the device and send.'
            : 'No documents were exported',
        transferredDocumentIds: transferred,
        timestamp: DateTime.now(),
      );
    } catch (e) {
      status = TransferStatus.failed;
      return TransferResult(
        success: false,
        message: 'Bluetooth export failed: $e',
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
    // Windows Bluetooth is only supported on Windows
    if (!Platform.isWindows) {
      throw Exception('Windows Bluetooth not supported on this platform');
    }

    final devices = <LocalBluetoothDevice>[];

    // Use win32 to enumerate Bluetooth devices
    final searchParams = calloc<BLUETOOTH_DEVICE_SEARCH_PARAMS>();
    searchParams.ref.dwSize = sizeOf<BLUETOOTH_DEVICE_SEARCH_PARAMS>();
    searchParams.ref.fReturnAuthenticated = TRUE;
    searchParams.ref.fReturnRemembered = TRUE;
    searchParams.ref.fReturnUnknown = TRUE;
    searchParams.ref.fReturnConnected = TRUE;
    searchParams.ref.fIssueInquiry = TRUE;
    searchParams.ref.cTimeoutMultiplier = 5;

    final deviceInfo = calloc<BLUETOOTH_DEVICE_INFO>();
    deviceInfo.ref.dwSize = sizeOf<BLUETOOTH_DEVICE_INFO>();

    final hFind = BluetoothFindFirstDevice(searchParams, deviceInfo);
    if (hFind == NULL) {
      calloc.free(searchParams);
      calloc.free(deviceInfo);
      throw Exception('Failed to start Bluetooth device search');
    }

    do {
      final address = deviceInfo.ref.Address.ullLong;
      final addressStr = address.toRadixString(16).padLeft(12, '0').toUpperCase();
      final formattedAddress = '${addressStr.substring(0, 2)}:${addressStr.substring(2, 4)}:${addressStr.substring(4, 6)}:${addressStr.substring(6, 8)}:${addressStr.substring(8, 10)}:${addressStr.substring(10, 12)}';
      final name = deviceInfo.ref.szName.replaceAll('\x00', '').trim();
      debugPrint('Bluetooth Device found - Address: $formattedAddress, Name: "$name"');
      devices.add(LocalBluetoothDevice(
        address: formattedAddress,
        name: name.isNotEmpty ? name : 'Unknown Device',
      ));
    } while (BluetoothFindNextDevice(hFind, deviceInfo) != FALSE);

    BluetoothFindDeviceClose(hFind);
    calloc.free(searchParams);
    calloc.free(deviceInfo);

    return devices;
  }

  String getDeviceName(String address) {
    final device = _discoveredDevices[address];
    if (device != null && device.name.isNotEmpty && device.name != 'N/A') {
      return device.name;
    }
    return address;
  }

  Future<String?> _fetchGattDeviceName(String address) async {
    try {
      debugPrint('Fetching GATT name for $address');
      final services = await WinBle.discoverServices(address);
      debugPrint('Services for $address: $services');
      final gattService = services.firstWhere(
        (s) => s.toLowerCase().contains('1800'),
        orElse: () => '',
      );
      debugPrint('GATT service for $address: $gattService');
      if (gattService.isEmpty) return null;

      final characteristics = await WinBle.discoverCharacteristics(
        address: address,
        serviceId: gattService,
      );
      debugPrint('Characteristics for $address: $characteristics');

      final propertyChars = characteristics.where((c) => c.uuid.toLowerCase().contains('2a00')).toList();
      debugPrint('Name chars for $address: $propertyChars');
      if (propertyChars.isEmpty) return null;
      final nameChar = propertyChars.first;

      final data = await WinBle.read(
        address: address,
        serviceId: gattService,
        characteristicId: nameChar.uuid,
      );
      debugPrint('Data for $address: $data');
      if (data.isEmpty) return null;
      final name = String.fromCharCodes(data).trim();
      debugPrint('Decoded name for $address: "$name"');
      return name;
    } catch (e) {
      debugPrint('Exception fetching GATT name for $address: $e');
      return null;
    }
  }

  /// Connect to a specific device. Returns true on success.
  @override
  Future<bool> connectToDevice(String deviceAddress, [String? deviceName]) async {
    if (!Platform.isWindows) {
      throw Exception('Windows Bluetooth not supported on this platform');
    }

    try {
      status = TransferStatus.initializing;
      _deviceAddress = deviceAddress;
      status = TransferStatus.idle;
      debugPrint('Bluetooth device selected: $deviceAddress (${deviceName ?? 'unknown'})');
      return true;
    } catch (e) {
      debugPrint('Bluetooth connect failed: $e');
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
    if (_deviceAddress != null) {
      await WinBle.disconnect(_deviceAddress!);
      await _connectionSubscription?.cancel();
      _connectionSubscription = null;
    }
    _deviceAddress = null;
    status = TransferStatus.idle;
  }

  @override
  Future<void> dispose() async {
    await disconnect();
    await _scanSubscription?.cancel();
    WinBle.dispose();
    super.dispose();
  }
}

/// Windows WiFi Hotspot Transfer Service
class WindowsWiFiHotspotTransferService extends TransferService {
  static const int defaultPort = 8888;
  static const String _ssid = 'DocuCenter';
  static const String _passphrase = 'DocuCenter123';
  String? _hotspotName;
  String _hotspotKey = _passphrase;
  bool _hostedNetworkSupported = false;
  bool _mobileHotspotActive = false;
  late int _port;
  double _progress = 0.0;
  HttpServer? _httpServer;
  final Map<String, List<int>> _fileCache = {};
  Process? _hotspotProcess;

  Future<bool> _isHostedNetworkSupported() async {
    try {
      final result = await Process.run('netsh', ['wlan', 'show', 'drivers']);
      if (result.exitCode != 0) return false;
      final output = result.stdout.toString();
      return output.contains('Hosted network supported  : Yes');
    } catch (e) {
      return false;
    }
  }

  /// Start Windows Mobile Hotspot via WinRT PowerShell.
  /// Works on modern adapters where netsh hostednetwork is unsupported.
  Future<bool> _startWindowsMobileHotspot() async {
    try {
      const script = r'''
[void][Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking,ContentType=WindowsRuntime]
$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($profile -eq $null) { Write-Error "No internet profile found"; exit 1 }
$mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
$cfg = New-Object Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration
$cfg.Ssid = "DocuCenter"
$cfg.Passphrase = "DocuCenter123"
$mgr.ConfigureAccessPointAsync($cfg).AsTask().Wait()
$result = $mgr.StartTetheringAsync().AsTask().Result
Write-Output "OK"
''';
      final proc = await Process.run(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', script],
      );
      final ok = proc.stdout.toString().trim() == 'OK';
      if (!ok) {
        debugPrint('Mobile hotspot PowerShell output: ${proc.stdout} ${proc.stderr}');
      }
      return ok;
    } catch (e) {
      debugPrint('Mobile hotspot start failed: $e');
      return false;
    }
  }

  /// Stop Windows Mobile Hotspot.
  Future<void> _stopWindowsMobileHotspot() async {
    try {
      const script = r'''
[void][Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]
[void][Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking,ContentType=WindowsRuntime]
$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($profile -ne $null) {
  $mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
  $mgr.StopTetheringAsync().AsTask().Wait()
}
''';
      await Process.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
    } catch (e) {
      debugPrint('Mobile hotspot stop failed: $e');
    }
  }

  /// Get the IP address assigned to the Mobile Hotspot virtual adapter.
  Future<String?> _getMobileHotspotIP() async {
    try {
      final result = await Process.run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        r"Get-NetIPAddress -AddressFamily IPv4 | Where-Object { (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).InterfaceDescription -like 'Microsoft Wi-Fi Direct Virtual Adapter*' } | Select-Object -ExpandProperty IPAddress -First 1",
      ]);
      final ip = result.stdout.toString().trim();
      return ip.isNotEmpty ? ip : null;
    } catch (e) {
      debugPrint('Could not get mobile hotspot IP: $e');
      return null;
    }
  }

  @override
  Future<void> initialize() async {
    if (!Platform.isWindows) {
      status = TransferStatus.failed;
      throw Exception('Windows WiFi hotspot not supported on this platform');
    }

    status = TransferStatus.initializing;
    _port = defaultPort;
    _hotspotName = _ssid;
    _hotspotKey = _passphrase;
    _mobileHotspotActive = false;

    // 1. Try legacy hosted network (older adapters)
    _hostedNetworkSupported = await _isHostedNetworkSupported();
    if (_hostedNetworkSupported) {
      final started = await _startWindowsHostedNetwork();
      if (started) {
        debugPrint('WiFi hosted network started (SSID: $_ssid)');
        status = TransferStatus.idle;
        return;
      }
      debugPrint('netsh hostednetwork start failed despite being reported as supported');
    }

    // 2. Try Windows Mobile Hotspot (modern adapters — Windows 10/11)
    debugPrint('Trying Windows Mobile Hotspot (WinRT)...');
    final mobileOk = await _startWindowsMobileHotspot();
    if (mobileOk) {
      _mobileHotspotActive = true;
      debugPrint('Windows Mobile Hotspot started (SSID: $_ssid, pass: $_passphrase)');
      status = TransferStatus.idle;
      return;
    }

    // 3. Fall back to existing LAN — phone must be on same network
    debugPrint('No hotspot available — using existing LAN IP. Phone must be on the same network.');
    status = TransferStatus.idle;
  }

  Future<bool> _startWindowsHostedNetwork() async {
    try {
      final setResult = await Process.run('netsh', [
        'wlan',
        'set',
        'hostednetwork',
        'mode=allow',
        'ssid=$_hotspotName',
        'key=$_hotspotKey',
      ]);

      if (setResult.exitCode != 0) {
        debugPrint('netsh set hostednetwork failed: ${setResult.stderr}');
        return false;
      }

      final startResult = await Process.run('netsh', [
        'wlan',
        'start',
        'hostednetwork',
      ]);

      if (startResult.exitCode != 0) {
        debugPrint('netsh start hostednetwork failed: ${startResult.stderr}');
        return false;
      }

      return true;
    } catch (e) {
      debugPrint('Error starting Windows hosted network: $e');
      return false;
    }
  }

  Future<bool> _stopWindowsHostedNetwork() async {
    try {
      final stopResult = await Process.run('netsh', [
        'wlan',
        'stop',
        'hostednetwork',
      ]);

      return stopResult.exitCode == 0;
    } catch (e) {
      debugPrint('Error stopping Windows hosted network: $e');
      return false;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    // Windows WiFi hotspot is only supported on Windows
    if (!Platform.isWindows) {
      return TransferResult(
        success: false,
        message: 'Windows WiFi hotspot not supported on this platform',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }

    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      _fileCache.clear();

      // Try to start hosted network only if the adapter supports it
      if (_hostedNetworkSupported) {
        final started = await _startWindowsHostedNetwork();
        if (!started) {
          debugPrint('Hosted network start failed — using existing LAN IP');
        }
      }

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null || bytes.isEmpty) continue;

        _fileCache[doc.originalName.isNotEmpty ? doc.originalName : doc.name] = bytes;
        _progress = (i + 1) / documents.length;
      }

      _httpServer ??= await HttpServer.bind(InternetAddress.anyIPv4, _port);
      _httpServer!.listen((HttpRequest request) {
        final path = request.uri.pathSegments.isNotEmpty ? request.uri.pathSegments.last : '';
        if (_fileCache.containsKey(path)) {
          request.response.headers.contentType = ContentType.binary;
          request.response.add(_fileCache[path]!);
          request.response.close();
        } else if (request.uri.path == '/files') {
          request.response.headers.contentType = ContentType.json;
          request.response.write(_fileCache.keys.toList());
          request.response.close();
        } else {
          request.response.statusCode = HttpStatus.notFound;
          request.response.close();
        }
      });

      final runMsg = 'Windows WiFi hotspot HTTP server started on port $_port, available files: ${_fileCache.keys.join(', ')}';
      status = TransferStatus.completed;
      return TransferResult(
        success: _fileCache.isNotEmpty,
        message: runMsg,
        transferredDocumentIds: documents.where((d) => _fileCache.containsKey(d.originalName.isNotEmpty ? d.originalName : d.name)).map((d) => d.id).toList(),
        timestamp: DateTime.now(),
      );
    } catch (e) {
      status = TransferStatus.failed;
      return TransferResult(
        success: false,
        message: 'Windows WiFi transfer failed: $e',
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
    await _httpServer?.close(force: true);
    _httpServer = null;
    _fileCache.clear();

    // Stop hosted network when transfer is cancelled
    await _stopWindowsHostedNetwork();
    _hotspotProcess?.kill();
    _hotspotProcess = null;
  }

  @override
  Future<Map<String, String>> getNetworkInfo() async {
    if (!Platform.isWindows) {
      return {
        'ip': '',
        'hostname': 'webdoc-device',
        'port': _port.toString(),
      };
    }

    String? ip;
    String hostname;

    if (_hostedNetworkSupported) {
      // Hotspot active — use the hotspot IP (Windows default: 192.168.137.1)
      ip = await NetworkInfo().getWifiIP() ?? '192.168.137.1';
      hostname = _hotspotName ?? 'WebDocHotspot';
    } else {
      // No hotspot — find the machine's current LAN IPv4 address
      try {
        final interfaces = await NetworkInterface.list(
          type: InternetAddressType.IPv4,
          includeLinkLocal: false,
        );
        for (final iface in interfaces) {
          for (final addr in iface.addresses) {
            if (!addr.isLoopback) {
              ip = addr.address;
              break;
            }
          }
          if (ip != null) break;
        }
      } catch (e) {
        debugPrint('Could not determine LAN IP: $e');
      }
      ip ??= '127.0.0.1';
      hostname = Platform.localHostname;
    }

    return {
      'ip': ip,
      'hostname': hostname,
      'port': _port.toString(),
    };
  }

  @override
  Future<String> generateTransferLink(List<StorageDocument> documents) async {
    final info = await getNetworkInfo();
    return 'http://${info['ip']}:${info['port']}/files';
  }

  void setPort(int port) {
    _port = port;
  }
}

/// WiFi Hotspot Transfer Service
class WiFiHotspotTransferService extends TransferService {
  static const int defaultPort = 8888;
  String? _hotspotName;
  late int _port;
  double _progress = 0.0;
  HttpServer? _httpServer;
  final Map<String, List<int>> _fileCache = {};

  @override
  Future<void> initialize() async {
    // WiFi hotspot is only supported on Android
    if (!Platform.isAndroid) {
      status = TransferStatus.failed;
      throw Exception('WiFi hotspot not supported on this platform');
    }

    try {
      status = TransferStatus.initializing;
      _port = defaultPort;

      final wifiEnabled = await WiFiForIoTPlugin.isEnabled();
      if (!wifiEnabled) {
        final enabled = await WiFiForIoTPlugin.setEnabled(true);
        if (!enabled) {
          status = TransferStatus.failed;
          throw Exception('Failed to enable WiFi');
        }
      }

      _hotspotName = await NetworkInfo().getWifiName();
      status = TransferStatus.idle;
    } catch (e) {
      status = TransferStatus.failed;
      rethrow;
    }
  }

  @override
  Future<TransferResult> startTransfer(List<StorageDocument> documents) async {
    // WiFi hotspot is only supported on Android
    if (!Platform.isAndroid) {
      return TransferResult(
        success: false,
        message: 'WiFi hotspot not supported on this platform',
        transferredDocumentIds: [],
        timestamp: DateTime.now(),
      );
    }

    try {
      status = TransferStatus.transferring;
      _progress = 0.0;
      _fileCache.clear();

      final networkInfo = await getNetworkInfo();
      if (networkInfo['ip'] == null || networkInfo['ip']!.isEmpty) {
        status = TransferStatus.failed;
        return TransferResult(
          success: false,
          message: 'No network info available from default WiFi hotspot',
          transferredDocumentIds: [],
          timestamp: DateTime.now(),
        );
      }

      for (int i = 0; i < documents.length; i++) {
        final doc = documents[i];
        final bytes = await StorageService.downloadFile(doc.name);
        if (bytes == null || bytes.isEmpty) continue;

        _fileCache[doc.originalName.isNotEmpty ? doc.originalName : doc.name] = bytes;
        _progress = (i + 1) / documents.length;
      }

      _httpServer ??= await HttpServer.bind(InternetAddress.anyIPv4, _port);
      _httpServer!.listen((HttpRequest request) {
        final path = request.uri.pathSegments.isNotEmpty ? request.uri.pathSegments.last : '';
        if (_fileCache.containsKey(path)) {
          request.response.headers.contentType = ContentType.binary;
          request.response.add(_fileCache[path]!);
          request.response.close();
        } else if (request.uri.path == '/files') {
          request.response.headers.contentType = ContentType.json;
          request.response.write(_fileCache.keys.toList());
          request.response.close();
        } else {
          request.response.statusCode = HttpStatus.notFound;
          request.response.close();
        }
      });

      final runMsg = 'WiFi hotspot HTTP server started on ${networkInfo['ip']}:$_port, available files: ${_fileCache.keys.join(', ')}';
      status = TransferStatus.completed;
      return TransferResult(
        success: _fileCache.isNotEmpty,
        message: runMsg,
        transferredDocumentIds: documents.where((d) => _fileCache.containsKey(d.originalName.isNotEmpty ? d.originalName : d.name)).map((d) => d.id).toList(),
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
    await _httpServer?.close(force: true);
    _httpServer = null;
    _fileCache.clear();
  }

  @override
  Future<Map<String, String>> getNetworkInfo() async {
    // WiFi hotspot is only supported on Android
    if (!Platform.isAndroid) {
      return {
        'ip': '',
        'hostname': 'webdoc-device',
        'port': _port.toString(),
      };
    }

    final info = await NetworkInfo().getWifiIP();
    final name = _hotspotName ?? await NetworkInfo().getWifiName();
    return {
      'ip': info ?? '',
      'hostname': name ?? 'webdoc-device',
      'port': _port.toString(),
    };
  }

  @override
  Future<String> generateTransferLink(List<StorageDocument> documents) async {
    final info = await getNetworkInfo();
    return 'http://${info['ip']}:${info['port']}/files';
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
  static bool _created = false;
  
  final USBTransferService usb = USBTransferService();
  final TransferService bluetooth;
  final TransferService wifiHotspot;
  final QrCodeTransferService qrCode = QrCodeTransferService();

  TransferManager() :
    bluetooth = WindowsBluetoothTransferService(),
    wifiHotspot = WindowsWiFiHotspotTransferService() {
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
