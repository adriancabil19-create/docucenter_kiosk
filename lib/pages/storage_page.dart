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

  Future<void> _refreshDocuments() async {
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(milliseconds: 500));
    widget.onUpload?.call();
    setState(() => _isLoading = false);
  }

  void _showUploadOptions(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Text('Upload File'),
          content: const Text('Choose transfer method:'),
          actions: [
            TextButton.icon(
              onPressed: () async {
                Navigator.pop(ctx);
                if (widget.transferManager == null) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer manager not available')));
                  return;
                }
                final docsToTransfer = _selectedDocs.isNotEmpty
                    ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
                    : widget.documents;
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Discovering Bluetooth devices...')));
                final devices = await widget.transferManager!.bluetooth.discoverDevices();
                if (devices.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No Bluetooth devices found')));
                  return;
                }
                final selected = await showDialog<BluetoothDevice?>(
                  context: context,
                  builder: (ctx2) => SimpleDialog(
                    title: const Text('Select Bluetooth device'),
                    children: devices.map((dev) => SimpleDialogOption(
                      onPressed: () => Navigator.pop(ctx2, dev),
                      child: Text(dev.toString()),
                    )).toList(),
                  ),
                );
                if (selected == null) return;
                final connected = await widget.transferManager!.bluetooth.connectToDevice(selected.address, selected.name);
                if (!connected) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to connect to device')));
                  return;
                }
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Starting Bluetooth transfer...')));
                final result = await widget.transferManager!.transferDocuments(TransferMethod.bluetooth, docsToTransfer);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));
              },
              icon: const Icon(Icons.bluetooth),
              label: const Text('Bluetooth'),
            ),
            TextButton.icon(
              onPressed: () async {
                Navigator.pop(ctx);
                if (widget.transferManager == null) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer manager not available')));
                  return;
                }
                final docsToTransfer = _selectedDocs.isNotEmpty
                    ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
                    : widget.documents;
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Preparing WiFi transfer...')));
                try {
                  await widget.transferManager!.wifiHotspot.initialize();
                  final link = await widget.transferManager!.wifiHotspot.generateTransferLink(docsToTransfer);
                  await showDialog<void>(
                    context: context,
                    builder: (ctx2) => AlertDialog(
                      title: const Text('WiFi Transfer Link'),
                      content: SelectableText(link),
                      actions: [TextButton(onPressed: () => Navigator.pop(ctx2), child: const Text('Close'))],
                    ),
                  );
                  final result = await widget.transferManager!.transferDocuments(TransferMethod.wifiHotspot, docsToTransfer);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('WiFi transfer error: $e')));
                }
              },
              icon: const Icon(Icons.wifi),
              label: const Text('WiFi Hotspot'),
            ),
            TextButton.icon(
              onPressed: () async {
                Navigator.pop(ctx);
                try {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Selecting files...')));
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
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Uploaded $uploaded file(s)')));
                  widget.onUpload?.call();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('USB upload failed: $e')));
                }
              },
              icon: const Icon(Icons.usb),
              label: const Text('From USB'),
            ),
            TextButton.icon(
              onPressed: () async {
                Navigator.pop(ctx);
                if (widget.transferManager == null) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Transfer manager not available')));
                  return;
                }
                final docsToTransfer = _selectedDocs.isNotEmpty
                    ? widget.documents.where((d) => _selectedDocs.contains(d.id)).toList()
                    : widget.documents;
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Exporting to USB...')));
                final result = await widget.transferManager!.transferDocuments(TransferMethod.usb, docsToTransfer);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.message)));
              },
              icon: const Icon(Icons.download),
              label: const Text('Export to USB'),
            ),
            TextButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                _showQrTransferDialog(context);
              },
              icon: const Icon(Icons.qr_code),
              label: const Text('QR Code'),
            ),
          ],
        );
      },
    );
  }

  void _showQrTransferDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Text('QR Code Transfer'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.qr_code, size: 80, color: Colors.grey[400]),
                      const SizedBox(height: 12),
                      Text(
                        'TXN-${DateTime.now().millisecondsSinceEpoch}',
                        style: const TextStyle(fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Scan this QR code on another device to transfer files',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ],
        );
      },
    );
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
                    onPressed: () => _showUploadOptions(context),
                    icon: const Icon(Icons.cloud_upload),
                    label: const Text('Upload'),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                  ),
                ],
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
                      if (widget.printingMode)
                        Checkbox(
                          value: _selectedDocs.contains(doc.id),
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
                              onPressed: () => widget.onPrint(doc),
                              icon: const Icon(Icons.print, size: 16),
                              label: const Text('Print'),
                            ),
                            const SizedBox(width: 8),
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
