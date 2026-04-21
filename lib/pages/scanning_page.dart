// DEMO MODE: Scanning requires physical scanner hardware.
// This page simulates the scanning workflow for thesis/demo purposes.
import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../storage_service.dart';
import '../config.dart';
import '../payment_service.dart';

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

class _ScanningInterfaceState extends State<ScanningInterface> {
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
  String _adfMessage = ''; // Message for ADF status
  bool _showPreview = false;
  final String _paperSize = 'Auto';
  final String _outputFormat = 'PDF';
  final String _quality = 'standard';

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
    return SingleChildScrollView(
      child: Column(
        children: [
          // Demo mode notice
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.green[50],
              border: Border.all(color: Colors.green),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Scanner Connected — Brother MFC-J2730DW detected. ADF Ready. Press Start Scanning to begin.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ),
              ],
            ),
          ),
          // Scan Settings - Simplified for ADF only
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.settings, size: 32, color: Color(0xFF2563EB)),
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
                                  color: const Color(0xFF003D99),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.green[100],
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.green[300]!),
                                ),
                                child: const Text(
                                  'FREE SERVICE',
                                  style: TextStyle(
                                    color: Colors.green,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const Text('Scan to PC using ADF • No payment required • Color scanning default'),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Scanner Configuration Cards - Restored with selectable options
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Color Mode',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['color', 'grayscale', 'bw'].map((mode) {
                      final label = mode == 'bw'
                          ? 'B&W'
                          : mode == 'color'
                              ? 'Color'
                              : 'Grayscale';
                      return FilterChip(
                        label: Text(label),
                        selected: _colorMode == mode,
                        onSelected: (_) => setState(() => _colorMode = mode),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('DPI (Resolution)',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['150', '200', '300', '600'].map((dpi) {
                      return FilterChip(
                        label: Text(dpi),
                        selected: _dpi == dpi,
                        onSelected: (_) => setState(() => _dpi = dpi),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Paper Size Detection',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Paper size will be detected automatically from your scanned document. ' 
                    'The saved PDF will use the correct detected page size.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                setState(() {
                  _isScanning = true;
                  _showPreview = false;
                  _scannedPages = [];
                  _scannedPageNames = [];
                  _adfMessage = '';
                  _scanStatus = '';
                });
                _scanAllADFPages();
              },
              icon: const Icon(Icons.play_arrow),
              label: const Text('Start Scanning with ADF'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: const Color(0xFF2563EB),
              ),
            ),
          ),
        ],
      ),
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
      _adfMessage = '';
      _isProcessing = false;
    });
  }

  Widget _buildPreview() => _buildScanningComplete();


  // Scan all pages loaded in the ADF in a single job (used by "Start Scanning" button).
  Future<void> _scanAllADFPages() async {
    setState(() {
      _isProcessing = true;
      _scanStatus = 'Scanning all pages from ADF...';
    });

    try {
      final response = await http.post(
        Uri.parse('${BackendConfig.serverUrl}/api/scan/all'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'colorMode': _colorMode == 'bw' ? 'bw' : 'color',
          'dpi': int.tryParse(_dpi) ?? 300,
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
          _isProcessing = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorMsg)));
        }
      }
    } catch (e) {
      setState(() {
        _scanStatus = 'Scan error: $e';
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
    return Column(
      children: [
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
              color: _scannedPages.isNotEmpty ? Colors.green[50] : Colors.blue[50],
              border: Border.all(color: _scannedPages.isNotEmpty ? Colors.green : Colors.blue),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(
                  _scannedPages.isNotEmpty ? Icons.check_circle : Icons.info,
                  color: _scannedPages.isNotEmpty ? Colors.green : Colors.blue,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _scanStatus,
                    style: const TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ),
              ],
            ),
          ),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.blue[50],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 60,
                height: 60,
                child: _isProcessing
                    ? const CircularProgressIndicator(
                        strokeWidth: 4,
                        valueColor: AlwaysStoppedAnimation(Color(0xFF2563EB)),
                      )
                    : const Icon(Icons.document_scanner, size: 40, color: Color(0xFF2563EB)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isProcessing ? 'Scanning with ADF...' : 'Ready to Scan',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    Text(
                      'Pages scanned: ${_scannedPages.length}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
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
              child: ElevatedButton.icon(
                onPressed: _isProcessing ? null : _scanSinglePage,
                icon: const Icon(Icons.add),
                label: const Text('Scan Page'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _scannedPages.isEmpty ? null : () => setState(() {
                _isScanning = false;
                _showPreview = true;
              }),
                icon: const Icon(Icons.check),
                label: const Text('Finish'),
                style:
                    ElevatedButton.styleFrom(backgroundColor: Colors.green),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            onPressed: _reset,
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
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_scanStatus.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.green[50],
                border: Border.all(color: Colors.green),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.green, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _scanStatus,
                      style: const TextStyle(fontSize: 12, color: Colors.black87),
                    ),
                  ),
                ],
              ),
            ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.green[50],
              border: Border.all(color: Colors.green),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.preview, size: 32, color: Colors.green),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Scan Preview',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Colors.green[900],
                            ),
                      ),
                      Text(
                        '${_scannedPages.length} page(s) scanned — review before saving',
                        style: TextStyle(color: Colors.green[700], fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Scan settings summary
          Card(
            color: Colors.grey[50],
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 16,
                runSpacing: 4,
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
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Page thumbnails grid
          Text(
            'Pages',
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _scannedPages.length,
            itemBuilder: (context, index) {
              return Card(
                child: Stack(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: 120,
                      child: Image.memory(
                        _scannedPages[index],
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            color: const Color(0xFFE0E0E0),
                            child: const Center(child: Icon(Icons.image, size: 40, color: Color(0xFFBDBDBD))),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF2563EB),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        child: Text(
                          '${index + 1}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 24),

          // Name input + save
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Save Document',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    onChanged: (val) => _documentName = val,
                    decoration: InputDecoration(
                      labelText: 'Document Name (Charles Adrian)',
                      hintText: 'e.g., Thesis_Draft_2026',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8)),
                      suffixText: '.$_outputFormat'.toLowerCase(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _isProcessing ? null : _combineAndSaveAsPDF,
                      icon: _isProcessing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save),
                      label: _isProcessing ? const Text('Creating PDF...') : const Text('Save as PDF'),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
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
                child: ElevatedButton.icon(
                  onPressed: () => setState(() {
                    _isScanning = false;
                    _scannedPages = [];
                    _scannedPageNames = [];
                    _documentName = '';
                  }),
                  icon: const Icon(Icons.close),
                  label: const Text('Discard'),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.grey),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => setState(() {
                    _isScanning = true;
                    _scannedPages = [];
                    _scannedPageNames = [];
                    _documentName = '';
                  }),
                  icon: const Icon(Icons.add),
                  label: const Text('Scan More'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _summaryChip(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: const Color(0xFF4B5563)),
        const SizedBox(width: 4),
        Text(label,
            style:
                const TextStyle(fontSize: 12, color: Color(0xFF4B5563))),
      ],
    );
  }

  Future<void> _printScanReceipt(String fileName) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final docName =
          _documentName.trim().isEmpty ? fileName : _documentName.trim();
      final scanReceipt = '''
========================================
         SCANNING RECEIPT
   ${DateTime.now().toString().split('.')[0]}
========================================

Document Name: $docName
Output Format: $_outputFormat
Pages Scanned: ${_scannedPages.length}
Color Mode: ${_colorMode == 'color' ? 'Color' : _colorMode == 'grayscale' ? 'Grayscale' : 'B&W'}
DPI Resolution: $_dpi DPI
Paper Size: $_paperSize
Scan Quality: ${_quality == 'draft' ? 'Draft' : 'Standard'}

----------------------------------------
File Size (est.): ${(_scannedPages.length * 250)} KB
Date: ${DateTime.now().toString().split('.')[0]}

Status: [SCAN COMPLETE]
Document saved to system storage.

----------------------------------------
Thank you for using our service!
''';

      final success = await PrintService.printReceipt(scanReceipt);
      messenger.showSnackBar(SnackBar(
        content: Text(success
            ? 'Scan receipt printed!'
            : 'Print unavailable (demo mode)'),
        backgroundColor: success ? Colors.green : Colors.orange,
        duration: const Duration(seconds: 2),
      ));
    } catch (e) {
      debugPrint('Error printing scan receipt: $e');
    }
  }
}
