import 'package:flutter/material.dart';
import '../config.dart';
import '../storage_service.dart';
import '../kiosk_runtime_service.dart';
import '../print_service.dart';
import 'payment_page.dart';

/// Grid shape (columns x rows) for each supported images-per-page preset.
/// Mirrors LAYOUT_GRID in backend/src/services/print.service.ts.
const Map<int, ({int cols, int rows})> _layoutGrid = {
  1: (cols: 1, rows: 1),
  2: (cols: 1, rows: 2),
  4: (cols: 2, rows: 2),
  6: (cols: 2, rows: 3),
  9: (cols: 3, rows: 3),
};

/// Hard cap on images in a single layout job — mirrors MAX_IMAGES in
/// backend/src/routes/print.ts. Enforced here too so the customer is
/// stopped *before* paying for a job the backend will otherwise reject.
const int kMaxImagesPerPrintJob = 30;

class ImagePrintSettingsInterface extends StatefulWidget {
  final Function() onBrowseStorage;
  final List<StorageDocument> selectedDocs;
  final Function() onClearSelectedDocs;
  final Function(String) onRemoveSelectedDoc;
  final Function(String) onNavigate;

  const ImagePrintSettingsInterface({
    super.key,
    required this.onBrowseStorage,
    required this.selectedDocs,
    required this.onClearSelectedDocs,
    required this.onRemoveSelectedDoc,
    required this.onNavigate,
  });

  @override
  State<ImagePrintSettingsInterface> createState() => _ImagePrintSettingsInterfaceState();
}

class _ImagePrintSettingsInterfaceState extends State<ImagePrintSettingsInterface> {
  /// 'auto' | '1' | '2' | '4' | '6' | '9'
  String _layoutChoice = 'auto';

  /// 'auto' | '1R' | '2R' | '3R' | '4R' | '5R' | 'custom'
  String _imageSizeChoice = 'auto';

  /// 'auto' | 'portrait' | 'landscape'
  String _orientationChoice = 'auto';

  String _paperSize = 'A4';
  String _colorMode = 'color';
  final String _quality = 'standard';
  int _copies = 1;

  late final TextEditingController _copiesController;
  late final TextEditingController _customWidthController;
  late final TextEditingController _customHeightController;

  double get _costPerPage =>
      KioskRuntime.instance.pricing.printTier(_quality).forMode(_colorMode);

  /// Automatic layout: pick a sensible grid from the image count so the
  /// user doesn't have to think about it (section 5 — Automatic default).
  int get _effectiveImagesPerPage {
    if (_layoutChoice != 'auto') return int.parse(_layoutChoice);
    final n = widget.selectedDocs.length;
    if (n <= 1) return 1;
    if (n == 2) return 2;
    if (n <= 4) return 4;
    if (n <= 6) return 6;
    return 9;
  }

  int get _totalPages {
    final n = widget.selectedDocs.length;
    if (n == 0) return 0;
    return (n / _effectiveImagesPerPage).ceil();
  }

  double _calculateCost() => _costPerPage * _totalPages * _copies;

