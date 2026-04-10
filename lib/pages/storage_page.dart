import 'package:flutter/material.dart';
import 'package:file_selector/file_selector.dart';
import '../storage_service.dart';
import '../transfer_service.dart';

class StorageInterface extends StatefulWidget {
  final List<StorageDocument> documents;
  final Function(String) onDelete;
  final Function(StorageDocument) onPrint;
  final Function(List<StorageDocument>) onSelectForPrint;
  final bool printingMode;
  final Function() onCancelPrintMode;
  final Function()? onUpload;
  final TransferManager? transferManager;

  const StorageInterface({
    super.key,
    required this.documents,
    required this.onDelete,
    required this.onPrint,
    required this.onSelectForPrint,
    required this.printingMode,
    required this.onCancelPrintMode,
    this.onUpload,
    this.transferManager,
  });

  @override
  State<StorageInterface> createState() => _StorageInterfaceState();
}

class _StorageInterfaceState extends State<StorageInterface> {
  final Set<String> _selectedDocs = {};
  bool _isLoading = false;

  List<LocalBluetoothDevice> _bluetoothDevices = [];
  LocalBluetoothDevice? _connectedBluetoothDevice;
  bool _isBluetoothScanning = false;

  bool _isWifiActive = false;
  String _wifiStatusMessage = 'WiFi hotspot not initialized';

