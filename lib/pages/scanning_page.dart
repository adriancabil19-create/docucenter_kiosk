// DEMO MODE: Scanning requires physical scanner hardware.
// This page simulates the scanning workflow for thesis/demo purposes.
import 'package:flutter/material.dart';
import '../payment_service.dart';
import '../storage_service.dart';

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
  bool _isScanning = false;
  List<String> _scannedPages = [];
  String _colorMode = 'color';
  String _dpi = '300';
  String _outputFormat = 'PDF';
  String _paperSize = 'A4';
  String _quality = 'standard';
  bool _doubleScanning = false;
  String _documentName = '';

  @override
  Widget build(BuildContext context) {
    if (_isScanning && _scannedPages.isNotEmpty) {
      return _buildScanningComplete();
    }
    if (_isScanning) {
      return _buildScanning();
    }
    return _buildScanSettings();
  }

  Widget _buildScanSettings() {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Demo mode notice
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.amber[50],
              border: Border.all(color: Colors.amber),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: Colors.amber, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Demo Mode — Scanner hardware not connected. This simulates the scanning workflow.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
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
                const Icon(Icons.settings, size: 32, color: Color(0xFF2563EB)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Scan Settings',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: const Color(0xFF003D99),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Text('Configure your scanning preferences'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Color Mode',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['color', 'grayscale', 'bw'].map((mode) {
                      final label = mode == 'bw' ? 'B&W' : mode == 'color' ? 'Color' : 'Grayscale';
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
                  Text(
                    'DPI (Resolution)',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
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
                    'Paper Size',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['A4', 'Folio', 'Letter', 'Legal'].map((size) {
                      return FilterChip(
                        label: Text(size),
                        selected: _paperSize == size,
                        onSelected: (_) => setState(() => _paperSize = size),
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
                    'Scan Quality',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['draft', 'standard'].map((quality) {
                      final label = quality == 'draft' ? 'Draft' : 'Standard';
                      return FilterChip(
                        label: Text(label),
                        selected: _quality == quality,
                        onSelected: (_) => setState(() => _quality = quality),
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
              child: CheckboxListTile(
                title: const Text('Double-sided Scanning'),
                subtitle: const Text('Scan both sides of documents'),
                value: _doubleScanning,
                onChanged: (val) => setState(() => _doubleScanning = val ?? false),
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
                  _scannedPages = [];
                });
              },
              icon: const Icon(Icons.play_arrow),
              label: const Text('Start Scanning'),
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

  Widget _buildScanning() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.blue[50],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              const SizedBox(
                width: 60,
                height: 60,
                child: CircularProgressIndicator(
                  strokeWidth: 4,
                  valueColor: AlwaysStoppedAnimation(Color(0xFF2563EB)),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Scanning Documents',
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
                child: Stack(
                  children: [
                    Container(
                      color: Colors.grey[200],
                      child: Center(child: Icon(Icons.image, size: 40, color: Colors.grey[400])),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF2563EB),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: Text(
                          '${index + 1}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
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
                onPressed: () => setState(() => _scannedPages.add('page_${_scannedPages.length + 1}')),
                icon: const Icon(Icons.add),
                label: const Text('Scan More'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => setState(() => _isScanning = false),
                icon: const Icon(Icons.check),
                label: const Text('Finish'),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _printScanReceipt() async {
    // Capture messenger before any await — avoids use_build_context_synchronously
    final messenger = ScaffoldMessenger.of(context);
    try {
      final docName = _documentName.isEmpty
          ? 'Scanned_${DateTime.now().millisecondsSinceEpoch}'
          : _documentName;
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
      messenger.showSnackBar(
        SnackBar(
          content: Text(success ? 'Scan receipt printed!' : 'Print unavailable (demo mode)'),
          backgroundColor: success ? Colors.green : Colors.orange,
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      debugPrint('Error printing scan receipt: $e');
    }
  }

  Widget _buildScanningComplete() {
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.green[50],
              border: Border.all(color: Colors.green),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle, size: 40, color: Colors.green),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Scanning Complete',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Colors.green[900],
                        ),
                      ),
                      Text(
                        '${_scannedPages.length} pages scanned',
                        style: TextStyle(color: Colors.green[700]),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
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
                    Container(
                      color: Colors.grey[200],
                      child: Center(child: Icon(Icons.image, size: 40, color: Colors.grey[400])),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF2563EB),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: Text(
                          '${index + 1}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Save Scanned Documents',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    onChanged: (val) => _documentName = val,
                    decoration: InputDecoration(
                      labelText: 'Document Name',
                      hintText: 'e.g., Invoice_2026_Feb',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      suffixText: '.pdf',
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () async {
                        final ext = _outputFormat.toLowerCase();
                        final fileName = _documentName.isEmpty
                            ? 'Scanned_${DateTime.now().millisecondsSinceEpoch}.$ext'
                            : '$_documentName.$ext';

                        // Demo: generate placeholder bytes (simulated scan output)
                        final List<int> pdfBytes = List.generate(250000, (i) => i % 256);

                        final mimeType = _outputFormat == 'PDF'
                            ? 'application/pdf'
                            : _outputFormat == 'JPG'
                                ? 'image/jpeg'
                                : 'image/png';
                        final doc = await StorageService.uploadFile(
                          fileName, pdfBytes, fileName, mimeType,
                        );

                        if (doc != null && mounted) {
                          widget.onDocumentSaved();
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Saved ${_scannedPages.length} pages to storage'),
                              backgroundColor: Colors.green,
                            ),
                          );
                          await _printScanReceipt();
                        }

                        setState(() {
                          _isScanning = false;
                          _scannedPages = [];
                          _documentName = '';
                        });
                      },
                      icon: const Icon(Icons.save),
                      label: Text('Save as $_outputFormat'),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => setState(() {
                    _isScanning = false;
                    _scannedPages = [];
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
}
