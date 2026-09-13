import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';

import '../storage_service.dart';

/// Width/height ratio for each paper size offered in Print Settings —
/// keep in sync with the dimensions listed there (in mm).
const Map<String, double> _paperAspectRatios = {
  'A4': 210 / 297,
  'Folio': 216 / 330,
  'Letter': 216 / 279,
};

double _aspectRatioFor(String paperSize) =>
    _paperAspectRatios[paperSize] ?? _paperAspectRatios['A4']!;

/// Full-screen-ish dialog letting the user flip through the pages of one or
/// more selected documents before committing to a print job.
///
/// The preview frame itself is shaped to the paper size chosen in Print
/// Settings (A4/Folio/Letter each have a different aspect ratio), and each
/// page is fitted inside that frame — mirroring how the physical printer
/// will scale the content to the sheet, rather than just showing the PDF's
/// own native page shape.
class PrintPreviewDialog extends StatefulWidget {
  const PrintPreviewDialog({
    super.key,
    required this.documents,
    this.paperSize = 'A4',
  });

  final List<StorageDocument> documents;
  final String paperSize;

  static Future<void> show(
    BuildContext context,
    List<StorageDocument> documents, {
    String paperSize = 'A4',
  }) {
    return showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => PrintPreviewDialog(
        documents: documents,
        paperSize: paperSize,
      ),
    );
  }

  @override
  State<PrintPreviewDialog> createState() => _PrintPreviewDialogState();
}

class _PrintPreviewDialogState extends State<PrintPreviewDialog> {
  int _docIndex = 0;

  PdfDocument? _pdfDocument;
  int _pageNumber = 1;
  int _pageCount = 1;
  Uint8List? _pageImageBytes;

  Uint8List? _staticImageBytes;

  bool _loading = true;
  bool _pageRendering = false;
  String? _error;

  StorageDocument get _currentDoc => widget.documents[_docIndex];

  @override
  void initState() {
    super.initState();
    _loadCurrentDoc();
  }

  @override
  void dispose() {
    _pdfDocument?.close();
    super.dispose();
  }

  Future<void> _loadCurrentDoc() async {
    final requestedIndex = _docIndex;
    setState(() {
      _loading = true;
      _error = null;
      _staticImageBytes = null;
      _pageImageBytes = null;
    });
    _pdfDocument?.close();
    _pdfDocument = null;

    final bytes = await StorageService.downloadFile(_currentDoc.name);
    // The user may have tapped another document tab while this was in flight.
    if (!mounted || requestedIndex != _docIndex) return;

    if (bytes == null) {
      setState(() {
        _loading = false;
        _error = 'Could not load this file for preview.';
      });
      return;
    }

    if (_currentDoc.isImage) {
      setState(() {
        _staticImageBytes = Uint8List.fromList(bytes);
        _loading = false;
      });
      return;
    }

    try {
      final doc = await PdfDocument.openData(Uint8List.fromList(bytes));
      if (!mounted || requestedIndex != _docIndex) {
        doc.close();
        return;
      }
      _pdfDocument = doc;
      setState(() {
        _pageCount = doc.pagesCount;
        _loading = false;
      });
      await _renderPage(1);
    } catch (_) {
      if (!mounted || requestedIndex != _docIndex) return;
      setState(() {
        _loading = false;
        _error = "This file can't be previewed (unsupported format).";
      });
    }
  }

  /// Renders one PDF page at 2x its native size for a crisp on-screen
  /// preview — the page keeps its own aspect ratio here; fitting it to the
  /// selected paper shape happens in [_buildBody] via `BoxFit.contain`.
  Future<void> _renderPage(int pageNumber) async {
    final doc = _pdfDocument;
    if (doc == null) return;
    final requestedIndex = _docIndex;
    setState(() => _pageRendering = true);

    final page = await doc.getPage(pageNumber);
    final rendered = await page.render(
      width: page.width * 2,
      height: page.height * 2,
      format: PdfPageImageFormat.png,
    );
    await page.close();

    if (!mounted || requestedIndex != _docIndex || _pdfDocument != doc) return;
    setState(() {
      _pageNumber = pageNumber;
      _pageImageBytes = rendered?.bytes;
      _pageRendering = false;
    });
  }

  void _switchDoc(int index) {
    if (index == _docIndex) return;
    setState(() => _docIndex = index);
    _loadCurrentDoc();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: SizedBox(
        width: (size.width - 96).clamp(320, 760).toDouble(),
        height: (size.height - 96).clamp(400, 780).toDouble(),
        child: Column(
          children: [
            _buildHeader(context),
            if (widget.documents.length > 1) _buildDocTabs(context),
            const Divider(height: 1),
            Expanded(child: _buildBody(context)),
            if (_pdfDocument != null) _buildPageControls(context),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
      child: Row(
        children: [
          const Icon(Icons.visibility_outlined),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Print Preview',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
          ),
          Text(
            'Fit to ${widget.paperSize}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close),
            tooltip: 'Close preview',
          ),
        ],
      ),
    );
  }

  Widget _buildDocTabs(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: widget.documents.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final doc = widget.documents[i];
          return ChoiceChip(
            label: Text(doc.originalName, overflow: TextOverflow.ellipsis),
            selected: i == _docIndex,
            onSelected: (_) => _switchDoc(i),
          );
        },
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 40,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
    }

    final imageBytes = _staticImageBytes ?? _pageImageBytes;
    return Container(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      padding: const EdgeInsets.all(24),
      child: Center(
        // The paper-shaped frame: its aspect ratio is the selected paper
        // size, not the source file's — content is fitted (letterboxed if
        // needed) inside it, the way the printer will scale it to the sheet.
        child: AspectRatio(
          aspectRatio: _aspectRatioFor(widget.paperSize),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (imageBytes != null)
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Image.memory(
                      imageBytes,
                      fit: BoxFit.contain,
                      gaplessPlayback: true,
                    ),
                  ),
                if (_pageRendering)
                  const Center(child: CircularProgressIndicator()),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPageControls(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: _pageNumber > 1 && !_pageRendering
                ? () => _renderPage(_pageNumber - 1)
                : null,
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous page',
          ),
          Text(
            'Page $_pageNumber of $_pageCount',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          IconButton(
            onPressed: _pageNumber < _pageCount && !_pageRendering
                ? () => _renderPage(_pageNumber + 1)
                : null,
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Next page',
          ),
        ],
      ),
    );
  }
}