  Future<void> _refreshDocuments() async {
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(milliseconds: 500));
    widget.onUpload?.call();
    setState(() => _isLoading = false);
  }

  Future<void> _scanBluetoothDevices() async {
    if (widget.transferManager == null) return;
    setState(() {
      _isBluetoothScanning = true;
      _bluetoothDevices = [];
    });
    try {
      final devices = await widget.transferManager!.bluetooth.discoverDevices();
      setState(() {
        _bluetoothDevices = devices;
      });
      if (devices.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No Bluetooth devices found')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Bluetooth scan failed: $e')));
    } finally {
      setState(() => _isBluetoothScanning = false);
    }
  }

  Future<void> _connectBluetoothDevice(LocalBluetoothDevice device) async {
    if (widget.transferManager == null) return;

    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Connecting to ${device.name}...')));
    final ok = await widget.transferManager!.bluetooth.connectToDevice(device.address, device.name);
    if (ok) {
      String displayName = device.name;
      if (widget.transferManager!.bluetooth is WindowsBluetoothTransferService) {
        final winService = widget.transferManager!.bluetooth as WindowsBluetoothTransferService;
        displayName = winService.getDeviceName(device.address);
      }

      setState(() {
        _connectedBluetoothDevice = LocalBluetoothDevice(address: device.address, name: displayName, isConnected: true);
      });

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Connected to $displayName')));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to connect to ${device.name}')));
    }
  }

  Future<void> _initWifiHotspot() async {
    if (widget.transferManager == null) return;
    setState(() {
      _wifiStatusMessage = 'Initializing Wifi hotspot...';
    });

    try {
      await widget.transferManager!.wifiHotspot.initialize();
      final info = await widget.transferManager!.wifiHotspot.getNetworkInfo();
      setState(() {
        _isWifiActive = true;
        _wifiStatusMessage = 'Hotspot active on ${info['hostname']} (${info['ip']})';
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_wifiStatusMessage)));
    } catch (e) {
      setState(() {
        _isWifiActive = false;
        _wifiStatusMessage = 'Wifi hotspot init failed: $e';
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_wifiStatusMessage)));
    }
  }

  Future<void> _startWifiTransfer() async {
    if (widget.transferManager == null) return;
    setState(() {
      _isLoading = true;
    });

    final selectedDocs = _selectedDocs.isNotEmpty
        ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
        : widget.documents;
    final result = await widget.transferManager!.transferDocuments(TransferMethod.wifiHotspot, selectedDocs);
    setState(() {
      _isLoading = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));
  }

  Future<void> _importFromUSB() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      messenger.showSnackBar(const SnackBar(content: Text('Selecting files from USB...')));
      final paths = await openFiles();
      if (paths.isEmpty) return;
      int uploaded = 0;
      for (final xFile in paths) {
        try {
          final bytes = await xFile.readAsBytes();
          final mimeType = StorageService.getMimeType(xFile.name);
          final doc = await StorageService.uploadFile(xFile.path, bytes, xFile.name, mimeType);
          if (doc != null) uploaded++;
        } catch (e) {
          debugPrint('Failed to upload file: $e');
        }
      }
      messenger.showSnackBar(SnackBar(content: Text('Imported $uploaded file(s) from USB')));
      widget.onUpload?.call();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('USB import failed: $e')));
    }
  }

  Future<void> _exportToUSB() async {
    if (widget.transferManager == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer manager not available')));
      return;
    }

    final docsToTransfer = widget.documents.where((d) => _selectedDocs.contains(d.id)).toList();
    if (docsToTransfer.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select document(s) to export to USB')));
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Exporting selected documents to USB...')));
    final result = await widget.transferManager!.transferDocuments(TransferMethod.usb, docsToTransfer);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));
  }

  void _toggleDocumentSelection(String docId, bool selected) {
    setState(() {
      if (selected) {
        _selectedDocs.add(docId);
      } else {
        _selectedDocs.remove(docId);
      }
    });
  }



  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.folder_open, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'System Storage',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: const Color(0xFF003D99),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    widget.printingMode
                        ? 'Select documents to print'
                        : 'View and manage your saved documents',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color(0xFF4B5563)),
                  ),
                ],
              ),
            ),
            if (!widget.printingMode)
              Flexible(
                fit: FlexFit.tight,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        ElevatedButton.icon(
                          onPressed: _isLoading ? null : _refreshDocuments,
                          icon: _isLoading
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.refresh),
                          label: const Text('Refresh'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _isLoading ? Colors.grey : const Color(0xFF2563EB),
                          ),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton.icon(
                          onPressed: _importFromUSB,
                          icon: const Icon(Icons.usb),
                          label: const Text('Import from USB'),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton.icon(
                          onPressed: _exportToUSB,
                          icon: const Icon(Icons.download),
                          label: const Text('Export to USB'),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Card(
                      color: Colors.grey[50],
                      elevation: 0,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Direct Transfer Interface', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                ElevatedButton.icon(
                                  onPressed: _isBluetoothScanning ? null : _scanBluetoothDevices,
                                  icon: const Icon(Icons.search),
                                  label: Text(_isBluetoothScanning ? 'Scanning...' : 'Scan Bluetooth'),
                                ),
                                ElevatedButton.icon(
                                  onPressed: _connectedBluetoothDevice == null || _bluetoothDevices.isEmpty
                                      ? null
                                      : () => _connectBluetoothDevice(_connectedBluetoothDevice ?? _bluetoothDevices.first),
                                  icon: const Icon(Icons.bluetooth),
                                  label: const Text('Connect Bluetooth'),
                                ),
                                ElevatedButton.icon(
                                  onPressed: _initWifiHotspot,
                                  icon: const Icon(Icons.wifi),
                                  label: const Text('Init WiFi Hotspot'),
                                ),
                                ElevatedButton.icon(
                                  onPressed: _isWifiActive ? _startWifiTransfer : null,
                                  icon: const Icon(Icons.wifi_tethering),
                                  label: const Text('Start WiFi Transfer'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text('Bluetooth devices found: ${_bluetoothDevices.length}'),
                            if (_bluetoothDevices.isNotEmpty)
                              Wrap(
                                spacing: 8,
                                children: _bluetoothDevices.map((device) {
                                  final selected = _connectedBluetoothDevice?.address == device.address;
                                  return ChoiceChip(
                                    label: Text(device.name.isNotEmpty ? device.name : 'Unknown Device'),
                                    selected: selected,
                                    onSelected: (isSelected) {
                                      if (isSelected) {
                                        _connectBluetoothDevice(device);
                                      }
                                    },
                                  );
                                }).toList(),
                              ),
                            if (_connectedBluetoothDevice != null)
                              Text('Connected BT: ${_connectedBluetoothDevice!.name.isNotEmpty ? _connectedBluetoothDevice!.name : 'Unknown Device'}'),
                            Text('WiFi status: $_wifiStatusMessage'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (widget.printingMode)
              Padding(
                padding: const EdgeInsets.only(left: 8.0),
                child: ElevatedButton.icon(
                  onPressed: _selectedDocs.isNotEmpty
                      ? () {
                          final selected = widget.documents.where((d) => _selectedDocs.contains(d.id)).toList();
                          widget.onSelectForPrint(selected);
                        }
                      : null,
                  icon: const Icon(Icons.check),
                  label: const Text('Confirm Selection'),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 24),
        if (_isLoading)
          Container(
            decoration: BoxDecoration(
              color: Colors.blue[50],
              border: Border.all(color: const Color(0xFF2563EB)),
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.all(16),
            child: const Row(
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF2563EB)),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Refreshing storage documents...',
                    style: TextStyle(color: Color(0xFF2563EB), fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        if (_isLoading) const SizedBox(height: 16),
        if (!widget.printingMode && _selectedDocs.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: ElevatedButton.icon(
              onPressed: () {
                final selected = widget.documents.where((d) => _selectedDocs.contains(d.id)).toList();
                widget.onSelectForPrint(selected);
              },
              icon: const Icon(Icons.print),
              label: const Text('Print Selected Documents'),
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
            ),
          ),
        if (widget.documents.isEmpty)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(48),
                child: Column(
                  children: [
                    const Icon(Icons.folder_open, size: 64, color: Color(0xFF9CA3AF)),
                    const SizedBox(height: 16),
                    Text(
                      'No Documents in Storage',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(color: const Color(0xFF4B5563)),
                    ),
                    const SizedBox(height: 8),
                    const Text('Upload files or use the scanning service to digitize your documents'),
                  ],
                ),
              ),
            ),
          )
        else
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: widget.documents.map((doc) {
              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Checkbox(
                        value: _selectedDocs.contains(doc.id),
                        onChanged: (val) => _toggleDocumentSelection(doc.id, val == true),
                      ),
                      const Icon(Icons.description, color: Color(0xFF2563EB)),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              doc.originalName,
                              style: const TextStyle(fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '${doc.format} • ${doc.pages} pages • ${doc.size} • ${doc.date}',
                              style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                            ),
                          ],
                        ),
                      ),
                      if (!widget.printingMode)
                        Row(
                          children: [
                            ElevatedButton.icon(
                              onPressed: () => widget.onDelete(doc.id),
                              icon: const Icon(Icons.delete, size: 16),
                              label: const Text('Delete'),
                              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
      ],
    );
  }
}
