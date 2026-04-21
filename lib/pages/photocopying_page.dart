import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
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

  // ── Pricing ───────────────────────────────────────────────────────────────
  // Color: High=5, Standard=4, Draft=3  |  B&W: High=3, Standard=2, Draft=1

  double get _costPerCopy {
    if (_colorMode == 'color') {
      return _quality == 'high' ? 5.0 : _quality == 'standard' ? 4.0 : 3.0;
    } else {
      return _quality == 'high' ? 3.0 : _quality == 'standard' ? 2.0 : 1.0;
    }
  }

  double get _totalCost => _costPerCopy * _copies;

  String get _qualityLabel =>
      _quality == 'high' ? 'High' : _quality == 'standard' ? 'Standard' : 'Draft';

  // ── Post-payment: scan ADF then print using user preferences ─────────────

  Future<void> _executePhotocopyJob() async {
    final response = await http
        .post(
          Uri.parse('${BackendConfig.serverUrl}/api/scan/photocopy'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'copies':    _copies,
            'paperSize': _paperSize,
            'colorMode': _colorMode,
            'quality':   _quality,
          }),
        )
        .timeout(const Duration(minutes: 10));

    if (response.statusCode != 200) {
      String msg;
      try {
        msg = (jsonDecode(response.body) as Map<String, dynamic>)['error']
                as String? ?? 'Photocopy failed';
      } catch (_) {
        msg = 'Photocopy failed (HTTP ${response.statusCode})';
      }
      throw Exception(msg);
    }
  }

  // ── Navigate to payment; job fires after payment succeeds ─────────────────

  void _proceedToPayment() {
    PAYMONGOPaymentPageState.pendingAmount  = _totalCost;
    PAYMONGOPaymentPageState.printFiles     = [];
    PAYMONGOPaymentPageState.paperSize      = _paperSize;
    PAYMONGOPaymentPageState.colorMode      = _colorMode;
    PAYMONGOPaymentPageState.quality        = _quality;
    PAYMONGOPaymentPageState.printContent   = '''PHOTOCOPYING JOB
-----------------
Copies: $_copies
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Paper Size: $_paperSize
Copy Quality: $_qualityLabel
Total Cost: PHP ${_totalCost.toStringAsFixed(2)}''';
    PAYMONGOPaymentPageState.pendingReceiptContent = _buildReceipt();
    PAYMONGOPaymentPageState.pendingJob = _executePhotocopyJob;
    widget.onNavigate('payment');
  }

  // ── Receipt ───────────────────────────────────────────────────────────────

  String _buildReceipt() {
    return '''
========================================
         PHOTOCOPYING RECEIPT
   ${DateTime.now().toString().split('.')[0]}
========================================

Service: Photocopying
Copies: $_copies
Paper Size: $_paperSize
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Copy Quality: $_qualityLabel

----------------------------------------
Cost per Copy: PHP ${_costPerCopy.toStringAsFixed(2)}
Total Copies: $_copies
Total Cost: PHP ${_totalCost.toStringAsFixed(2)}

----------------------------------------
Date: ${DateTime.now().toString().split('.')[0]}
Status: [COPY JOB SUBMITTED]
Documents will be scanned and printed automatically.

----------------------------------------
Thank you for using our service!
''';
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Status banner
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
                    'Scanner Connected — Brother MFC-J2730DW detected. Ready for photocopying.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ),
              ],
            ),
          ),

          // Header
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
                      const Text('Select options, pay, then we scan and print for you.'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Number of Copies
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Number of Copies',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      IconButton(
                        onPressed:
                            _copies > 1 ? () => setState(() => _copies--) : null,
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
                            style: const TextStyle(
                                fontSize: 24, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed:
                            _copies < 20 ? () => setState(() => _copies++) : null,
                        icon: const Icon(Icons.add_circle),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Color Mode
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
                    children: ['color', 'bw'].map((mode) {
                      return FilterChip(
                        label: Text(mode == 'color' ? 'Color' : 'B&W'),
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

          // Paper Size
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
                    children: ['A4', 'Letter', 'Folio'].map((size) {
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

          // Copy Quality
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Copy Quality',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['high', 'standard', 'draft'].map((q) {
                      final label = q == 'high'
                          ? 'High'
                          : q == 'standard'
                              ? 'Standard'
                              : 'Draft';
                      return FilterChip(
                        label: Text(label),
                        selected: _quality == q,
                        onSelected: (_) => setState(() => _quality = q),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Estimated Cost
          Card(
            color: Colors.blue[50],
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(
                    'Estimated Cost',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '₱${_totalCost.toStringAsFixed(2)}',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: const Color(0xFF2563EB),
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '₱${_costPerCopy.toStringAsFixed(2)} per copy × $_copies',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Proceed button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _proceedToPayment,
              icon: const Icon(Icons.payment),
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
