import 'package:flutter/material.dart';
import '../storage_service.dart';
import '../kiosk_runtime_service.dart';
import '../paper_tracker_service.dart';
import '../receipt_format.dart';
import '../strings.dart';
import '../widgets/duplex_toggle.dart';
import '../widgets/print_preview_dialog.dart';
import 'payment_page.dart';

class PrintingInterface extends StatefulWidget {
  final Function() onBrowseStorage;
  final List<StorageDocument> selectedDocs;
  final Function() onClearSelectedDocs;
  final Function(String) onRemoveSelectedDoc;
  final Function(String) onNavigate;

  /// Restores a job the customer previously backed out of from the payment
  /// screen (e.g. to fix the paper size) instead of starting over.
  final String? initialPaperSize;
  final String? initialColorMode;
  final String? initialQuality;
  final int? initialCopies;
  final bool? initialDuplex;

  const PrintingInterface({
    super.key,
    required this.onBrowseStorage,
    required this.selectedDocs,
    required this.onClearSelectedDocs,
    required this.onRemoveSelectedDoc,
    required this.onNavigate,
    this.initialPaperSize,
    this.initialColorMode,
    this.initialQuality,
    this.initialCopies,
    this.initialDuplex,
  });

  @override
  State<PrintingInterface> createState() => _PrintingInterfaceState();
}

class _PrintingInterfaceState extends State<PrintingInterface> {
  late String _colorMode = widget.initialColorMode ?? 'bw';
  late String _quality = widget.initialQuality ?? 'standard';
  late String _paperSize = widget.initialPaperSize ?? 'A4';
  late int _copies = widget.initialCopies ?? 1;
  late bool _duplex = (widget.initialDuplex ?? false) && isDuplexPrintCapable(_paperSize);
  late final TextEditingController _copiesController;

  /// Per-page price for the current quality + colour, from the admin-configured
  /// price list (falls back to the built-in defaults before the first poll).
  double get _costPerPage => KioskRuntime.instance.pricing
      .printTier(_quality, _paperSize)
      .forMode(_colorMode);

  /// "1.50" but "2" — drop a redundant ".00".
  static String _peso(double v) {
    final s = v.toStringAsFixed(2);
    return s.endsWith('.00') ? s.substring(0, s.length - 3) : s;
  }

  static String _qualityLabel(String name, PagePrice p) =>
      '$name (₱${_peso(p.bw)} B&W / ₱${_peso(p.color)} Color)';

  double _calculateCost() {
    final totalPages =
        widget.selectedDocs.fold<int>(0, (sum, doc) => sum + doc.pages);
    return _costPerPage * totalPages * _copies;
  }