  void _onPricingChanged() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _copiesController = TextEditingController(text: _copies.toString());
    _customWidthController = TextEditingController(text: '4');
    _customHeightController = TextEditingController(text: '6');
    KioskRuntime.instance.addListener(_onPricingChanged);
  }

  @override
  void dispose() {
    KioskRuntime.instance.removeListener(_onPricingChanged);
    _copiesController.dispose();
    _customWidthController.dispose();
    _customHeightController.dispose();
    super.dispose();
  }

  Future<void> _handleContinue() async {
    final docs = widget.selectedDocs;
    if (docs.isEmpty) return;

    if (docs.length > kMaxImagesPerPrintJob) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please select $kMaxImagesPerPrintJob or fewer images for one print job.',
          ),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final filenames = docs.map((d) => d.name).toList();
    final perPage = _effectiveImagesPerPage;
    final totalPages = _totalPages;
    final cost = _calculateCost();

    final customWidth = _imageSizeChoice == 'custom' ? double.tryParse(_customWidthController.text) : null;
    final customHeight = _imageSizeChoice == 'custom' ? double.tryParse(_customHeightController.text) : null;

    if (_imageSizeChoice == 'custom' &&
        (customWidth == null || customWidth <= 0 || customHeight == null || customHeight <= 0)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter a valid custom width and height.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final printDetails = '''
IMAGE PRINT JOB DETAILS
------------------------
Paper Size: $_paperSize
Layout: ${perPage == 1 ? '1 Picture / Page' : '$perPage Pictures / Page'}
Image Size: ${_imageSizeChoice == 'auto' ? 'Automatic' : _imageSizeChoice}
Orientation: ${_orientationChoice[0].toUpperCase()}${_orientationChoice.substring(1)}
Copies: $_copies

Images: ${docs.length}
${docs.map((doc) => '- ${doc.originalName}').join('\n')}

Cost Breakdown:
Printed Pages: $totalPages
Cost per Page: PHP ${_costPerPage.toStringAsFixed(2)}
Total Cost: PHP ${cost.toStringAsFixed(2)}''';

    PAYMONGOPaymentPageState.pendingAmount = cost;
    PAYMONGOPaymentPageState.printContent = printDetails;
    PAYMONGOPaymentPageState.printFiles = [];
    PAYMONGOPaymentPageState.paperSize = _paperSize;
    PAYMONGOPaymentPageState.colorMode = _colorMode;
    PAYMONGOPaymentPageState.quality = _quality;
    PAYMONGOPaymentPageState.pendingReceiptContent = '';
    PAYMONGOPaymentPageState.pendingJob = (transactionId) => PrintingService.printImageLayoutJob(
          filenames,
          imagesPerPage: perPage,
          imageSize: _imageSizeChoice,
          customWidthIn: customWidth,
          customHeightIn: customHeight,
          orientation: _orientationChoice,
          paperSize: _paperSize,
          colorMode: _colorMode,
          quality: _quality,
          copies: _copies,
          unitPrice: _costPerPage,
          serviceType: 'image-print',
          transactionId: transactionId,
        );
    widget.onNavigate('payment');
  }

  @override
  Widget build(BuildContext context) {
    final images = widget.selectedDocs;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.photo_library, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Image Print Settings',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Choose how your pictures are arranged on the page',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
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
            // Left column — selected images + cost summary
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
                            'Images Selected: ${images.length}',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Container(
                            decoration: BoxDecoration(
                              border: Border.all(color: Theme.of(context).colorScheme.outlineVariant, width: 2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            padding: const EdgeInsets.all(32),
                            child: Column(
                              children: [
                                Icon(Icons.folder_open, size: 48, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                const SizedBox(height: 16),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: widget.onBrowseStorage,
                                    icon: const Icon(Icons.folder_open),
                                    label: const Text('Browse Storage'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF2563EB),
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(vertical: 14),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  images.isEmpty
                                      ? 'No images selected yet'
                                      : '${images.length} image${images.length == 1 ? '' : 's'} selected from storage',
                                  style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                          if (images.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            ...images.map((doc) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                children: [
                                  IconButton(
                                    onPressed: () => widget.onRemoveSelectedDoc(doc.id),
                                    icon: const Icon(Icons.close, size: 16, color: Colors.red),
                                    tooltip: 'Remove from print job',
                                  ),
                                  const Icon(Icons.image, size: 16, color: Color(0xFF2563EB)),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      doc.originalName,
                                      style: const TextStyle(fontSize: 12),
                                      overflow: TextOverflow.ellipsis,
                                    ),
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
                    color: Theme.of(context).colorScheme.primaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Estimated Cost:', style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Theme.of(context).colorScheme.onPrimaryContainer,
                              )),
                              Text(
                                '₱${_calculateCost().toStringAsFixed(2)}',
                                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '$_totalPages printed page${_totalPages == 1 ? '' : 's'} × $_copies ${_copies == 1 ? 'copy' : 'copies'} • ${_colorMode == 'color' ? 'Color' : 'B&W'}',
                            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onPrimaryContainer),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 32),
            // Right column — layout/size/orientation settings + preview
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
                            'Layout',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _buildLayoutChips(),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Image Size',
                            _imageSizeChoice,
                            const ['auto', '1R', '2R', '3R', '4R', '5R', 'custom'],
                            const ['Automatic', '1R', '2R', '3R', '4R', '5R', 'Custom'],
                            (val) => setState(() => _imageSizeChoice = val),
                          ),
                          if (_imageSizeChoice == 'custom') ...[
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _customWidthController,
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    decoration: const InputDecoration(
                                      labelText: 'Width (in)',
                                      border: OutlineInputBorder(),
                                      isDense: true,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: TextField(
                                    controller: _customHeightController,
                                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                    decoration: const InputDecoration(
                                      labelText: 'Height (in)',
                                      border: OutlineInputBorder(),
                                      isDense: true,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Orientation',
                            _orientationChoice,
                            const ['auto', 'portrait', 'landscape'],
                            const ['Automatic', 'Portrait', 'Landscape'],
                            (val) => setState(() => _orientationChoice = val),
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Paper Size',
                            _paperSize,
                            const ['A4', 'Folio', 'Letter'],
                            const ['A4 (210 x 297 mm)', 'Folio (216 x 330 mm)', 'Letter (216 x 279 mm)'],
                            (val) => setState(() => _paperSize = val),
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Color Mode',
                            _colorMode,
                            const ['bw', 'color'],
                            const ['Black & White', 'Color'],
                            (val) => setState(() => _colorMode = val),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Number of Copies: $_copies',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              ElevatedButton(
                                onPressed: () {
                                  if (_copies > 1) {
                                    setState(() {
                                      _copies--;
                                      _copiesController.text = _copies.toString();
                                    });
                                  }
                                },
                                child: const Text('-'),
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
                              ElevatedButton(
                                onPressed: () {
                                  if (_copies < 20) {
                                    setState(() {
                                      _copies++;
                                      _copiesController.text = _copies.toString();
                                    });
                                  }
                                },
                                child: const Text('+'),
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
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Print Preview',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Center(child: _buildPreviewGrid()),
                          const SizedBox(height: 12),
                          Center(
                            child: Text(
                              images.isEmpty
                                  ? 'Select images to see a preview'
                                  : 'Page 1 of $_totalPages shown • Paper: $_paperSize',
                              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (KioskRuntime.instance.outOfPaper) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Icon(Icons.inventory_2_outlined,
                            size: 16, color: Theme.of(context).colorScheme.error),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Out of paper — printing is unavailable right now.',
                            style: TextStyle(
                                fontSize: 12, color: Theme.of(context).colorScheme.error),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (images.length > kMaxImagesPerPrintJob) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Icon(Icons.error_outline,
                            size: 16, color: Theme.of(context).colorScheme.error),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Too many images selected (${images.length}) — please select '
                            '$kMaxImagesPerPrintJob or fewer for one print job.',
                            style: TextStyle(
                                fontSize: 12, color: Theme.of(context).colorScheme.error),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: images.isEmpty ||
                              images.length > kMaxImagesPerPrintJob ||
                              KioskRuntime.instance.outOfPaper
                          ? null
                          : _handleContinue,
                      icon: const Icon(Icons.arrow_forward),
                      label: const Text('Continue'),
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

  Widget _buildLayoutChips() {
    const options = ['auto', '1', '2', '4', '6', '9'];
    const labels = ['Automatic', '1 / Page', '2 / Page', '4 / Page', '6 / Page', '9 / Page'];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (var i = 0; i < options.length; i++)
          ChoiceChip(
            label: Text(labels[i]),
            selected: _layoutChoice == options[i],
            onSelected: (_) => setState(() => _layoutChoice = options[i]),
            selectedColor: const Color(0xFF2563EB),
            labelStyle: TextStyle(
              color: _layoutChoice == options[i] ? Colors.white : Colors.black,
              fontWeight: FontWeight.w600,
            ),
          ),
      ],
    );
  }

  Widget _buildPreviewGrid() {
    final grid = _layoutGrid[_effectiveImagesPerPage]!;
    final images = widget.selectedDocs.take(_effectiveImagesPerPage).toList();
    final landscape = _orientationChoice == 'landscape';

    return AspectRatio(
      aspectRatio: landscape ? 1.35 : 0.74,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 220),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFD1D5DB), width: 2),
          borderRadius: BorderRadius.circular(6),
          color: Colors.white,
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          children: List.generate(grid.rows, (row) {
            return Expanded(
              child: Row(
                children: List.generate(grid.cols, (col) {
                  final idx = row * grid.cols + col;
                  final doc = idx < images.length ? images[idx] : null;
                  return Expanded(
                    child: Container(
                      margin: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFF9CA3AF)),
                        color: const Color(0xFFF3F4F6),
                      ),
                      child: doc == null
                          ? null
                          : ClipRect(
                              child: Image.network(
                                '${BackendConfig.storageApiUrl}/download/${doc.name}',
                                fit: BoxFit.contain,
                                errorBuilder: (context, error, stackTrace) => const Center(
                                  child: Icon(Icons.broken_image, color: Color(0xFF9CA3AF), size: 20),
                                ),
                                loadingBuilder: (context, child, progress) {
                                  if (progress == null) return child;
                                  return const Center(
                                    child: SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    ),
                                  );
                                },
                              ),
                            ),
                    ),
                  );
                }),
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget _buildDropdown(
    String label,
    String value,
    List<String> values,
    List<String> labels,
    Function(String) onChanged,
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
