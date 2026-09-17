import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../scanner_status.dart';
import '../kiosk_runtime_service.dart';
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
  ScannerStatusSnapshot _scannerStatus = const ScannerStatusSnapshot.checking();
  final ScannerStatusService _scannerStatusService = const ScannerStatusService();
  Timer? _adfStatusTimer;

  @override
  void initState() {
    super.initState();
    _refreshAdfStatus();
    _adfStatusTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _refreshAdfStatus(),
    );
    // Recompute the cost breakdown when the admin retunes prices.
    KioskRuntime.instance.addListener(_onPricingChanged);
    // Event-triggered paper-tray reading for this service session — not a
    // timer; see KioskRuntime.pollPaperTraysOnce. (Distinct from the ADF
    // feeder-status timer above, which checks the scanner's input tray, not
    // the printer's output paper trays.)
    KioskRuntime.instance.pollPaperTraysOnce('photocopying_service_open');
  }

  @override
  void dispose() {
    KioskRuntime.instance.removeListener(_onPricingChanged);
    _adfStatusTimer?.cancel();
    super.dispose();
  }

  void _onPricingChanged() {
    if (mounted) setState(() {});
  }

  Future<bool> _refreshAdfStatus() async {
    final snapshot = await _scannerStatusService.check();
    if (!mounted) return snapshot.canScan;
    setState(() => _scannerStatus = snapshot);
    return snapshot.canScan;
  }

  // ── Pricing: cost per page per copy ──────────────────────────────────────
  // Rates come from the admin console (KioskRuntime.pricing); the built-in
  // defaults are Color: High ₱5 / Standard ₱4 / Draft ₱3, B&W ₱3 / ₱2 / ₱1.

  double get _costPerPage =>
      KioskRuntime.instance.pricing.copyTier(_quality).forMode(_colorMode);

  double get _totalCost => _costPerPage * _pageCount * _copies;

  String get _qualityLabel =>
      _quality == 'high' ? 'High' : _quality == 'standard' ? 'Standard' : 'Draft';

  // ── Phase 1: Pre-scan ADF before payment ─────────────────────────────────

  Future<void> _preScanDocuments() async {
    final adfReady = await _refreshAdfStatus();
    if (!mounted) return;
    if (!adfReady) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Place a document in the ADF before scanning.')),
      );
      return;
    }

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

      if (!mounted) return;

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
      if (!mounted) return;
      setState(() {
        _isPreScanning = false;
        _preScanError = 'Scan error: $e';
      });
    }
  }

  // ── Phase 2: Print from stored session after payment succeeds ─────────────

  // transactionId is accepted for signature compatibility with pendingJob but
  // not yet used — photocopy jobs don't have a durable stored-file record to
  // link it to (Staff Print Recovery currently covers Printing/Image-Print
  // only; see the recovery route's docs for why).
  Future<void> _executePhotocopyJob([String? transactionId]) async {
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

    // Job succeeded — paper was just consumed, so refresh the cached levels
    // once. Event-triggered, not a timer.
    KioskRuntime.instance.pollPaperTraysOnce('photocopy_completed');
  }

  // ── Navigate to payment; print job fires after payment succeeds ───────────

  Future<void> _proceedToPayment() async {
    final proceed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirm photocopy job'),
        content: Text(
          '$_pageCount page(s) × $_copies ${_copies == 1 ? 'copy' : 'copies'}\n'
          'Total: ₱${_totalCost.toStringAsFixed(2)}\n\n'
          'The documents have already been scanned and will be printed after payment.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Review'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Continue to Payment'),
          ),
        ],
      ),
    );
    if (proceed != true || !mounted) return;

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
    final colorScheme = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — matches Printing Service
          Row(
            children: [
              Icon(Icons.content_copy, size: 32, color: colorScheme.primary),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Photocopying Service',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: colorScheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    Text(
                      'Scan first, see the exact page count, then pay',
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

          if (_preScanError.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline, color: colorScheme.onErrorContainer, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _preScanError,
                      style: TextStyle(fontSize: 12, color: colorScheme.onErrorContainer),
                    ),
                  ),
                ],
              ),
            ),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Left column — how it works + estimated cost
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
                              'How it works',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            const SizedBox(height: 16),
                            Container(
                              decoration: BoxDecoration(
                                border: Border.all(color: colorScheme.outlineVariant, width: 2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              padding: const EdgeInsets.all(32),
                              child: Column(
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
                                    'Choose your options, then tap Scan Documents below. '
                                    'You\'ll see the exact page count and cost before paying.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                        fontSize: 11, color: colorScheme.onSurfaceVariant, height: 1.4),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _buildEstimatedCostCard(),
                  ],
                ),
              ),
              const SizedBox(width: 32),
              // Right column — settings + scan button
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
                              'Copy Settings',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            const SizedBox(height: 16),
                            const Text('Number of Copies',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Tooltip(
                                  message: 'Decrease number of copies',
                                  child: ElevatedButton(
                                    onPressed: _copies > 1
                                        ? () => setState(() => _copies--)
                                        : null,
                                    child: const Text('-', semanticsLabel: 'Decrease copies'),
                                  ),
                                ),
                                Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8),
                                    child: Container(
                                      alignment: Alignment.center,
                                      padding: const EdgeInsets.symmetric(vertical: 12),
                                      decoration: BoxDecoration(
                                        border: Border.all(color: colorScheme.outlineVariant),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        _copies.toString(),
                                        style: const TextStyle(
                                            fontSize: 20, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ),
                                ),
                                Tooltip(
                                  message: 'Increase number of copies',
                                  child: ElevatedButton(
                                    onPressed: _copies < 20
                                        ? () => setState(() => _copies++)
                                        : null,
                                    child: const Text('+', semanticsLabel: 'Increase copies'),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            _buildDropdown(
                              'Color Mode',
                              _colorMode,
                              const ['color', 'bw'],
                              (val) => setState(() => _colorMode = val),
                              const ['Color', 'B&W'],
                            ),
                            const SizedBox(height: 16),
                            _buildDropdown(
                              'Paper Size',
                              _paperSize,
                              const ['A4', 'Letter', 'Folio'],
                              (val) => setState(() => _paperSize = val),
                              const [
                                'A4 (210 x 297 mm)',
                                'Letter (216 x 279 mm)',
                                'Folio (216 x 330 mm)',
                              ],
                            ),
                            const SizedBox(height: 16),
                            _buildDropdown(
                              'Copy Quality',
                              _quality,
                              const ['draft', 'standard', 'high'],
                              (val) => setState(() => _quality = val),
                              [
                                _qualityDropdownLabel('Draft',
                                    KioskRuntime.instance.pricing.copyDraft),
                                _qualityDropdownLabel('Standard',
                                    KioskRuntime.instance.pricing.copyStandard),
                                _qualityDropdownLabel('High',
                                    KioskRuntime.instance.pricing.copyHigh),
                              ],
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
                        onPressed: !_scannerStatus.canScan ? null : _preScanDocuments,
                        icon: const Icon(Icons.document_scanner),
                        label: const Text('Scan Documents'),
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
        ],
      ),
    );
  }

  /// "Draft (₱1 B&W / ₱3 Color)" — mirrors Printing Service's quality labels.
  static String _qualityDropdownLabel(String name, PagePrice p) {
    String peso(double v) {
      final s = v.toStringAsFixed(2);
      return s.endsWith('.00') ? s.substring(0, s.length - 3) : s;
    }

    return '$name (₱${peso(p.bw)} B&W / ₱${peso(p.color)} Color)';
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
          Text(
            'Please wait — all pages are being scanned from the ADF.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
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
          const SizedBox(height: 16),

          _buildScanPreview(),
          const SizedBox(height: 24),

          // Cost breakdown card
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Cost Breakdown',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.onPrimaryContainer,
                        ),
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
                      Text('Total',
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: Theme.of(context).colorScheme.onPrimaryContainer)),
                      Text(
                        '₱${_totalCost.toStringAsFixed(2)}',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.onPrimaryContainer,
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
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
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

          if (KioskRuntime.instance.outOfPaper)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Icon(Icons.inventory_2_outlined,
                      size: 16, color: Theme.of(context).colorScheme.error),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Out of paper — photocopying is unavailable right now.',
                      style: TextStyle(
                          fontSize: 12, color: Theme.of(context).colorScheme.error),
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed:
                  KioskRuntime.instance.outOfPaper ? null : _proceedToPayment,
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

  // Preview of the pages already scanned in this session — served straight
  // from the temp JPEGs photocopy-prepare wrote to disk (see
  // GET /api/scan/photocopy-preview on the backend). Lets the customer catch
  // a mis-feed or a blank/skewed page before paying, since the print only
  // happens after payment succeeds.
  String _previewUrl(int pageIndex) =>
      '${BackendConfig.serverUrl}/api/scan/photocopy-preview/$_sessionId/$pageIndex';

  Widget _buildScanPreview() {
    if (_sessionId == null || _pageCount == 0) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Preview',
                style: Theme.of(context)
                    .textTheme
                    .titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            SizedBox(
              height: 140,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _pageCount,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final url = _previewUrl(index);
                  return GestureDetector(
                    onTap: () => _showFullPreview(url, index),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 100,
                        color: Colors.grey[200],
                        child: Image.network(
                          url,
                          fit: BoxFit.cover,
                          loadingBuilder: (context, child, progress) =>
                              progress == null
                                  ? child
                                  : const Center(
                                      child: SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2),
                                      ),
                                    ),
                          errorBuilder: (context, error, stack) => const Center(
                            child: Icon(Icons.broken_image_outlined,
                                color: Colors.grey),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Tap a page to view it larger.',
              style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showFullPreview(String url, int index) {
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
                  Text('Page ${index + 1} of $_pageCount',
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
                child: Image.network(
                  url,
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

  // Shown on the settings screen, before scanning — the real total (in
  // _buildConfirmView) needs the actual page count, which we don't have
  // yet, so this is a clearly-labelled per-page estimate the customer can
  // use to gauge cost before committing to scan.
  Widget _buildEstimatedCostCard() {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      color: colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Estimated Cost',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onPrimaryContainer,
                      ),
                ),
                Text(
                  '₱${(_costPerPage * _copies).toStringAsFixed(2)}',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '₱${_costPerPage.toStringAsFixed(2)} per page × $_copies ${_copies == 1 ? 'copy' : 'copies'}',
              style: TextStyle(fontSize: 12, color: colorScheme.onPrimaryContainer),
            ),
            const SizedBox(height: 4),
            Text(
              'Per page scanned — final total depends on the actual page count, shown before you pay.',
              style: TextStyle(
                fontSize: 11,
                color: colorScheme.onPrimaryContainer.withValues(alpha: 0.8),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _costRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
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
