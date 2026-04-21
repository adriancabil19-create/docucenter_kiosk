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

  // Pre-scan state
  bool _isPreScanning = false;
  String? _sessionId;
  int _pageCount = 0;
  String _preScanError = '';

  // ── Pricing: cost per page per copy ──────────────────────────────────────
  // Color: High=₱5, Standard=₱4, Draft=₱3  |  B&W: High=₱3, Standard=₱2, Draft=₱1

  double get _costPerPage {
    if (_colorMode == 'color') {
      return _quality == 'high' ? 5.0 : _quality == 'standard' ? 4.0 : 3.0;
    } else {
      return _quality == 'high' ? 3.0 : _quality == 'standard' ? 2.0 : 1.0;
    }
  }

  double get _totalCost => _costPerPage * _pageCount * _copies;

  String get _qualityLabel =>
      _quality == 'high' ? 'High' : _quality == 'standard' ? 'Standard' : 'Draft';

  // ── Phase 1: Pre-scan ADF before payment ─────────────────────────────────

  Future<void> _preScanDocuments() async {
    setState(() {
      _isPreScanning = true;
      _sessionId = null;
      _pageCount = 0;
      _preScanError = '';
    });

    try {
      final response = await http
          .post(
            Uri.parse('${BackendConfig.serverUrl}/api/scan/photocopy-prepare'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'colorMode': _colorMode, 'quality': _quality}),
          )
          .timeout(const Duration(minutes: 7));

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        setState(() {
          _sessionId = body['sessionId'] as String?;
          _pageCount = body['pageCount'] as int? ?? 0;
          _isPreScanning = false;
        });
      } else {
        String msg;
        try {
          msg = (jsonDecode(response.body) as Map<String, dynamic>)['error']
                  as String? ??
              'Scan failed';
        } catch (_) {
          msg = 'Scan failed (HTTP ${response.statusCode})';
        }
        setState(() {
          _isPreScanning = false;
          _preScanError = msg;
        });
      }
    } catch (e) {
      setState(() {
        _isPreScanning = false;
        _preScanError = 'Scan error: $e';
      });
    }
  }

  // ── Phase 2: Print from stored session after payment succeeds ─────────────

  Future<void> _executePhotocopyJob() async {
    final response = await http
        .post(
          Uri.parse('${BackendConfig.serverUrl}/api/scan/photocopy-execute'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'sessionId': _sessionId,
            'copies': _copies,
            'paperSize': _paperSize,
            'colorMode': _colorMode,
            'quality': _quality,
          }),
        )
        .timeout(const Duration(minutes: 10));

    if (response.statusCode != 200) {
      String msg;
      try {
        msg = (jsonDecode(response.body) as Map<String, dynamic>)['error']
                as String? ??
            'Photocopy failed';
      } catch (_) {
        msg = 'Photocopy failed (HTTP ${response.statusCode})';
      }
      throw Exception(msg);
    }
  }

  // ── Navigate to payment; print job fires after payment succeeds ───────────

  void _proceedToPayment() {
    PAYMONGOPaymentPageState.pendingAmount = _totalCost;
    PAYMONGOPaymentPageState.printFiles = [];
    PAYMONGOPaymentPageState.paperSize = _paperSize;
    PAYMONGOPaymentPageState.colorMode = _colorMode;
    PAYMONGOPaymentPageState.quality = _quality;
    PAYMONGOPaymentPageState.printContent = '''PHOTOCOPYING JOB
-----------------
Pages Scanned: $_pageCount
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
Pages Scanned: $_pageCount
Copies: $_copies
Paper Size: $_paperSize
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Copy Quality: $_qualityLabel

----------------------------------------
Cost per Page: PHP ${_costPerPage.toStringAsFixed(2)}
Total Pages Printed: ${_pageCount * _copies}
Total Cost: PHP ${_totalCost.toStringAsFixed(2)}

----------------------------------------
Date: ${DateTime.now().toString().split('.')[0]}
Status: [COPY JOB SUBMITTED]
Documents are being printed.

----------------------------------------
Thank you for using our service!
''';
  }

  // ── UI state machine: settings → scanning → confirm ───────────────────────

  @override
  Widget build(BuildContext context) {
    if (_isPreScanning) return _buildScanningView();
    if (_sessionId != null) return _buildConfirmView();
    return _buildSettingsView();
  }

  // ── Settings screen ───────────────────────────────────────────────────────

  Widget _buildSettingsView() {
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              border: Border.all(color: Colors.blue),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: Colors.blue, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Place all documents in the ADF, select your options below, then tap Scan Documents.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ),
              ],
            ),
          ),

          if (_preScanError.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.red[50],
                border: Border.all(color: Colors.red),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _preScanError,
                      style: const TextStyle(fontSize: 12, color: Colors.red),
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
                      const Text('Scan first → see page count → pay → print'),
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
                      return FilterChip(
                        label: Text(q == 'high'
                            ? 'High'
                            : q == 'standard'
                                ? 'Standard'
                                : 'Draft'),
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

          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _preScanDocuments,
              icon: const Icon(Icons.document_scanner),
              label: const Text('Scan Documents'),
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

  // ── Scanning progress screen ──────────────────────────────────────────────

  Widget _buildScanningView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(strokeWidth: 4),
          const SizedBox(height: 24),
          Text(
            'Scanning documents...',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          const Text(
            'Please wait — all pages are being scanned from the ADF.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black54),
          ),
        ],
      ),
    );
  }

  // ── Confirmation screen (post-scan, pre-payment) ──────────────────────────

  Widget _buildConfirmView() {
    return SingleChildScrollView(
      child: Column(
        children: [
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
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$_pageCount page(s) scanned successfully',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Colors.green[900],
                            ),
                      ),
                      Text(
                        'Review the cost breakdown below, then proceed to payment.',
                        style: TextStyle(color: Colors.green[700], fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Cost breakdown card
          Card(
            color: Colors.blue[50],
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Cost Breakdown',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  _costRow('Pages scanned', '$_pageCount pages'),
                  _costRow('Copies', '× $_copies'),
                  _costRow(
                      'Rate', '₱${_costPerPage.toStringAsFixed(2)} per page'),
                  const Divider(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total',
                          style: TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 16)),
                      Text(
                        '₱${_totalCost.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 22,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Options summary
          Card(
            color: Colors.grey[50],
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 16,
                runSpacing: 4,
                children: [
                  _summaryChip(Icons.color_lens,
                      _colorMode == 'color' ? 'Color' : 'B&W'),
                  _summaryChip(Icons.article, _paperSize),
                  _summaryChip(Icons.star, _qualityLabel),
                  _summaryChip(Icons.copy,
                      '$_copies cop${_copies == 1 ? 'y' : 'ies'}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

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
          const SizedBox(height: 12),

          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => setState(() {
                _sessionId = null;
                _pageCount = 0;
                _preScanError = '';
              }),
              icon: const Icon(Icons.refresh),
              label: const Text('Re-scan Documents'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _costRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
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
            style: const TextStyle(fontSize: 12, color: Color(0xFF4B5563))),
      ],
    );
  }
}
