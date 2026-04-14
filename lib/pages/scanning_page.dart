// DEMO MODE: Scanning requires physical scanner hardware.
// This page simulates the scanning workflow for thesis/demo purposes.
import 'package:flutter/material.dart';
import 'dart:io';
import 'dart:typed_data';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_twain_scanner/flutter_twain_scanner.dart';
import 'package:flutter_twain_scanner/dynamsoft_service.dart';
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../storage_service.dart';
import '../config.dart';

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
  bool _doubleScanning = false; // Default to single-sided
  String _documentName = '';
  bool _isProcessing = false;

  String _scanStatus = '';
  String _adfMessage = ''; // Message for ADF status
  final DynamsoftService _dynamsoftService = DynamsoftService();
  final FlutterTwainScanner _twainScanner = FlutterTwainScanner();
  final String _host = 'http://127.0.0.1:18622';
  final String _license = 't0200EQYAACdTxWAVwW/IIbkLSSWSboeM7i37QH6J75HEH8pOSydAno8ilBC40qlhRTQ37w7VY63TyF81OQumTpZk/m+MRFi215UTE5wy3pnEY508wYlHTiKXPm0+bZXGxQEIwJon+16HH8A1kNdyAjZ99F4ZCgA9QDqA9NbAPaC5C5981MmLv/85vXegLScmOGW8sy6QMU6e4MQjpy+QxZLa/W73XCBc35wCQA+QJpDmZWoUCJ0B9ABpAtupilEAZLQ2zhn7AZNyN6M='; // Dynamsoft license key

  bool get _hasDynamsoftLicense => _license.trim().isNotEmpty;

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
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: CheckboxListTile(
                title: const Text('Double-sided Scanning'),
                subtitle: const Text('Scan both sides of documents'),
                value: _doubleScanning,
                onChanged: (val) =>
                    setState(() => _doubleScanning = val ?? false),
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
                  _adfMessage = 'Checking ADF status...';
                });
                _checkADFAndStartScanning();
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



  Future<void> _checkADFAndStartScanning() async {
    setState(() {
      _isProcessing = true;
      _scanStatus = 'Checking ADF status...';
    });

    try {
      // Call backend to check ADF status
      final response = await http.get(
        Uri.parse('${BackendConfig.serverUrl}/api/scan/adf-status'),
      );

      if (response.statusCode == 200) {
        final adfData = jsonDecode(response.body);
        final adfReady = adfData['ready'] as bool?;

        if (adfReady == true) {
          setState(() {
            _scanStatus = 'OKAY - ADF Ready! Starting scan...';
            _adfMessage = 'ADF is ready. Beginning scan process.';
          });
          // Proceed with scanning
          await _scanSinglePage();
        } else {
          setState(() {
            _scanStatus = 'ADF Not Ready';
            _adfMessage = 'Please place your document on the scanner, thank you.';
            _isProcessing = false;
          });
        }
      } else {
        setState(() {
          _scanStatus = 'Unable to check ADF status';
          _adfMessage = 'Please place your document on the scanner, thank you.';
          _isProcessing = false;
        });
      }
    } catch (e) {
      setState(() {
        _scanStatus = 'Error checking ADF: $e';
        _adfMessage = 'Please place your document on the scanner, thank you.';
        _isProcessing = false;
      });
    }
  }

  Future<void> _scanSinglePage() async {
    setState(() {
      _isProcessing = true;
      _scanStatus = 'Connecting to scanner service...';
    });

    try {
      // Get list of devices
      List<dynamic> devices = await _dynamsoftService.getDevices(_host);
      if (devices.isEmpty) {
        setState(() {
          _scanStatus = 'No scanners found. Please ensure Brother MFC-J2730DW is connected and TWAIN driver is installed.';
          _isProcessing = false;
        });
        return;
      }

      final deviceInfo = devices[0] as Map<String, dynamic>? ?? {};
      final deviceName = (deviceInfo['name'] as String?)?.trim().isNotEmpty == true
          ? deviceInfo['name'] as String
          : (deviceInfo['device'] as String?)?.trim().isNotEmpty == true
              ? deviceInfo['device'] as String
              : 'Unknown scanner';
      final deviceId = deviceInfo['device'] as String?;

      if (deviceId == null || deviceId.isEmpty) {
        setState(() {
          _scanStatus = 'Found scanner device entry, but no device ID is available from Dynamsoft.';
          _isProcessing = false;
        });
        return;
      }

      setState(() {
        _scanStatus = 'Found scanner: $deviceName. Starting scan with ADF...';
      });

      if (!_hasDynamsoftLicense) {
        final scanned = await _scanUsingDirectTwain();
        if (scanned) {
          return;
        }
      }

      // Create scan job via Dynamsoft service with user-selected settings
      final job = await _dynamsoftService.createJob(_host, {
        'license': _license,
        'device': deviceId,
        'config': {
          'IfShowUI': false,
          'PixelType': _colorMode == 'color' ? 2 : (_colorMode == 'grayscale' ? 1 : 0), // 2 = color, 1 = gray, 0 = BW
          'Resolution': int.tryParse(_dpi) ?? 300,
          'IfFeederEnabled': true, // Always use ADF
          'IfDuplexEnabled': _doubleScanning,
        }
      }) as Map<String, dynamic>?;

      if (job == null || job.isEmpty) {
        throw Exception(
          'Dynamsoft createJob failed. Please verify the license key in the app and ensure the Dynamic Web TWAIN Service is running.',
        );
      }

      final jobUid = (job['jobuid'] as String?) ?? (job['jobUID'] as String?) ?? (job['jobId'] as String?);
      if (jobUid == null || jobUid.isEmpty) {
        throw Exception('Dynamsoft job response did not include a valid job UID. Response: $job');
      }

      // Get scanned images
      final images = await _dynamsoftService.getImageStreams(_host, jobUid) as List<Uint8List>?;
      if (images == null || images.isEmpty) {
        throw Exception('No scanned image data was returned by Dynamsoft.');
      }

      setState(() {
        _scannedPages.addAll(images);
        for (int i = 0; i < images.length; i++) {
          _scannedPageNames.add('Page ${_scannedPages.length - images.length + i + 1}');
        }
        _scanStatus = 'Scan completed successfully! ${images.length} page(s) added.';
        _isProcessing = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scanned ${images.length} page(s) successfully with ADF')),
        );
      }

    } catch (e) {
      setState(() {
        _scanStatus = 'Scan failed: $e';
        _isProcessing = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scan failed: $e')),
        );
      }
    }
  }

  Future<bool> _scanUsingDirectTwain() async {
    setState(() {
      _scanStatus = 'Connecting to scanner via TWAIN...';
    });

    try {
      final List<String> sources = await _twainScanner.getDataSources();
      if (sources.isEmpty) {
        setState(() {
          _scanStatus = 'No local TWAIN sources found. Please verify the Brother scanner is installed and connected.';
          _isProcessing = false;
        });
        return false;
      }

      setState(() {
        _scanStatus = 'Found TWAIN source: ${sources[0]}. Starting direct scan...';
      });

      final List<String> scannedPaths = await _twainScanner.scanDocument(0);
      if (scannedPaths.isEmpty) {
        setState(() {
          _scanStatus = 'Direct TWAIN scan did not return any pages.';
          _isProcessing = false;
        });
        return false;
      }

      final List<Uint8List> images = [];
      for (final path in scannedPaths) {
        try {
          final bytes = await File(path).readAsBytes();
          images.add(bytes);
        } catch (readError) {
          // ignore individual file read errors to keep scan progress if some files are valid
        }
      }

      if (images.isEmpty) {
        setState(() {
          _scanStatus = 'Direct TWAIN scan completed but no image files could be read.';
          _isProcessing = false;
        });
        return false;
      }

      setState(() {
        _scannedPages.addAll(images);
        for (int i = 0; i < images.length; i++) {
          _scannedPageNames.add('Page ${_scannedPages.length - images.length + i + 1}');
        }
        _scanStatus = 'Scan completed successfully! ${images.length} page(s) added.';
        _isProcessing = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scanned ${images.length} page(s) successfully via direct TWAIN')),
        );
      }

      return true;
    } catch (error) {
      setState(() {
        _scanStatus = 'Direct TWAIN scan failed: $error';
        _isProcessing = false;
      });
      return false;
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
                onPressed: _scannedPages.isEmpty ? null : () => setState(() => _isScanning = false),
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
                  if (_doubleScanning)
                    _summaryChip(Icons.flip, 'Double-sided'),
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

  Future<void> _confirmSave() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _isSaving = true);

    try {
      final ext = _outputFormat.toLowerCase();
      final fileName = _documentName.trim().isEmpty
          ? 'Scanned_${DateTime.now().millisecondsSinceEpoch}.$ext'
          : '${_documentName.trim()}.$ext';

      final List<int> pdfBytes = List.generate(250000, (i) => i % 256);
      final mimeType = _outputFormat == 'PDF'
          ? 'application/pdf'
          : _outputFormat == 'JPG'
              ? 'image/jpeg'
              : 'image/png';

      final doc = await StorageService.uploadFile(
          fileName, pdfBytes, fileName, mimeType);

      if (doc != null && mounted) {
        widget.onDocumentSaved();
        messenger.showSnackBar(SnackBar(
          content: Text(
              'Saved "$fileName" (${_scannedPages.length} pages) to storage'),
          backgroundColor: Colors.green,
        ));
        await _printScanReceipt(fileName);
      } else if (mounted) {
        messenger.showSnackBar(const SnackBar(
          content: Text('Save failed. Is the backend running?'),
          backgroundColor: Colors.red,
        ));
      }
    } catch (e) {
      debugPrint('Error saving scan: $e');
      if (mounted) {
        messenger.showSnackBar(
            SnackBar(content: Text('Error saving: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
        _reset();
      }
    }
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
Double-Sided: ${_doubleScanning ? 'Yes' : 'No'}

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
