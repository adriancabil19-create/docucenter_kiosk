// DEMO MODE: Photocopying requires physical copier hardware.
// This page simulates the photocopying workflow for thesis/demo purposes.
import 'package:flutter/material.dart';
import 'payment_page.dart';

class PhotocopyingInterface extends StatefulWidget {
  final Function(String) onNavigate;
  final Function() onDocumentSaved;

  const PhotocopyingInterface({
    super.key,
    required this.onNavigate,
    required this.onDocumentSaved,
  });

  @override
  State<PhotocopyingInterface> createState() => _PhotocopyingInterfaceState();
}

class _PhotocopyingInterfaceState extends State<PhotocopyingInterface> {
  int _copies = 1;
  String _colorMode = 'color';
  String _paperSize = 'A4';
  String _quality = 'standard';
  bool _collate = true;
  double _brightness = 0.0; // -1.0 to 1.0
  double _contrast = 0.0;   // -1.0 to 1.0

  double _calculateCopyingCost() {
    final double costPerCopy = _colorMode == 'color' ? 3.0 : 2.0;
    return costPerCopy * _copies;
  }

  /// Build receipt text for photocopying — called after payment succeeds.
  String _buildCopyingReceipt() {
    String brightnessLabel;
    if (_brightness < -0.1) {
      brightnessLabel = 'Dark (${(_brightness * 100).round()}%)';
    } else if (_brightness > 0.1) {
      brightnessLabel = 'Bright (+${(_brightness * 100).round()}%)';
    } else {
      brightnessLabel = 'Normal';
    }

    String contrastLabel;
    if (_contrast < -0.1) {
      contrastLabel = 'Low (${(_contrast * 100).round()}%)';
    } else if (_contrast > 0.1) {
      contrastLabel = 'High (+${(_contrast * 100).round()}%)';
    } else {
      contrastLabel = 'Normal';
    }

    return '''
========================================
         PHOTOCOPYING RECEIPT
   ${DateTime.now().toString().split('.')[0]}
========================================

Service: Photocopying
Copies Requested: $_copies
Paper Size: $_paperSize
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Copy Quality: ${_quality == 'draft' ? 'Draft' : 'Standard'}
Collate: ${_collate ? 'Yes (1-2-3, 1-2-3)' : 'No (1-1-1, 2-2-2)'}
Brightness: $brightnessLabel
Contrast: $contrastLabel

----------------------------------------
Cost Breakdown:
Cost per Copy: PHP ${(_colorMode == 'color' ? 3.0 : 2.0).toStringAsFixed(2)}
Total Copies: $_copies
Total Cost: PHP ${_calculateCopyingCost().toStringAsFixed(2)}

----------------------------------------
Date: ${DateTime.now().toString().split('.')[0]}
Status: [COPY JOB SUBMITTED]

Document will be copied automatically.

----------------------------------------
Thank you for using our service!
''';
  }

  void _startPhotocopying() {
    GCashPaymentPageState.pendingAmount = _calculateCopyingCost();
    GCashPaymentPageState.printContent = '''PHOTOCOPYING JOB
-----------------
Copies: $_copies
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Paper Size: $_paperSize
Copy Quality: ${_quality == 'draft' ? 'Draft' : 'Standard'}
Collate: ${_collate ? 'Yes' : 'No'}
Total Cost: PHP ${_calculateCopyingCost().toStringAsFixed(2)}''';
    GCashPaymentPageState.printFiles = [];
    GCashPaymentPageState.paperSize = _paperSize;
    GCashPaymentPageState.colorMode = _colorMode;
    GCashPaymentPageState.quality = _quality;
    // Store the photocopying receipt so it prints AFTER payment succeeds
    GCashPaymentPageState.pendingReceiptContent = _buildCopyingReceipt();

    widget.onNavigate('payment');
  }

  @override
  Widget build(BuildContext context) {
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
                    'Demo Mode — Copier hardware not connected. This simulates the photocopying workflow.',
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
                const Icon(Icons.copyright, size: 32, color: Color(0xFF2563EB)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Photocopying Service',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: const Color(0xFF003D99),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Text('Document will be scanned and copied automatically'),
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
                    'Number of Copies',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      IconButton(
                        onPressed: _copies > 1 ? () => setState(() => _copies--) : null,
                        icon: const Icon(Icons.remove_circle),
                      ),
                      Expanded(
                        child: Container(
                          alignment: Alignment.center,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey[300]!),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _copies.toString(),
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _copies < 20 ? () => setState(() => _copies++) : null,
                        icon: const Icon(Icons.add_circle),
                      ),
                    ],
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
                    'Color Mode',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      FilterChip(
                        label: const Text('Color'),
                        selected: _colorMode == 'color',
                        onSelected: (_) => setState(() => _colorMode = 'color'),
                      ),
                      FilterChip(
                        label: const Text('Black & White'),
                        selected: _colorMode == 'bw',
                        onSelected: (_) => setState(() => _colorMode = 'bw'),
                      ),
                    ],
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
                    'Copy Quality',
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Image Adjustments',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const SizedBox(width: 80, child: Text('Brightness', style: TextStyle(fontSize: 12))),
                      Expanded(
                        child: Slider(
                          value: _brightness,
                          min: -1.0,
                          max: 1.0,
                          divisions: 20,
                          label: _brightness == 0 ? 'Normal' : '${(_brightness * 100).round()}%',
                          onChanged: (val) => setState(() => _brightness = val),
                        ),
                      ),
                      SizedBox(
                        width: 48,
                        child: Text(
                          _brightness == 0 ? 'Norm' : '${(_brightness * 100).round()}%',
                          style: const TextStyle(fontSize: 11),
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      const SizedBox(width: 80, child: Text('Contrast', style: TextStyle(fontSize: 12))),
                      Expanded(
                        child: Slider(
                          value: _contrast,
                          min: -1.0,
                          max: 1.0,
                          divisions: 20,
                          label: _contrast == 0 ? 'Normal' : '${(_contrast * 100).round()}%',
                          onChanged: (val) => setState(() => _contrast = val),
                        ),
                      ),
                      SizedBox(
                        width: 48,
                        child: Text(
                          _contrast == 0 ? 'Norm' : '${(_contrast * 100).round()}%',
                          style: const TextStyle(fontSize: 11),
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ],
                  ),
                  if (_brightness != 0 || _contrast != 0)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () => setState(() { _brightness = 0; _contrast = 0; }),
                        child: const Text('Reset'),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Card(
            color: Colors.blue[50],
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(
                    'Estimated Cost',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '₱${_calculateCopyingCost().toStringAsFixed(2)}',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: const Color(0xFF2563EB),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _startPhotocopying,
              icon: const Icon(Icons.play_arrow),
              label: const Text('Proceed to Payment'),
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
}
