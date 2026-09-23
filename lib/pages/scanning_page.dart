// DEMO MODE: Scanning requires physical scanner hardware.
// This page simulates the scanning workflow for thesis/demo purposes.
import 'dart:async';
import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../storage_service.dart';
import '../config.dart';
import '../scanner_status.dart';

class ScanningInterface extends StatefulWidget {
  final List<StorageDocument> savedDocuments;
  final Function() onDocumentSaved;
  final Function(String) onNavigate;

  const ScanningInterface({
    super.key,
    required this.savedDocuments,
    required this.onDocumentSaved,
    required this.onNavigate,
  });

  @override
  State<ScanningInterface> createState() => _ScanningInterfaceState();
}

class _ScanningInterfaceState extends State<ScanningInterface>
    with SingleTickerProviderStateMixin {
  // State machine: settings → scanning → preview → (saved → settings)
  bool _isScanning = false;
  List<Uint8List> _scannedPages = []; // Store actual image data
  List<String> _scannedPageNames = []; // Store page names for display
  // Scan to PC - default settings (ADF only)
  String _colorMode = 'color'; // Default to color
  String _dpi = '300'; // Default DPI
  String _documentName = '';
  bool _isProcessing = false;

  String _scanStatus = '';
  // Whether _scanStatus is currently reporting a failure — tracked
  // separately from _scannedPages.isNotEmpty so a failed retry after some
  // pages already scanned successfully doesn't get shown in success colors.
  bool _scanFailed = false;
  String _adfMessage = ''; // Message for ADF status
  bool _adfLoaded = false;
  bool _checkingAdf = true;
  Timer? _adfStatusTimer;
  ScannerStatusSnapshot _scannerStatus = const ScannerStatusSnapshot.checking();
  final ScannerStatusService _scannerStatusService = const ScannerStatusService();
  bool _showPreview = false;
  final String _paperSize = 'Auto';
  final String _outputFormat = 'PDF';
  final String _quality = 'standard';
  // Scan both sides of each original via the ADF's duplex unit — no paper
  // size restriction here (unlike duplex printing, which the printer's
  // duplexer can't do on Folio/"long" paper).
  bool _duplex = false;

  // Plays once when the scan-complete/preview screen appears — a simple
  // entrance fade + staggered thumbnail reveal, not a persistent animation.
  late final AnimationController _completeAnimController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 500),
  );

  @override
  void initState() {
    super.initState();
    _refreshAdfStatus();
    _adfStatusTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _refreshAdfStatus(),
    );
  }

  @override
  void dispose() {
    _adfStatusTimer?.cancel();
    _completeAnimController.dispose();
    super.dispose();
  }

  Future<bool> _refreshAdfStatus() async {
    final snapshot = await _scannerStatusService.check();
    if (!mounted) return snapshot.canScan;
    setState(() {
      _scannerStatus = snapshot;
      _adfLoaded = snapshot.canScan;
      _checkingAdf = snapshot.availability == ScannerAvailability.checking;
      _adfMessage = snapshot.message;
    });
    return snapshot.canScan;
  }

  Future<void> _startScanning() async {
    final adfReady = await _refreshAdfStatus();
    if (!mounted) return;
    if (!adfReady) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Place a document in the ADF before scanning.')),
      );
      return;
    }

    setState(() {
      _isScanning = true;
      _showPreview = false;
      _scannedPages = [];
      _scannedPageNames = [];
      _scanStatus = '';
      _scanFailed = false;
    });
    await _scanAllADFPages();
  }

  @override
  Widget build(BuildContext context) {
    if (_showPreview && _scannedPages.isNotEmpty) {
      return _buildPreview();
    }
    if (_isScanning) {
      return _buildScanning();
    }
    return _buildScanSettings();
  }

  // ── Settings screen ──────────────────────────────────────────────────────
  Widget _buildScanSettings() {
    final colorScheme = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — matches Printing / Photocopying Service
          Row(
            children: [
              Icon(Icons.document_scanner, size: 32, color: colorScheme.primary),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Document Scanning',
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                color: colorScheme.primary,
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: colorScheme.tertiaryContainer,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'FREE SERVICE',
                            style: TextStyle(
                              color: colorScheme.onTertiaryContainer,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    Text(
                      'Scan to PC using the ADF — no payment required',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          ScannerStatusPanel(
            snapshot: _scannerStatus,
            onRetry: _refreshAdfStatus,
          ),
          const AdfSafetyNotice(),

          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
              // Left column — how it works (stretched to match the right
              // column's full height, since it has no third element like
              // Photocopying's Estimated Cost card to fill the space).
              Expanded(
                child: Column(
                  children: [
                    Expanded(
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'How it works',
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                      fontWeight: FontWeight.bold,
                                    ),
                              ),
                              const SizedBox(height: 16),
                              Expanded(
                                child: Center(
                                  child: Container(
                                    decoration: BoxDecoration(
                                      border: Border.all(color: colorScheme.outlineVariant, width: 2),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    padding: const EdgeInsets.all(32),
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(Icons.document_scanner_outlined,
                                            size: 48, color: colorScheme.onSurfaceVariant),
                                        const SizedBox(height: 16),
                                        Text(
                                          'Place documents in the ADF',
                                          textAlign: TextAlign.center,
                                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                                fontWeight: FontWeight.w600,
                                              ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(
                                          'Choose your scan settings, then tap Start Scanning. '
                                          'Pages are saved to Storage as a single PDF.',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                              fontSize: 11,
                                              color: colorScheme.onSurfaceVariant,
                                              height: 1.4),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 32),
              // Right column — scan settings + start button
              Expanded(
                child: Column(
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Scan Settings',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            const SizedBox(height: 16),
                            _buildDropdown(
                              'Color Mode',
                              _colorMode,
                              const ['color', 'grayscale', 'bw'],
                              (val) => setState(() => _colorMode = val),
                              const ['Color', 'Grayscale', 'B&W'],
                            ),
                            const SizedBox(height: 16),
                            _buildDropdown(
                              'Resolution (DPI)',
                              _dpi,
                              const ['150', '200', '300', '600'],
                              (val) => setState(() => _dpi = val),
                              const ['150 DPI', '200 DPI', '300 DPI', '600 DPI'],
                            ),
                            const SizedBox(height: 8),
                            DuplexToggle(
                              label: 'Scan both sides',
                              explanation: kDuplexExplanation,
                              value: _duplex,
                              onChanged: (v) => setState(() => _duplex = v),
                            ),
                            const SizedBox(height: 8),
                            const Text('Paper Size',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            const SizedBox(height: 4),
                            Text(
                              'Detected automatically from your scanned document.',
                              style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _checkingAdf || !_adfLoaded ? null : _startScanning,
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('Start Scanning'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDropdown(
    String label,
    String value,
    List<String> values,
    void Function(String) onChanged,
    List<String> labels,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
        const SizedBox(height: 4),
        DropdownButton<String>(
          value: value,
          onChanged: (val) => onChanged(val ?? value),
          isExpanded: true,
          items: values.asMap().entries.map((entry) {
            return DropdownMenuItem(
              value: entry.value,
              child: Text(labels[entry.key]),
            );
          }).toList(),
        ),
      ],
    );
  }



  void _reset() {
    setState(() {
      _isScanning = false;
      _showPreview = false;
      _scannedPages = [];
      _scannedPageNames = [];
      _documentName = '';
      _scanStatus = '';
      _scanFailed = false;
      _adfMessage = '';
      _isProcessing = false;
    });
  }

  Future<void> _confirmCancelScan() async {
    if (!_isProcessing) {
      _reset();
      return;
    }
    final cancel = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel scan?'),
        content: const Text(
          'The scanner may still be processing a page. Cancel only after the feeder stops.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Continue Scanning'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Cancel Scan'),
          ),
        ],
      ),
    );
    if (cancel == true && mounted) _reset();
  }

  Widget _buildPreview() => _buildScanningComplete();


  // Scan all pages loaded in the ADF in a single job (used by "Start Scanning" button).
  Future<void> _scanAllADFPages() async {
    setState(() {
      _isProcessing = true;
      _scanStatus = 'Scanning all pages from ADF...';
      _scanFailed = false;
    });

    try {
      final response = await http.post(
        Uri.parse('${BackendConfig.serverUrl}/api/scan/all'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'colorMode': _colorMode == 'bw' ? 'bw' : 'color',
          'dpi': int.tryParse(_dpi) ?? 300,
          'duplex': _duplex,
        }),
      ).timeout(const Duration(seconds: 600));

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        final pageCount = body['pageCount'] as int? ?? 0;
        final pagesBase64 = (body['pages'] as List<dynamic>).cast<String>();

        final newPages = pagesBase64.map((b64) => base64Decode(b64)).toList();
        setState(() {
          _scannedPages.addAll(newPages);
          for (var i = _scannedPages.length - pageCount + 1; i <= _scannedPages.length; i++) {
            _scannedPageNames.add('Page $i');
          }
          _scanStatus = 'Scan complete! ${_scannedPages.length} page(s) scanned.';
          _scanFailed = false;
          _isProcessing = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$pageCount page(s) scanned successfully')),
          );
        }
      } else {
        final errorBody = response.body;
        String errorMsg;
        try {
          errorMsg = (jsonDecode(errorBody) as Map<String, dynamic>)['error'] as String? ?? 'Scan failed';
        } catch (_) {
          errorMsg = 'Scan failed (HTTP ${response.statusCode})';
        }
        setState(() {
          _scanStatus = errorMsg;
          _scanFailed = true;
          _isProcessing = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorMsg)));
        }
      }
    } catch (e) {
      setState(() {
        _scanStatus = 'Scan error: $e';
        _scanFailed = true;
        _isProcessing = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Scan failed: $e')));
      }
    }
  }

  // Scan a single page (used by the manual "Scan Page" button to add one more page).
  Future<void> _scanSinglePage() async {
    setState(() {
      _isProcessing = true;
      _scanStatus = 'Scanning page...';
      _scanFailed = false;
    });

    try {
      final response = await http.post(
        Uri.parse('${BackendConfig.serverUrl}/api/scan'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'colorMode': _colorMode == 'bw' ? 'bw' : 'color',
          'dpi': int.tryParse(_dpi) ?? 300,
          'paperSize': 'A4',
          'outputFormat': 'jpg',
        }),
      ).timeout(const Duration(seconds: 60));

      if (response.statusCode == 200) {
        final imageBytes = response.bodyBytes;
        setState(() {
          _scannedPages.add(imageBytes);
          _scannedPageNames.add('Page ${_scannedPages.length}');
          _scanStatus = 'Scan complete! ${_scannedPages.length} page(s) scanned.';
          _scanFailed = false;
          _isProcessing = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Page ${_scannedPages.length} scanned successfully')),
          );
        }
      } else {
        final errorBody = response.body;
        String errorMsg;
        try {
          errorMsg = (jsonDecode(errorBody) as Map<String, dynamic>)['error'] as String? ?? 'Scan failed';
        } catch (_) {
          errorMsg = 'Scan failed (HTTP ${response.statusCode})';
        }
        setState(() {
          _scanStatus = errorMsg;
          _scanFailed = true;
          _isProcessing = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(errorMsg)),
          );
        }
      }
    } catch (e) {
      setState(() {
        _scanStatus = 'Scan error: $e';
        _scanFailed = true;
        _isProcessing = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scan failed: $e')),
        );
      }
    }
  }


  Widget _buildScanning() {
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      children: [
        if (_isProcessing)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'Scanning in progress. Do not remove documents from the ADF.',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w600, color: colorScheme.onSurfaceVariant),
            ),
          ),
        if (_adfMessage.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: _adfMessage.contains('please place') ? Colors.orange[50] : Colors.green[50],
              border: Border.all(color: _adfMessage.contains('please place') ? Colors.orange : Colors.green),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  _adfMessage.contains('please place') ? Icons.warning : Icons.check_circle,
                  color: _adfMessage.contains('please place') ? Colors.orange : Colors.green,
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _adfMessage,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: _adfMessage.contains('please place') ? Colors.orange[900] : Colors.green[900],
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (_scanStatus.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: _scanFailed
                  ? colorScheme.errorContainer
                  : _scannedPages.isNotEmpty
                      ? Colors.green[50]
                      : colorScheme.surfaceContainerHighest,
              border: _scanFailed
                  ? null
                  : Border.all(color: _scannedPages.isNotEmpty ? Colors.green : colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  _scanFailed
                      ? Icons.error_outline
                      : _scannedPages.isNotEmpty
                          ? Icons.check_circle
                          : Icons.info_outline,
                  color: _scanFailed
                      ? colorScheme.onErrorContainer
                      : _scannedPages.isNotEmpty
                          ? Colors.green
                          : colorScheme.onSurfaceVariant,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _scanStatus,
                    style: TextStyle(
                      fontSize: 12,
                      color: _scanFailed ? colorScheme.onErrorContainer : colorScheme.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
        Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                SizedBox(
                  width: 60,
                  height: 60,
                  child: _isProcessing
                      ? CircularProgressIndicator(
                          strokeWidth: 4,
                          valueColor: AlwaysStoppedAnimation(
                              Theme.of(context).colorScheme.onPrimaryContainer),
                        )
                      : Icon(Icons.document_scanner,
                          size: 40, color: Theme.of(context).colorScheme.onPrimaryContainer),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isProcessing ? 'Scanning with ADF...' : 'Ready to Scan',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.onPrimaryContainer,
                            ),
                      ),
                      Text(
                        'Pages scanned: ${_scannedPages.length}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context).colorScheme.onPrimaryContainer,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        if (_scannedPages.isNotEmpty)
          GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _scannedPages.length,
            itemBuilder: (context, index) {
              return Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                clipBehavior: Clip.hardEdge,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: Container(
                        color: const Color(0xFFF7F9FC),
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(8.0),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Image.memory(
                                _scannedPages[index],
                                fit: BoxFit.contain,
                                errorBuilder: (context, error, stackTrace) {
                                  return Container(
                                    color: const Color(0xFFE0E0E0),
                                    child: const Center(child: Icon(Icons.image, size: 40, color: Color(0xFFBDBDBD))),
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Container(
                      color: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                      child: Text(
                        'Page ${index + 1}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: _isProcessing ? null : _scanSinglePage,
                  icon: const Icon(Icons.add),
                  label: const Text('Scan Page'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF2563EB),
                    side: const BorderSide(color: Color(0xFF2563EB)),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SizedBox(
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _scannedPages.isEmpty
                      ? null
                      : () => setState(() {
                            _isScanning = false;
                            _showPreview = true;
                            _completeAnimController.forward(from: 0);
                          }),
                  icon: const Icon(Icons.check),
                  label: const Text('Finish'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            onPressed: _confirmCancelScan,
            icon: const Icon(Icons.close, size: 16),
            label: const Text('Cancel Scan'),
          ),
        ),
      ],
    );
  }

  Future<void> _combineAndSaveAsPDF() async {
    if (_scannedPages.isEmpty) return;

    setState(() => _isProcessing = true);

    try {
      final docName = _documentName.isEmpty
          ? 'Scanned_${DateTime.now().millisecondsSinceEpoch}'
          : _documentName;
      final pdf = pw.Document();

      for (final pageBytes in _scannedPages) {
        final pageFormat = _detectPdfPageFormat(pageBytes);
        final image = pw.MemoryImage(pageBytes);
        pdf.addPage(
          pw.Page(
            pageFormat: pageFormat,
            build: (context) => pw.Center(
              child: pw.Image(image, fit: pw.BoxFit.contain),
            ),
          ),
        );
      }

      final pdfBytes = await pdf.save();
      final fileName = '$docName.pdf';
      const mimeType = 'application/pdf';

      final doc = await StorageService.uploadFile(
        fileName,
        pdfBytes,
        fileName,
        mimeType,
      );

      if (doc != null && mounted) {
        widget.onDocumentSaved();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Saved ${_scannedPages.length} pages as PDF to storage'),
            backgroundColor: Colors.green,
          ),
        );
        setState(() {
          _isScanning = false;
          _scannedPages = [];
          _scannedPageNames = [];
          _documentName = '';
        });
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to upload generated PDF to storage')),
          );
        }
      }
    } catch (e) {
      debugPrint('PDF creation error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error creating PDF: $e')),
        );
      }
    } finally {
      setState(() => _isProcessing = false);
    }
  }



  PdfPageFormat _detectPdfPageFormat(Uint8List pageBytes) {
    final scannedImage = img.decodeImage(pageBytes);
    if (scannedImage == null) {
      return PdfPageFormat.a4;
    }

    final dpi = int.tryParse(_dpi) ?? 300;
    final widthInches = scannedImage.width / dpi;
    final heightInches = scannedImage.height / dpi;

    // Use the actual scanned paper size based on image pixel dimensions and scan DPI.
    return PdfPageFormat(widthInches * PdfPageFormat.inch, heightInches * PdfPageFormat.inch);
  }

  Widget _buildScanningComplete() {
    final colorScheme = Theme.of(context).colorScheme;

    return AnimatedBuilder(
      animation: _completeAnimController,
      builder: (context, child) {
        final entrance = CurvedAnimation(
          parent: _completeAnimController,
          curve: const Interval(0.0, 0.6, curve: Curves.easeOut),
        );
        return Opacity(
          opacity: entrance.value,
          child: Transform.translate(
            offset: Offset(0, (1 - entrance.value) * 16),
            child: child,
          ),
        );
      },
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // One success banner instead of two stacked green boxes.
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.green[50],
                border: Border.all(color: Colors.green),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, size: 32, color: Colors.green),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_scannedPages.length} page(s) scanned',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.green[900],
                              ),
                        ),
                        Text(
                          'Review the pages below, then save as PDF.',
                          style: TextStyle(color: Colors.green[700], fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Scan settings summary
            Card(
              color: colorScheme.surfaceContainerHighest,
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Wrap(
                  spacing: 20,
                  runSpacing: 8,
                  children: [
                    _summaryChip(Icons.color_lens, _colorMode == 'color'
                        ? 'Color'
                        : _colorMode == 'grayscale'
                            ? 'Grayscale'
                            : 'B&W'),
                    _summaryChip(Icons.high_quality, '$_dpi DPI'),
                    _summaryChip(Icons.article, _paperSize),
                    _summaryChip(Icons.file_present, _outputFormat),
                    _summaryChip(Icons.star, _quality == 'draft' ? 'Draft' : 'Standard'),
                    if (_duplex) _summaryChip(Icons.flip, 'Duplex'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            Text(
              'Pages',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'Tap a page to view it larger.',
              style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),

            // Horizontal strip instead of a fixed-column grid — a grid with
            // more columns than pages (e.g. 4 columns for 2 pages) left half
            // the row empty and looked lopsided. This scales to any page
            // count and matches the Photocopying preview pattern.
            SizedBox(
              height: 170,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _scannedPages.length,
                separatorBuilder: (context, index) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  // Staggered reveal — each thumbnail fades/slides in a beat
                  // after the previous one, capped so it never drags on.
                  final start = (index * 0.08).clamp(0.0, 0.5);
                  final anim = CurvedAnimation(
                    parent: _completeAnimController,
                    curve: Interval(start, (start + 0.5).clamp(0.0, 1.0), curve: Curves.easeOut),
                  );
                  return AnimatedBuilder(
                    animation: anim,
                    builder: (context, child) => Opacity(
                      opacity: anim.value,
                      child: Transform.translate(
                        offset: Offset(0, (1 - anim.value) * 12),
                        child: child,
                      ),
                    ),
                    child: GestureDetector(
                      onTap: () => _showFullPagePreview(index),
                      child: Card(
                        clipBehavior: Clip.antiAlias,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: Stack(
                          children: [
                            SizedBox(
                              width: 120,
                              height: 170,
                              child: Image.memory(
                                _scannedPages[index],
                                fit: BoxFit.cover,
                                errorBuilder: (context, error, stackTrace) => Container(
                                  color: const Color(0xFFE0E0E0),
                                  child: const Center(
                                      child: Icon(Icons.image, size: 32, color: Color(0xFFBDBDBD))),
                                ),
                              ),
                            ),
                            Positioned(
                              top: 6,
                              right: 6,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: const Color(0xFF2563EB),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                child: Text(
                                  '${index + 1}',
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 24),

            // Name input + save
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Save Document',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      onChanged: (val) => _documentName = val,
                      decoration: InputDecoration(
                        labelText: 'Document Name',
                        hintText: 'e.g., Thesis_Draft_2026',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        suffixText: '.$_outputFormat'.toLowerCase(),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _isProcessing ? null : _combineAndSaveAsPDF,
                        icon: _isProcessing
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.save),
                        label: _isProcessing ? const Text('Creating PDF...') : const Text('Save as PDF'),
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Secondary actions
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: OutlinedButton.icon(
                      onPressed: () => setState(() {
                        _isScanning = false;
                        _scannedPages = [];
                        _scannedPageNames = [];
                        _documentName = '';
                      }),
                      icon: const Icon(Icons.close),
                      label: const Text('Discard'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: colorScheme.error,
                        side: BorderSide(color: colorScheme.error),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: OutlinedButton.icon(
                      onPressed: () => setState(() {
                        _isScanning = true;
                        _scannedPages = [];
                        _scannedPageNames = [];
                        _documentName = '';
                      }),
                      icon: const Icon(Icons.add),
                      label: const Text('Scan More'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF2563EB),
                        side: const BorderSide(color: Color(0xFF2563EB)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showFullPagePreview(int index) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Text('Page ${index + 1} of ${_scannedPages.length}',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(dialogContext).pop(),
                  ),
                ],
              ),
            ),
            Flexible(
              child: InteractiveViewer(
                child: Image.memory(
                  _scannedPages[index],
                  errorBuilder: (context, error, stack) => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Icon(Icons.broken_image_outlined, size: 48),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryChip(IconData icon, String label) {
    final onSurfaceVariant = Theme.of(context).colorScheme.onSurfaceVariant;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: onSurfaceVariant),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 12, color: onSurfaceVariant)),
      ],
    );
  }

}
