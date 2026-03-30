import 'package:flutter/material.dart';
import 'package:file_selector/file_selector.dart';
import '../storage_service.dart';
import 'payment_page.dart';

class PrintingInterface extends StatefulWidget {
  final Function() onBrowseStorage;
  final List<StorageDocument> selectedDocs;
  final Function() onClearSelectedDocs;
  final Function(String) onNavigate;

  const PrintingInterface({
    super.key,
    required this.onBrowseStorage,
    required this.selectedDocs,
    required this.onClearSelectedDocs,
    required this.onNavigate,
  });

  @override
  State<PrintingInterface> createState() => _PrintingInterfaceState();
}

class _PrintingInterfaceState extends State<PrintingInterface> {
  String _colorMode = 'bw';
  String _quality = 'standard';
  String _paperSize = 'A4';
  int _copies = 1;
  /// Locally selected files that have been uploaded to backend storage.
  final List<StorageDocument> _uploadedFiles = [];
  bool _isUploading = false;
  late final TextEditingController _copiesController;

  double _calculateCost() {
    double costPerPage;
    if (_quality == 'draft') {
      costPerPage = _colorMode == 'color' ? 2 : 1.5;
    } else {
      costPerPage = _colorMode == 'color' ? 3 : 2;
    }
    final totalPages = _uploadedFiles.fold<int>(0, (sum, doc) => sum + doc.pages) +
        widget.selectedDocs.fold<int>(0, (sum, doc) => sum + doc.pages);
    return costPerPage * totalPages * _copies;
  }

  @override
  void initState() {
    super.initState();
    _copiesController = TextEditingController(text: _copies.toString());
  }

  @override
  void dispose() {
    _copiesController.dispose();
    super.dispose();
  }

  /// Open file picker, upload selected files to backend, track them locally.
  Future<void> _pickAndUploadFiles() async {
    const typeGroup = XTypeGroup(
      label: 'Documents',
      extensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png'],
    );

    final files = await openFiles(acceptedTypeGroups: [typeGroup]);
    if (files.isEmpty) return;

    setState(() => _isUploading = true);

    int uploaded = 0;
    for (final xFile in files) {
      try {
        final bytes = await xFile.readAsBytes();
        final mimeType = StorageService.getMimeType(xFile.name);
        final doc = await StorageService.uploadFile(xFile.path, bytes, xFile.name, mimeType);
        if (doc != null) {
          setState(() => _uploadedFiles.add(doc));
          uploaded++;
        }
      } catch (e) {
        debugPrint('Failed to upload file: $e');
      }
    }

    setState(() => _isUploading = false);

    if (mounted && uploaded > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$uploaded file(s) uploaded to storage'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  void _handlePrint() {
    final allDocs = [..._uploadedFiles, ...widget.selectedDocs];
    if (allDocs.isEmpty) return;

    final totalPages = allDocs.fold<int>(0, (sum, doc) => sum + doc.pages);
    final costPerPage = totalPages > 0 && _copies > 0
        ? (_calculateCost() / (totalPages * _copies))
        : 0.0;

    final printDetails = '''
PRINT JOB DETAILS
-----------------
Paper Size: $_paperSize
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Quality: ${_quality == 'draft' ? 'Draft' : 'Standard'}
Copies: $_copies

Files to Print: ${allDocs.length}
${allDocs.map((doc) => '- ${doc.originalName} (${doc.pages} pages)').join('\n')}

Cost Breakdown:
Total Pages: $totalPages
Cost per Page: PHP ${costPerPage.toStringAsFixed(2)}
Total Cost: PHP ${_calculateCost().toStringAsFixed(2)}''';

    // Expand filenames by copies count so the backend prints each file N times
    final baseFilenames = allDocs.map((d) => d.name).toList();
    final expandedFilenames = [
      for (int i = 0; i < _copies; i++) ...baseFilenames,
    ];
    GCashPaymentPageState.pendingAmount = _calculateCost();
    GCashPaymentPageState.printContent = printDetails;
    GCashPaymentPageState.printFiles = expandedFilenames;
    GCashPaymentPageState.paperSize = _paperSize;
    GCashPaymentPageState.pendingReceiptContent = '';
    widget.onNavigate('payment');
  }

  @override
  Widget build(BuildContext context) {
    final allDocs = [..._uploadedFiles, ...widget.selectedDocs];

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
                  'Printing Service',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: const Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Configure your print settings and upload your documents',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF4B5563),
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
                            'Upload Documents',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Container(
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0xFFD1D5DB), width: 2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            padding: const EdgeInsets.all(32),
                            child: Column(
                              children: [
                                const Icon(Icons.cloud_upload, size: 48, color: Color(0xFF9CA3AF)),
                                const SizedBox(height: 16),
                                ElevatedButton(
                                  onPressed: _isUploading ? null : _pickAndUploadFiles,
                                  child: _isUploading
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : const Text('Choose File'),
                                ),
                                const SizedBox(height: 8),
                                ElevatedButton.icon(
                                  onPressed: widget.onBrowseStorage,
                                  icon: const Icon(Icons.folder_open),
                                  label: const Text('Browse Storage'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.white,
                                    foregroundColor: const Color(0xFF2563EB),
                                    side: const BorderSide(color: Color(0xFF2563EB)),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '${_uploadedFiles.length} uploaded, ${widget.selectedDocs.length} from storage',
                                  style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                                ),
                              ],
                            ),
                          ),
                          // Show uploaded/selected file list
                          if (allDocs.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            ...allDocs.map((doc) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                children: [
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
                                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
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
                    color: const Color(0xFFF0F9FF),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Estimated Cost:',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                              Text(
                                '₱${_calculateCost().toStringAsFixed(2)}',
                                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  color: const Color(0xFF2563EB),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${allDocs.fold<int>(0, (sum, doc) => sum + doc.pages)} pages × $_copies ${_copies == 1 ? 'copy' : 'copies'} • ${_colorMode == 'color' ? 'Color' : 'B&W'}',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF4B5563)),
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
                            'Print Settings',
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Paper Size',
                            _paperSize,
                            ['A4', 'Folio', 'Letter', 'Legal'],
                            (val) => setState(() => _paperSize = val),
                            ['A4 (210 x 297 mm)', 'Folio (216 x 330 mm)', 'Letter (216 x 279 mm)', 'Legal (216 x 356 mm)'],
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Color Mode',
                            _colorMode,
                            ['bw', 'color'],
                            (val) => setState(() => _colorMode = val),
                            ['Black & White', 'Color'],
                          ),
                          const SizedBox(height: 16),
                          _buildDropdown(
                            'Print Quality',
                            _quality,
                            ['draft', 'standard'],
                            (val) => setState(() => _quality = val),
                            ['Draft (₱1.50 B&W / ₱2 Color)', 'Standard (₱2 B&W / ₱3 Color)'],
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
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: allDocs.isEmpty ? null : _handlePrint,
                      icon: const Icon(Icons.print),
                      label: const Text('Start Printing'),
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
