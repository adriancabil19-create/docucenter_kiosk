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
  bool _isUploading = false;
  bool _isExporting = false;

  List<LocalBluetoothDevice> _bluetoothDevices = [];
  LocalBluetoothDevice? _connectedBluetoothDevice;
  bool _isBluetoothScanning = false;
  bool _isWifiTransferring = false;
  String _wifiStatusMessage = '';

  // ── Upload from file picker ──────────────────────────────────────────────
  Future<void> _uploadFromFile() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _isUploading = true);
    try {
      final paths = await openFiles();
      if (paths.isEmpty) {
        setState(() => _isUploading = false);
        return;
      }
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
      messenger.showSnackBar(SnackBar(
        content: Text('Uploaded $uploaded file(s)'),
        backgroundColor: uploaded > 0 ? Colors.green : Colors.orange,
      ));
      widget.onUpload?.call();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Upload failed: $e')));
    } finally {
      setState(() => _isUploading = false);
    }
  }

  // ── Export selected docs to USB ──────────────────────────────────────────
  Future<void> _exportToUsb() async {
    if (widget.transferManager == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final docsToExport = _selectedDocs.isNotEmpty
        ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
        : widget.documents;
    if (docsToExport.isEmpty) {
      messenger.showSnackBar(const SnackBar(content: Text('No documents to export')));
      return;
    }
    setState(() => _isExporting = true);
    messenger.showSnackBar(const SnackBar(content: Text('Exporting to USB...')));
    final result = await widget.transferManager!.transferDocuments(TransferMethod.usb, docsToExport);
    setState(() => _isExporting = false);
    messenger.showSnackBar(SnackBar(content: Text(result.message)));
  }

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

  // ── WiFi transfer ────────────────────────────────────────────────────────
  Future<void> _startWifiTransfer() async {
    if (widget.transferManager == null) return;
    final messenger = ScaffoldMessenger.of(context);
    // Capture navigator before any await so showDialog is safe
    final nav = Navigator.of(context);
    setState(() => _isWifiTransferring = true);

    try {
      await widget.transferManager!.wifiHotspot.initialize();
      if (!mounted) return;
      final netInfo = await widget.transferManager!.wifiHotspot.getNetworkInfo();
      if (!mounted) return;
      final link = await widget.transferManager!.wifiHotspot.generateTransferLink(
        _selectedDocs.isNotEmpty
            ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
            : widget.documents,
      );
      setState(() => _wifiStatusMessage = 'Hotspot: ${netInfo['hostname']} — ${netInfo['ip']}:${netInfo['port']}');

      if (!nav.mounted) return;
      await showDialog<void>(
        context: nav.context,
        builder: (ctx) => AlertDialog(
          title: const Text('WiFi Transfer'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Network: ${netInfo['hostname'] ?? '—'}'),
              const SizedBox(height: 4),
              Text('Password: ${netInfo['ssid'] ?? 'DocuCenter'} / DocuCenter123',
                  style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 12),
              const Text('Download link (open on phone):',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              const SizedBox(height: 4),
              SelectableText(link, style: const TextStyle(fontSize: 12, color: Color(0xFF2563EB))),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
          ],
        ),
      );

      if (!mounted) return;
      final docsToSend = _selectedDocs.isNotEmpty
          ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
          : widget.documents;
      final result = await widget.transferManager!.transferDocuments(
          TransferMethod.wifiHotspot, docsToSend);
      messenger.showSnackBar(SnackBar(content: Text(result.message)));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('WiFi transfer error: $e')));
    } finally {
      setState(() => _isWifiTransferring = false);
    }
  }

  // ── Print selected ───────────────────────────────────────────────────────
  void _printSelected() {
    final selected = _selectedDocs.isNotEmpty
        ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
        : [];
    if (selected.isEmpty) return;
    widget.onSelectForPrint(selected as List<StorageDocument>);
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
              Wrap(
                spacing: 8,
                children: [
                  // Refresh
                  ElevatedButton.icon(
                    onPressed: _isLoading ? null : _refreshDocuments,
                    icon: _isLoading
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.refresh, size: 16),
                    label: const Text('Refresh'),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB)),
                  ),
                  // Upload File (from PC)
                  ElevatedButton.icon(
                    onPressed: _isUploading ? null : _uploadFromFile,
                    icon: _isUploading
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.upload_file, size: 16),
                    label: const Text('Upload File'),
                    style:
                        ElevatedButton.styleFrom(backgroundColor: Colors.green),
                  ),
                  // Export to USB
                  ElevatedButton.icon(
                    onPressed: _isExporting ? null : _exportToUsb,
                    icon: _isExporting
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.usb, size: 16),
                    label: Text(hasSelection
                        ? 'Export to USB (${_selectedDocs.length})'
                        : 'Export to USB'),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepOrange),
                  ),
                  // Print Selected
                  if (hasSelection)
                    ElevatedButton.icon(
                      onPressed: _printSelected,
                      icon: const Icon(Icons.print, size: 16),
                      label: Text('Print Selected (${_selectedDocs.length})'),
                      style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF7C3AED)),
                    ),
                ],
              ),
            if (widget.printingMode)
              Row(
                children: [
                  ElevatedButton.icon(
                    onPressed: _selectedDocs.isNotEmpty
                        ? () {
                            final selected = widget.documents
                                .where((d) => _selectedDocs.contains(d.id))
                                .toList();
                            widget.onSelectForPrint(selected);
                          }
                        : null,
                    icon: const Icon(Icons.check),
                    label: const Text('Confirm Selection'),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB)),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: widget.onCancelPrintMode,
                    child: const Text('Cancel'),
                  ),
                ],
              ),
          ],
        ),

        const SizedBox(height: 20),

        // ── Direct Transfer section (Bluetooth / WiFi) ───────────────────
        if (!widget.printingMode)
          Card(
            color: Colors.grey[50],
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 20),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.share, size: 18, color: Color(0xFF2563EB)),
                      const SizedBox(width: 8),
                      Text('Direct Transfer',
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(width: 8),
                      Text(
                        hasSelection
                            ? '${_selectedDocs.length} selected'
                            : 'all documents',
                        style: const TextStyle(
                            fontSize: 11, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Bluetooth row
                  Row(
                    children: [
                      const Icon(Icons.bluetooth,
                          size: 16, color: Color(0xFF2563EB)),
                      const SizedBox(width: 8),
                      ElevatedButton.icon(
                        onPressed:
                            _isBluetoothScanning ? null : _scanBluetoothDevices,
                        icon: const Icon(Icons.search, size: 14),
                        label: Text(_isBluetoothScanning
                            ? 'Scanning...'
                            : 'Scan Devices'),
                        style: ElevatedButton.styleFrom(
                            visualDensity: VisualDensity.compact),
                      ),
                      if (_bluetoothDevices.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: _bluetoothDevices.map((device) {
                                final selected =
                                    _connectedBluetoothDevice?.address ==
                                        device.address;
                                return Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: ActionChip(
                                    avatar: Icon(
                                      selected
                                          ? Icons.bluetooth_connected
                                          : Icons.bluetooth,
                                      size: 14,
                                      color: selected
                                          ? Colors.blue
                                          : Colors.grey,
                                    ),
                                    label: Text(
                                      device.name.isNotEmpty
                                          ? device.name
                                          : 'Unknown',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                    onPressed: () =>
                                        _connectAndSendBluetooth(device),
                                  ),
                                );
                              }).toList(),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  // WiFi row
                  Row(
                    children: [
                      const Icon(Icons.wifi, size: 16, color: Color(0xFF2563EB)),
                      const SizedBox(width: 8),
                      ElevatedButton.icon(
                        onPressed:
                            _isWifiTransferring ? null : _startWifiTransfer,
                        icon: _isWifiTransferring
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.wifi_tethering, size: 14),
                        label: const Text('Start WiFi Transfer'),
                        style: ElevatedButton.styleFrom(
                            visualDensity: VisualDensity.compact),
                      ),
                      if (_wifiStatusMessage.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _wifiStatusMessage,
                            style: const TextStyle(
                                fontSize: 11, color: Color(0xFF4B5563)),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),

        // ── Loading indicator ────────────────────────────────────────────
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

        // ── Document list ────────────────────────────────────────────────
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
                      // Checkbox always visible
                      Checkbox(
                        value: isSelected,
                        onChanged: (val) {
                          setState(() {
                            if (val == true) {
                              _selectedDocs.add(doc.id);
                            } else {
                              _selectedDocs.remove(doc.id);
                            }
                          });
                        },
                      ),
                      const Icon(Icons.description,
                          color: Color(0xFF2563EB), size: 20),
                      const SizedBox(width: 12),
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
                      // Delete per-document
                      IconButton(
                        onPressed: () => widget.onDelete(doc.id),
                        icon: const Icon(Icons.delete_outline,
                            size: 18, color: Colors.red),
                        tooltip: 'Delete',
                        visualDensity: VisualDensity.compact,
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