  void _onPricingChanged() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _copiesController = TextEditingController(text: _copies.toString());
    // Relabel the quality options / recompute cost when the admin retunes prices.
    KioskRuntime.instance.addListener(_onPricingChanged);
    // Event-triggered paper-tray reading for this service session — not a
    // timer; see KioskRuntime.pollPaperTraysOnce.
    KioskRuntime.instance.pollPaperTraysOnce('printing_service_open');
  }

  @override
  void dispose() {
    KioskRuntime.instance.removeListener(_onPricingChanged);
    _copiesController.dispose();
    super.dispose();
  }

  /// The tray currently loaded with the selected paper size, if any.
  PaperTray? get _matchingTray {
    for (final t in KioskRuntime.instance.paperTrays) {
      if (t.paperSize.toUpperCase() == _paperSize.toUpperCase()) return t;
    }
    return null;
  }

  Future<bool> _confirmEnoughPaper(int sheetsNeeded) async {
    final tray = _matchingTray;
    // Unknown tray mapping — don't block on a check we can't actually make.
    if (tray == null || tray.currentCount >= sheetsNeeded) return true;

    if (!mounted) return false;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: Colors.orange),
        title: const Text('Not enough paper loaded'),
        content: Text(
          'This job needs $sheetsNeeded sheet${sheetsNeeded == 1 ? '' : 's'} of '
          '$_paperSize, but the ${tray.trayName} tray only has '
          '${tray.currentCount} left.\n\n'
          'Pick a different paper size, reduce the number of copies, or ask '
          'staff to refill the tray before paying.',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    return false;
  }

  Future<void> _handlePrint() async {
    final allDocs = widget.selectedDocs;
    if (allDocs.isEmpty) return;

    final totalPages = allDocs.fold<int>(0, (sum, doc) => sum + doc.pages);
    // Duplex prints two pages per physical sheet.
    final sheetsNeeded = (_duplex ? (totalPages / 2).ceil() : totalPages) * _copies;
    if (!await _confirmEnoughPaper(sheetsNeeded)) return;
    if (!mounted) return;

    final costPerPage = totalPages > 0 && _copies > 0
        ? (_calculateCost() / (totalPages * _copies))
        : 0.0;

    final printDetails = [
      'PRINT JOB',
      kReceiptSubDivider,
      receiptRow('Paper Size', _paperSize),
      receiptRow('Color Mode', _colorMode == 'color' ? 'Color' : 'Black & White'),
      receiptRow('Quality',
          _quality == 'draft' ? 'Draft' : _quality == 'high' ? 'High' : 'Standard'),
      receiptRow('Copies', '$_copies'),
      receiptRow('Duplex', _duplex ? 'Yes (2-sided)' : 'No (1-sided)'),
      '',
      receiptRow('Files', '${allDocs.length}'),
      ...allDocs.map((doc) => '${doc.originalName} (${doc.pages}p)'),
      '',
      receiptRow('Cost per Page', 'PHP ${costPerPage.toStringAsFixed(2)}'),
      receiptRow('Total Pages', '$totalPages'),
    ].join('\n');

    // Expand filenames by copies count so the backend prints each file N times
    final baseFilenames = allDocs.map((d) => d.name).toList();
    final expandedFilenames = [
      for (int i = 0; i < _copies; i++) ...baseFilenames,
    ];
    PAYMONGOPaymentPageState.pendingAmount = _calculateCost();
    PAYMONGOPaymentPageState.printContent = printDetails;
    PAYMONGOPaymentPageState.printFiles = expandedFilenames;
    PAYMONGOPaymentPageState.paperSize = _paperSize;
    PAYMONGOPaymentPageState.colorMode = _colorMode;
    PAYMONGOPaymentPageState.quality = _quality;
    PAYMONGOPaymentPageState.copies = _copies;
    PAYMONGOPaymentPageState.duplex = _duplex;
    PAYMONGOPaymentPageState.selectedDocIds = allDocs.map((d) => d.id).toList();
    PAYMONGOPaymentPageState.pendingReceiptContent = '';
    widget.onNavigate('payment');
  }

  @override
  Widget build(BuildContext context) {
    final allDocs = widget.selectedDocs;
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.print, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  Strings.t('printing.heading'),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  Strings.t('printing.subheading'),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 32),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Left Column — upload + cost summary
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
                            Strings.t('printing.documents'),
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
                                Icon(Icons.folder_open, size: 48, color: colorScheme.onSurfaceVariant),
                                const SizedBox(height: 16),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: widget.onBrowseStorage,
                                    icon: const Icon(Icons.folder_open),
                                    label: Text(Strings.t('printing.browseStorage')),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF2563EB),
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(vertical: 14),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  allDocs.isEmpty
                                      ? Strings.t('printing.noDocsSelected')
                                      : '${allDocs.length} ${Strings.t('printing.docsSelected')}',
                                  style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  Strings.t('printing.storageHint'),
                                  textAlign: TextAlign.center,
                                  style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant, height: 1.4),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            Strings.t('printing.disclaimer'),
                            style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant, height: 1.4),
                          ),
                          // Show selected file list
                          if (allDocs.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            ...allDocs.map((doc) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                children: [
                                  IconButton(
                                    onPressed: () => widget.onRemoveSelectedDoc(doc.id),
                                    icon: const Icon(Icons.close, size: 16, color: Colors.red),
                                    tooltip: 'Remove from print job',
                                  ),
                                  const Icon(Icons.description, size: 16, color: Color(0xFF2563EB)),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      doc.originalName,
                                      style: const TextStyle(fontSize: 12),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Text(
                                    '${doc.pages}p',
                                    style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                                  ),
                                ],
                              ),
                            )),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
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
                                Strings.t('printing.estimatedCost'),
                                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: colorScheme.onPrimaryContainer,
                                ),
                              ),
                              Text(
                                '₱${_calculateCost().toStringAsFixed(2)}',
                                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  color: colorScheme.onPrimaryContainer,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${allDocs.fold<int>(0, (sum, doc) => sum + doc.pages)} ${Strings.t('printing.pages')} × $_copies ${_copies == 1 ? Strings.t('printing.copy') : Strings.t('printing.copiesShort')} • ${_colorMode == 'color' ? Strings.t('printing.color') : 'B&W'}',
                            style: TextStyle(fontSize: 12, color: colorScheme.onPrimaryContainer),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 32),
            // Right Column — settings + print button
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
                            Strings.t('printing.printSettings'),
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            Strings.t('printing.paperSize'),
                            _paperSize,
                            ['A4', 'Folio', 'Letter'],
                            (val) => setState(() {
                              _paperSize = val;
                              // Folio ("long") can't be duplexed — the
                              // printer's duplexer jams on it.
                              if (!isDuplexPrintCapable(_paperSize)) _duplex = false;
                            }),
                            ['A4 (210 x 297 mm)', 'Folio (216 x 330 mm)', 'Letter (216 x 279 mm)'],
                          ),
                          const SizedBox(height: 8),
                          DuplexToggle(
                            label: 'Print on both sides',
                            explanation: kDuplexExplanation,
                            value: _duplex,
                            enabled: isDuplexPrintCapable(_paperSize),
                            disabledReason: kDuplexPrintUnsupportedReason,
                            onChanged: (v) => setState(() => _duplex = v),
                          ),
                          const SizedBox(height: 8),
                          _buildDropdown(
                            Strings.t('printing.colorMode'),
                            _colorMode,
                            ['bw', 'color'],
                            (val) => setState(() => _colorMode = val),
                            [Strings.t('printing.bw'), Strings.t('printing.color')],
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            Strings.t('printing.quality'),
                            _quality,
                            ['draft', 'standard', 'high'],
                            (val) => setState(() => _quality = val),
                            [
                              _qualityLabel('Draft',
                                  KioskRuntime.instance.pricing.printTier('draft', _paperSize)),
                              _qualityLabel('Standard',
                                  KioskRuntime.instance.pricing.printTier('standard', _paperSize)),
                              _qualityLabel('High',
                                  KioskRuntime.instance.pricing.printTier('high', _paperSize)),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            '${Strings.t('printing.copies')} $_copies',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Tooltip(
                                message: 'Decrease number of copies',
                                child: ElevatedButton(
                                  onPressed: () {
                                    if (_copies > 1) {
                                      setState(() {
                                        _copies--;
                                        _copiesController.text = _copies.toString();
                                      });
                                    }
                                  },
                                  child: const Text('-', semanticsLabel: 'Decrease copies'),
                                ),
                              ),
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8),
                                  child: TextField(
                                    controller: _copiesController,
                                    onChanged: (val) {
                                      final parsed = int.tryParse(val);
                                      if (parsed != null && parsed > 0) {
                                        setState(() => _copies = parsed.clamp(1, 20));
                                      }
                                    },
                                    textAlign: TextAlign.center,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      labelText: 'Number of copies',
                                      helperText: '1 to 20',
                                      border: OutlineInputBorder(),
                                      isDense: true,
                                    ),
                                  ),
                                ),
                              ),
                              Tooltip(
                                message: 'Increase number of copies',
                                child: ElevatedButton(
                                  onPressed: () {
                                    if (_copies < 20) {
                                      setState(() {
                                        _copies++;
                                        _copiesController.text = _copies.toString();
                                      });
                                    }
                                  },
                                  child: const Text('+', semanticsLabel: 'Increase copies'),
                                ),
                              ),
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
                    child: OutlinedButton.icon(
                      onPressed: allDocs.isEmpty
                          ? null
                          : () => PrintPreviewDialog.show(
                                context,
                                allDocs,
                                paperSize: _paperSize,
                              ),
                      icon: const Icon(Icons.visibility_outlined),
                      label: Text(Strings.t('printing.preview')),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF2563EB),
                        side: const BorderSide(color: Color(0xFF2563EB)),
                      ),
                    ),
                  ),
                  if (KioskRuntime.instance.outOfPaper) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Icon(Icons.inventory_2_outlined,
                            size: 16, color: colorScheme.error),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Out of paper — printing is unavailable right now.',
                            style: TextStyle(fontSize: 12, color: colorScheme.error),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: allDocs.isEmpty || KioskRuntime.instance.outOfPaper
                          ? null
                          : _handlePrint,
                      icon: const Icon(Icons.print),
                      label: Text(Strings.t('printing.start')),
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
    );
  }

  Widget _buildDropdown(
    String label,
    String value,
    List<String> values,
    Function(String) onChanged,
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
}

