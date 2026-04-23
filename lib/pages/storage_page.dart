import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';
import '../config.dart';
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

  String _wifiStatusMessage = '';
  Timer? _receivePollingTimer;

  Future<void> _refreshDocuments() async {
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(milliseconds: 500));
    widget.onUpload?.call();
    setState(() => _isLoading = false);
  }

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

      // Grab hotspot credentials if the service created its own AP.
      final svc = widget.transferManager!.wifiHotspot;
      final hotspotSsid = (svc is LocalWebTransferService) ? svc.hotspotSsid : null;
      final hotspotPw   = (svc is LocalWebTransferService) ? svc.hotspotPassword : null;
      final usingHotspot = hotspotSsid != null;

      if (!context.mounted) return;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => Dialog(
          child: SizedBox(
            width: 400,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'WiFi File Transfer',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),

                  // Step 1: connect to hotspot (only shown when hotspot mode active)
                  if (usingHotspot) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF2563EB)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Step 1 — Connect your phone to this WiFi:',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 6),
                          Row(children: [
                            const Icon(Icons.wifi, size: 16, color: Color(0xFF2563EB)),
                            const SizedBox(width: 6),
                            const Text('Network: ', style: TextStyle(fontSize: 13)),
                            Text(hotspotSsid,
                                style: const TextStyle(
                                    fontSize: 13, fontWeight: FontWeight.bold)),
                          ]),
                          const SizedBox(height: 2),
                          Row(children: [
                            const Icon(Icons.lock, size: 16, color: Color(0xFF2563EB)),
                            const SizedBox(width: 6),
                            const Text('Password: ', style: TextStyle(fontSize: 13)),
                            Text(hotspotPw!,
                                style: const TextStyle(
                                    fontSize: 13, fontWeight: FontWeight.bold)),
                          ]),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Step 2 — Scan the QR code to download your files:',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                  ] else ...[
                    const Text(
                      'Scan this QR code with your phone (same network) to download your files:',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                  ],

                  SizedBox(
                    width: 240,
                    height: 240,
                    child: QrImageView(
                      data: url,
                      version: QrVersions.auto,
                      size: 240,
                      errorCorrectionLevel: QrErrorCorrectLevel.M,
                    ),
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
                  const SizedBox(height: 16),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () {
                        widget.transferManager!.wifiHotspot.cancel();
                        setState(() => _wifiStatusMessage = 'Transfer stopped');
                        Navigator.of(ctx).pop();
                      },
                      child: const Text('Stop & Close'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    } catch (e) {
      setState(() => _wifiStatusMessage = 'Transfer failed: $e');
      messenger.showSnackBar(SnackBar(content: Text('WiFi transfer failed: $e')));
    }
  }

  Future<void> _receiveFromPhone() async {
    final messenger = ScaffoldMessenger.of(context);

    // Create a receive session on Render
    http.Response createRes;
    try {
      createRes = await http
          .post(Uri.parse(BackendConfig.transferReceiveSessionUrl))
          .timeout(const Duration(seconds: 15));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not reach server: $e')));
      return;
    }

    final body = jsonDecode(createRes.body) as Map<String, dynamic>;
    if (body['success'] != true) {
      messenger.showSnackBar(const SnackBar(content: Text('Failed to create receive session')));
      return;
    }

    final sessionId = body['sessionId'] as String;
    final uploadUrl = body['uploadUrl'] as String;

    if (!context.mounted) return;

    // Show QR dialog and poll for files
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        bool filesReceived = false;
        String statusText = 'Waiting for phone to upload files…';

        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            // Start polling once the dialog is built
            _receivePollingTimer ??= Timer.periodic(
              const Duration(seconds: 3),
              (_) async {
                if (!ctx.mounted) return;
                try {
                  final res = await http
                      .get(Uri.parse(BackendConfig.transferReceiveStatusUrl(sessionId)))
                      .timeout(const Duration(seconds: 8));
                  final data = jsonDecode(res.body) as Map<String, dynamic>;

                  if (data['ready'] == true && !filesReceived) {
                    filesReceived = true;
                    _receivePollingTimer?.cancel();
                    _receivePollingTimer = null;

                    final files = (data['files'] as List)
                        .cast<Map<String, dynamic>>();

                    setDialogState(() =>
                        statusText = 'Received ${files.length} file(s)! Saving…');

                    // Download each file from Render and save to local storage
                    int saved = 0;
                    for (final f in files) {
                      final name = f['name'] as String;
                      final decodedName = Uri.decodeComponent(name);
                      final mime = (f['mimeType'] as String?) ?? 'application/octet-stream';
                      try {
                        final dl = await http
                            .get(Uri.parse(
                                BackendConfig.transferReceiveFileUrl(sessionId, decodedName)))
                            .timeout(const Duration(minutes: 2));
                        if (dl.statusCode == 200) {
                          final doc = await StorageService.uploadFile(
                              decodedName, dl.bodyBytes, decodedName, mime);
                          if (doc != null) saved++;
                        }
                      } catch (e) {
                        debugPrint('Failed to save received file $decodedName: $e');
                      }
                    }

                    // Clean up session on Render
                    try {
                      await http.delete(Uri.parse(
                          BackendConfig.transferReceiveDeleteUrl(sessionId)));
                    } catch (_) {}

                    widget.onUpload?.call();

                    if (ctx.mounted) Navigator.of(ctx).pop();

                    messenger.showSnackBar(SnackBar(
                        content: Text('$saved file(s) saved and ready to print')));
                  }
                } catch (_) {}
              },
            );

            return Dialog(
              child: SizedBox(
                width: 380,
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'Receive Files from Phone',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Scan this QR code on your phone to upload files for printing:',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: Colors.grey),
                      ),
                      const SizedBox(height: 16),
                      QrImageView(
                        data: uploadUrl,
                        version: QrVersions.auto,
                        size: 220,
                        errorCorrectionLevel: QrErrorCorrectLevel.M,
                      ),
                      const SizedBox(height: 10),
                      SelectableText(
                        uploadUrl,
                        style: const TextStyle(fontSize: 11, color: Colors.blueGrey),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (!filesReceived)
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          const SizedBox(width: 8),
                          Text(
                            statusText,
                            style: TextStyle(
                              fontSize: 13,
                              color: filesReceived ? Colors.green : Colors.orange,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () {
                            _receivePollingTimer?.cancel();
                            _receivePollingTimer = null;
                            Navigator.of(ctx).pop();
                          },
                          child: const Text('Cancel'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    _receivePollingTimer?.cancel();
    _receivePollingTimer = null;
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
                                  onPressed: _shareViaWifi,
                                  icon: const Icon(Icons.wifi_tethering),
                                  label: const Text('Share via WiFi'),
                                ),
                                ElevatedButton.icon(
                                  onPressed: _receiveFromPhone,
                                  icon: const Icon(Icons.upload_file),
                                  label: const Text('Receive from Phone'),
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.green),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
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
