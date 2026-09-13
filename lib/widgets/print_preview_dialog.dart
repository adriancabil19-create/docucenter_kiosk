import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';

import '../storage_service.dart';

/// Full-screen-ish dialog letting the user flip through the pages of one or
/// more selected documents before committing to a print job. PDFs are
/// rendered page-by-page via `pdfx`; images are shown directly.
class PrintPreviewDialog extends StatefulWidget {
  const PrintPreviewDialog({super.key, required this.documents});

  final List<StorageDocument> documents;

  static Future<void> show(
    BuildContext context,
    List<StorageDocument> documents,
  ) {
    return showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => PrintPreviewDialog(documents: documents),
    );
  }

  @override
  State<PrintPreviewDialog> createState() => _PrintPreviewDialogState();
}

class _PrintPreviewDialogState extends State<PrintPreviewDialog> {
  int _docIndex = 0;
  PdfController? _pdfController;
  int? _totalPages;
  Uint8List? _imageBytes;
  bool _loading = true;
  String? _error;

  StorageDocument get _currentDoc => widget.documents[_docIndex];

  @override
  void initState() {
    super.initState();
    _loadCurrentDoc();
  }

  @override
  void dispose() {
    _pdfController?.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentDoc() async {
    final requestedIndex = _docIndex;
    setState(() {
      _loading = true;
      _error = null;
      _imageBytes = null;
    });
    _pdfController?.dispose();
    _pdfController = null;

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
        _imageBytes = Uint8List.fromList(bytes);
        _loading = false;
      });
      return;
    }

    try {
      final doc = await PdfDocument.openData(Uint8List.fromList(bytes));
      if (!mounted || requestedIndex != _docIndex) return;
      setState(() {
        _pdfController = PdfController(document: Future.value(doc));
        _totalPages = doc.pagesCount;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || requestedIndex != _docIndex) return;
      setState(() {
        _loading = false;
        _error = "This file can't be previewed (unsupported format).";
      });
    }
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
            if (_pdfController != null) _buildPageControls(context),
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
    final backdrop = Theme.of(context).colorScheme.surfaceContainerHighest;
    if (_imageBytes != null) {
      return Container(
        color: backdrop,
        child: InteractiveViewer(
          child: Center(child: Image.memory(_imageBytes!)),
        ),
      );
    }
    if (_pdfController != null) {
      return Container(
        color: backdrop,
        child: PdfView(controller: _pdfController!),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _buildPageControls(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: () => _pdfController!.previousPage(
              duration: const Duration(milliseconds: 200),
              curve: Curves.ease,
            ),
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous page',
          ),
          ValueListenableBuilder<int?>(
            valueListenable: _pdfController!.pageListenable,
            builder: (context, page, _) => Text(
              'Page ${page ?? 1} of ${_totalPages ?? _currentDoc.pages}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            onPressed: () => _pdfController!.nextPage(
              duration: const Duration(milliseconds: 200),
              curve: Curves.ease,
            ),
            icon: const Icon(Icons.chevron_right),
            tooltip: 'Next page',
          ),
        ],
      ),
    );
  }
}
