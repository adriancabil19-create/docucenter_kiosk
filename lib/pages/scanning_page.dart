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
  // State machine: settings → scanning → preview → (saved → settings)
  bool _isScanning = false;
  bool _showPreview = false;

  List<String> _scannedPages = [];
  String _colorMode = 'color';
  String _dpi = '300';
  String _outputFormat = 'PDF';
  String _paperSize = 'A4';
  String _quality = 'standard';
  bool _doubleScanning = false;
  String _documentName = '';
  bool _isSaving = false;

  void _reset() {
    setState(() {
      _isScanning = false;
      _showPreview = false;
      _scannedPages = [];
      _documentName = '';
    });
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
                  Text('Paper Size',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
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
                  Text('Output Format',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['PDF', 'JPG', 'PNG'].map((fmt) {
                      return FilterChip(
                        label: Text(fmt),
                        selected: _outputFormat == fmt,
                        onSelected: (_) => setState(() => _outputFormat = fmt),
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
                  Text('Scan Quality',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['draft', 'standard'].map((quality) {
                      return FilterChip(
                        label: Text(quality == 'draft' ? 'Draft' : 'Standard'),
                        selected: _quality == quality,
                        onSelected: (_) =>
                            setState(() => _quality = quality),
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

  // ── Active scanning screen ───────────────────────────────────────────────
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
                  valueColor:
                      AlwaysStoppedAnimation(Color(0xFF2563EB)),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Scanning Documents',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold),
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
                      child: Center(
                          child: Icon(Icons.image,
                              size: 40, color: Colors.grey[400])),
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
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => setState(
                    () => _scannedPages.add('page_${_scannedPages.length + 1}')),
                icon: const Icon(Icons.add),
                label: const Text('Scan Page'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _scannedPages.isEmpty
                    ? null
                    : () => setState(() {
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

  // ── Preview & Confirm screen ─────────────────────────────────────────────
  Widget _buildPreview() {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Preview header
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
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.insert_drive_file,
                                size: 36, color: Colors.grey[400]),
                            const SizedBox(height: 4),
                            Text(
                              'Page ${index + 1}',
                              style: const TextStyle(
                                  fontSize: 10, color: Color(0xFF6B7280)),
                            ),
                          ],
                        ),
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
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _isSaving ? null : _confirmSave,
                          icon: _isSaving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.save),
                          label: Text(_isSaving
                              ? 'Saving...'
                              : 'Confirm & Save to Storage'),
                          style: ElevatedButton.styleFrom(
                            padding:
                                const EdgeInsets.symmetric(vertical: 14),
                            backgroundColor: const Color(0xFF2563EB),
                          ),
                        ),
                      ),
                    ],
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
                child: OutlinedButton.icon(
                  onPressed: _isSaving
                      ? null
                      : () => setState(() {
                            _showPreview = false;
                            _isScanning = true;
                          }),
                  icon: const Icon(Icons.arrow_back, size: 16),
                  label: const Text('Re-scan'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isSaving ? null : _reset,
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Discard'),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red),
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
