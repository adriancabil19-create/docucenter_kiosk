import 'package:flutter/material.dart';
import 'package:file_selector/file_selector.dart';
import 'package:qr_flutter/qr_flutter.dart';
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
  final bool backendAvailable;

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
    this.backendAvailable = true,
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
  String _wifiStatusMessage = '';

  Future<void> _refreshDocuments() async {
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(milliseconds: 500));
    widget.onUpload?.call();
    setState(() => _isLoading = false);
  }

  // ── Bluetooth ────────────────────────────────────────────────────────────
  Future<void> _scanBluetoothDevices() async {
    if (widget.transferManager == null) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _isBluetoothScanning = true;
      _bluetoothDevices = [];
    });
    try {
      final devices = await widget.transferManager!.bluetooth.discoverDevices();
      setState(() => _bluetoothDevices = devices);
      if (devices.isEmpty) {
        messenger.showSnackBar(const SnackBar(content: Text('No Bluetooth devices found')));
      }
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Bluetooth scan failed: $e')));
    } finally {
      setState(() => _isBluetoothScanning = false);
    }
  }

  Future<void> _connectAndSendBluetooth(LocalBluetoothDevice device) async {
    if (widget.transferManager == null) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(SnackBar(content: Text('Connecting to ${device.name}...')));
    final ok = await widget.transferManager!.bluetooth.connectToDevice(device.address, device.name);
    if (!ok) {
      messenger.showSnackBar(SnackBar(content: Text('Failed to connect to ${device.name}')));
      return;
    }
    setState(() {
      _connectedBluetoothDevice = LocalBluetoothDevice(
          address: device.address, name: device.name, isConnected: true);
    });
    final docsToSend = _selectedDocs.isNotEmpty
        ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
        : widget.documents;
    final result = await widget.transferManager!.transferDocuments(TransferMethod.bluetooth, docsToSend);
    messenger.showSnackBar(SnackBar(content: Text(result.message)));
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

  Future<void> _connectBluetoothDevice(LocalBluetoothDevice device) =>
      _connectAndSendBluetooth(device);

  Future<void> _shareViaWifi() async {
    if (widget.transferManager == null) return;
    final messenger = ScaffoldMessenger.of(context);

    final docsToSend = _selectedDocs.isNotEmpty
        ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
        : widget.documents;

    if (docsToSend.isEmpty) {
      messenger.showSnackBar(const SnackBar(content: Text('No documents to transfer')));
      return;
    }

    setState(() => _wifiStatusMessage = 'Starting WiFi transfer server...');

    try {
      await widget.transferManager!.wifiHotspot.initialize();
      final result = await widget.transferManager!.transferDocuments(
          TransferMethod.wifiHotspot, docsToSend);

      if (!result.success) {
        setState(() => _wifiStatusMessage = result.message);
        messenger.showSnackBar(SnackBar(content: Text(result.message)));
        return;
      }

      final url = await widget.transferManager!.wifiHotspot
          .generateTransferLink(docsToSend);

      setState(() => _wifiStatusMessage = 'Serving at $url');

      if (!context.mounted) return;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('WiFi File Transfer'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Scan this QR code with your phone (must be on the same network) to download your files:',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                QrImageView(
                  data: url,
                  version: QrVersions.auto,
                  size: 240,
                  errorCorrectionLevel: QrErrorCorrectLevel.M,
                ),
                const SizedBox(height: 10),
                SelectableText(
                  url,
                  style: const TextStyle(fontSize: 12, color: Colors.blueGrey),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                const Text(
                  'The server stays open until you tap Stop.',
                  style: TextStyle(fontSize: 11, color: Colors.orange),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                widget.transferManager!.wifiHotspot.cancel();
                setState(() => _wifiStatusMessage = 'Transfer stopped');
                Navigator.of(ctx).pop();
              },
              child: const Text('Stop & Close'),
            ),
          ],
        ),
      );
    } catch (e) {
      setState(() => _wifiStatusMessage = 'Transfer failed: $e');
      messenger.showSnackBar(SnackBar(content: Text('WiFi transfer failed: $e')));
    }
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
    final hasSelection = _selectedDocs.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Backend offline banner
        if (!widget.backendAvailable)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red[50],
              border: Border.all(color: Colors.red),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.cloud_off, color: Colors.red, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Backend server is not running. Start the server with "npm run dev" in the backend folder.',
                    style: TextStyle(fontSize: 12, color: Colors.red),
                  ),
                ),
              ],
            ),
          ),

        // ── Header row ──────────────────────────────────────────────────
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.folder_open, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 12),
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
                        : 'Manage your saved documents',
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: const Color(0xFF4B5563)),
                  ),
                ],
              ),
            ),
            // Action buttons — upper right
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
                                  onPressed: _shareViaWifi,
                                  icon: const Icon(Icons.wifi_tethering),
                                  label: const Text('Share via WiFi'),
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
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              border: Border.all(color: const Color(0xFF2563EB)),
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.all(12),
            child: const Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Color(0xFF2563EB)),
                ),
                SizedBox(width: 10),
                Text('Refreshing...',
                    style: TextStyle(
                        color: Color(0xFF2563EB),
                        fontWeight: FontWeight.w500,
                        fontSize: 13)),
              ],
            ),
          ),

        // ── Select-all bar (when docs exist) ────────────────────────────
        if (widget.documents.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Checkbox(
                  tristate: true,
                  value: _selectedDocs.length == widget.documents.length
                      ? true
                      : _selectedDocs.isEmpty
                          ? false
                          : null,
                  onChanged: (val) {
                    setState(() {
                      if (val == true) {
                        _selectedDocs
                            .addAll(widget.documents.map((d) => d.id));
                      } else {
                        _selectedDocs.clear();
                      }
                    });
                  },
                ),
                const Text('Select all',
                    style: TextStyle(fontSize: 13, color: Color(0xFF4B5563))),
                if (hasSelection) ...[
                  const SizedBox(width: 12),
                  Text('${_selectedDocs.length} selected',
                      style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF2563EB),
                          fontWeight: FontWeight.bold)),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: () => setState(() => _selectedDocs.clear()),
                    child: const Text('Clear',
                        style: TextStyle(fontSize: 12)),
                  ),
                ],
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
                    const Icon(Icons.folder_open,
                        size: 64, color: Color(0xFF9CA3AF)),
                    const SizedBox(height: 16),
                    Text(
                      'No Documents in Storage',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(color: const Color(0xFF4B5563)),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                        'Upload files or use the scanning service to add documents'),
                  ],
                ),
              ),
            ),
          )
        else
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: widget.documents.map((doc) {
              final isSelected = _selectedDocs.contains(doc.id);
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                color: isSelected ? const Color(0xFFEFF6FF) : null,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: isSelected
                      ? const BorderSide(color: Color(0xFF2563EB), width: 1.5)
                      : BorderSide.none,
                ),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
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
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold, fontSize: 14),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '${doc.format} • ${doc.pages} pages • ${doc.size} • ${doc.date}',
                              style: const TextStyle(
                                  fontSize: 11, color: Color(0xFF6B7280)),
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
