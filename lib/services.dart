import 'package:flutter/material.dart';
import 'dart:async';
import 'payment_service.dart';
import 'config.dart';

class ServicesPage extends StatefulWidget {
  final Function(String) onNavigate;

  const ServicesPage({super.key, required this.onNavigate});

  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  String _activeService = 'printing';
  final List<ScannedDocument> _savedDocuments = [
    ScannedDocument(
      id: '1',
      name: 'Thesis_Chapter1.pdf',
      format: 'PDF',
      pages: 15,
      date: '2025-12-09',
      size: '2.3 MB',
    ),
    ScannedDocument(
      id: '2',
      name: 'ID_Scan.jpg',
      format: 'JPG',
      pages: 1,
      date: '2025-12-08',
      size: '1.1 MB',
    ),
  ];
  List<ScannedDocument> _selectedDocsForPrint = [];
  bool _printingFromStorage = false;

  void _handleServiceChange(String service) {
    setState(() {
      _activeService = service;
    });
  }

  void _handleDeleteDocument(String id) {
    setState(() {
      _savedDocuments.removeWhere((doc) => doc.id == id);
    });
  }

  void _handleSelectDocForPrint(List<ScannedDocument> docs) {
    setState(() {
      _selectedDocsForPrint = docs;
      _activeService = 'printing';
      _printingFromStorage = true;
    });
  }

  void _handleBrowseStorage() {
    setState(() {
      _activeService = 'storage';
      _printingFromStorage = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 16),
            child: Column(
              children: [
                Text(
                  'Document Processing Services',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'Select a service below to access printing, scanning, or photocopying features',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Color(0xFF4B5563),
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          // Service Selection Buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: GridView.count(
              crossAxisCount: MediaQuery.of(context).size.width < 768 ? 1 : 4,
              childAspectRatio: 1.2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _buildServiceButton('printing', 'Printing', 'Print documents & images', Icons.print),
                _buildServiceButton('scanning', 'Scanning', 'Digitize physical documents', Icons.document_scanner),
                _buildServiceButton('photocopying', 'Photocopying', 'Make copies of documents', Icons.copy),
                _buildServiceButton('storage', 'Storage', 'View saved documents', Icons.folder_open),
              ],
            ),
          ),

          // Service Content
          Container(
            color: Colors.white,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            padding: const EdgeInsets.all(32),
            child: _buildActiveServiceWidget(),
          ),
        ],
      ),
    );
  }

  Widget _buildServiceButton(String serviceId, String title, String subtitle, IconData icon) {
    final isActive = _activeService == serviceId;
    return GestureDetector(
      onTap: () => _handleServiceChange(serviceId),
      child: Container(
        decoration: BoxDecoration(
          color: isActive ? Color(0xFF2563EB) : Colors.white,
          border: Border.all(
            color: isActive ? Color(0xFF2563EB) : Color(0xFFE5E7EB),
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 40,
                color: isActive ? Colors.white : Color(0xFF2563EB),
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isActive ? Colors.white : Colors.black,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  color: isActive ? Colors.white70 : Color(0xFF4B5563),
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActiveServiceWidget() {
    switch (_activeService) {
      case 'printing':
        return PrintingInterface(
          onBrowseStorage: _handleBrowseStorage,
          selectedDocs: _selectedDocsForPrint,
          onClearSelectedDocs: () {
            setState(() {
              _selectedDocsForPrint = [];
              _printingFromStorage = false;
            });
          },
          onNavigate: widget.onNavigate,
        );
      case 'scanning':
        return ScanningInterface(
          savedDocuments: _savedDocuments,
          onAddDocument: (doc) {
            setState(() {
              _savedDocuments.add(doc);
            });
          },
          onNavigate: widget.onNavigate,
        );
      case 'photocopying':
        return PhotocopyingInterface(
          onNavigate: widget.onNavigate,
          onAddDocument: (doc) {
            setState(() {
              _savedDocuments.add(doc);
            });
          },
        );
      case 'storage':
        return StorageInterface(
          documents: _savedDocuments,
          onDelete: _handleDeleteDocument,
          onPrint: (doc) {
            setState(() {
              _selectedDocsForPrint = [doc];
              _activeService = 'printing';
              _printingFromStorage = false;
            });
          },
          onSelectForPrint: _handleSelectDocForPrint,
          printingMode: _printingFromStorage,
          onCancelPrintMode: () {
            setState(() {
              _printingFromStorage = false;
            });
          },
        );
      default:
        return Container();
    }
  }
}

class ScannedDocument {
  final String id;
  final String name;
  final String format;
  final int pages;
  final String date;
  final String size;

  ScannedDocument({
    required this.id,
    required this.name,
    required this.format,
    required this.pages,
    required this.date,
    required this.size,
  });
}

class PrintingInterface extends StatefulWidget {
  final Function() onBrowseStorage;
  final List<ScannedDocument> selectedDocs;
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
  int _copies = 1;
  final List<String> _files = [];
  final bool _isPrinting = false;

  double _calculateCost() {
    double costPerPage = 0;
    if (_quality == 'draft') {
      costPerPage = _colorMode == 'color' ? 2 : 1.5;
    } else {
      costPerPage = _colorMode == 'color' ? 3 : 2;
    }
    
    final totalPages = _files.length + widget.selectedDocs.fold<int>(0, (sum, doc) => sum + doc.pages);
    return costPerPage * totalPages * _copies;
  }

  void _handlePrint() {
    if (_files.isEmpty && widget.selectedDocs.isEmpty) {
      return;
    }
    
    // Build print job details for the receipt
    final printDetails = '''
PRINT JOB DETAILS
─────────────────
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Quality: ${_quality == 'draft' ? 'Draft' : _quality == 'standard' ? 'Standard' : 'High'}
Copies: $_copies

Files to Print: ${_files.length + widget.selectedDocs.length}
${widget.selectedDocs.map((doc) => '• ${doc.name} (${doc.pages} pages)').join('\n')}

Cost Breakdown:
Total Pages: ${_files.length + widget.selectedDocs.fold<int>(0, (sum, doc) => sum + doc.pages)}
Cost per Page: ₱${(_calculateCost() / (_files.length + widget.selectedDocs.fold<int>(0, (sum, doc) => sum + doc.pages)) / _copies).toStringAsFixed(2)}
Total Cost: ₱${_calculateCost().toStringAsFixed(2)}''';

    // Store the payment amount and print details
    _GCashPaymentPageState.pendingAmount = _calculateCost();
    _GCashPaymentPageState.printContent = printDetails;
    widget.onNavigate('payment');
  }

  /// Test print without payment (demo mode)
  void _handleTestPrint() {
    // Store demo print details
    final demoDetails = '''
DEMO PRINT TEST
─────────────────
Mode: Test/Demo Mode
Color: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Quality: ${_quality == 'draft' ? 'Draft' : _quality == 'standard' ? 'Standard' : 'High'}
Copies: $_copies

This is a test page to verify printer connectivity.
No payment required for this test.

Test Status: Print job will be sent directly
              to the configured system printer.

Connection: Checking...''';

    // Set as test payment with no amount required
    _GCashPaymentPageState.pendingAmount = 0.0;
    _GCashPaymentPageState.printContent = demoDetails;
    
    // Show snackbar and try direct print
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Sending test print to printer...'),
        backgroundColor: Colors.blue,
        duration: Duration(seconds: 2),
      ),
    );
    
    // Try to print directly without payment
    PrintService.printText(demoDetails).then((success) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? 'Test print sent successfully!' : 'Printer unavailable (demo mode)'),
            backgroundColor: success ? Colors.green : Colors.orange,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }).catchError((e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isPrinting) {
      return Center(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 80,
                  height: 80,
                  child: CircularProgressIndicator(
                    strokeWidth: 8,
                    valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'Printing in Progress...',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Color(0xFF2563EB),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                const Text('Please wait while your document is being printed'),
              ],
            ),
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.print, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Printing Service',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Configure your print settings and upload your documents',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Color(0xFF4B5563),
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
            // Left Column
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
                              border: Border.all(color: Color(0xFFD1D5DB), width: 2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            padding: const EdgeInsets.all(32),
                            child: Column(
                              children: [
                                Icon(Icons.cloud_upload, size: 48, color: Color(0xFF9CA3AF)),
                                const SizedBox(height: 16),
                                ElevatedButton(
                                  onPressed: () {
                                    // File picker would go here
                                    setState(() {
                                      _files.add('sample_file.pdf');
                                    });
                                  },
                                  child: const Text('Choose File'),
                                ),
                                const SizedBox(height: 8),
                                ElevatedButton.icon(
                                  onPressed: widget.onBrowseStorage,
                                  icon: const Icon(Icons.folder_open),
                                  label: const Text('Browse Storage'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.white,
                                    foregroundColor: Color(0xFF2563EB),
                                    side: const BorderSide(color: Color(0xFF2563EB)),
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '${_files.length} file(s) uploaded, ${widget.selectedDocs.length} from storage',
                                  style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    color: Color(0xFFF0F9FF),
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
                                  color: Color(0xFF2563EB),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${_files.length + widget.selectedDocs.fold<int>(0, (sum, doc) => sum + doc.pages)} files × $_copies ${_copies == 1 ? 'copy' : 'copies'} • ${_colorMode == 'color' ? 'Color' : 'Black & White'} • Letter',
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
            // Right Column
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
                          _buildSettingField('Paper Size', 'Letter (8.5" × 11")'),
                          const SizedBox(height: 16),
                          _buildDropdown('Color Mode', _colorMode, ['bw', 'color'], (val) {
                            setState(() => _colorMode = val);
                          }, ['Black & White', 'Color']),
                          const SizedBox(height: 16),
                          _buildDropdown('Print Quality', _quality, ['draft', 'standard'], (val) {
                            setState(() => _quality = val);
                          }, ['Draft (₱1.50 B&W / ₱2 Color)', 'Standard (₱2 B&W / ₱3 Color)']),
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
                                  setState(() {
                                    if (_copies > 1) _copies--;
                                  });
                                },
                                child: const Text('-'),
                              ),
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 8),
                                  child: TextField(
                                    controller: TextEditingController(text: _copies.toString()),
                                    onChanged: (val) {
                                      setState(() {
                                        _copies = int.tryParse(val) ?? 1;
                                      });
                                    },
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ),
                              ElevatedButton(
                                onPressed: () {
                                  setState(() {
                                    if (_copies < 100) _copies++;
                                  });
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
                      onPressed: _handlePrint,
                      icon: const Icon(Icons.print),
                      label: const Text('Start Printing'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Color(0xFF2563EB),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: _handleTestPrint,
                      icon: const Icon(Icons.print),
                      label: const Text('Test Printer (Demo)'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.amber[600],
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

  Widget _buildSettingField(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
        const SizedBox(height: 4),
        TextField(
          controller: TextEditingController(text: value),
          enabled: false,
          decoration: InputDecoration(
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
            filled: true,
            fillColor: Color(0xFFF3F4F6),
          ),
        ),
      ],
    );
  }

  Widget _buildDropdown(String label, String value, List<String> values, Function(String) onChanged, List<String> labels) {
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

class ScanningInterface extends StatefulWidget {
  final List<ScannedDocument> savedDocuments;
  final Function(ScannedDocument) onAddDocument;
  final Function(String) onNavigate;

  const ScanningInterface({
    super.key,
    required this.savedDocuments,
    required this.onAddDocument,
    required this.onNavigate,
  });

  @override
  State<ScanningInterface> createState() => _ScanningInterfaceState();
}

class _ScanningInterfaceState extends State<ScanningInterface> {
  bool _isScanning = false;
  List<String> _scannedPages = [];
  String _colorMode = 'color';
  String _dpi = '300';
  bool _doubleScanning = false;
  String _documentName = '';

  @override
  Widget build(BuildContext context) {
    if (_isScanning && _scannedPages.isNotEmpty) {
      return _buildScanningComplete();
    }
    if (_isScanning) {
      return _buildScanning();
    }
    return _buildScanSettings();
  }

  Widget _buildScanSettings() {
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.settings, size: 32, color: Color(0xFF2563EB)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Scan Settings',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: Color(0xFF003D99),
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
                  Text(
                    'Color Mode',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['color', 'grayscale', 'bw'].map((mode) {
                      final label = mode == 'bw' ? 'B&W' : mode == 'color' ? 'Color' : 'Grayscale';
                      return FilterChip(
                        label: Text(label),
                        selected: _colorMode == mode,
                        onSelected: (selected) {
                          setState(() => _colorMode = mode);
                        },
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
                    'DPI (Resolution)',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['150', '200', '300', '600'].map((dpi) {
                      return FilterChip(
                        label: Text(dpi),
                        selected: _dpi == dpi,
                        onSelected: (selected) {
                          setState(() => _dpi = dpi);
                        },
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
                onChanged: (val) {
                  setState(() => _doubleScanning = val ?? false);
                },
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
                  _scannedPages = [];
                });
              },
              icon: const Icon(Icons.play_arrow),
              label: const Text('Start Scanning'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: Color(0xFF2563EB),
              ),
            ),
          ),
        ],
      ),
    );
  }

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
                  valueColor: AlwaysStoppedAnimation(Color(0xFF2563EB)),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Scanning Documents',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
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
                        child: Icon(Icons.image, size: 40, color: Colors.grey[400]),
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Color(0xFF2563EB),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: Text(
                          '${index + 1}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
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
                onPressed: () {
                  setState(() {
                    _scannedPages.add('page_${_scannedPages.length + 1}');
                  });
                },
                icon: const Icon(Icons.add),
                label: const Text('Scan More'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () {
                  setState(() => _isScanning = false);
                },
                icon: const Icon(Icons.check),
                label: const Text('Finish'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// Print scan results receipt
  Future<void> _printScanReceipt() async {
    try {
      final scanReceipt = '''
╔═══════════════════════════════════════╗
║       SCANNING RECEIPT                ║
║   ${DateTime.now().toString().split('.')[0]}    ║
╚═══════════════════════════════════════╝

Document Name: ${_documentName.isEmpty ? 'Scanned_${DateTime.now().millisecondsSinceEpoch}' : _documentName}
Format: PDF
Pages Scanned: ${_scannedPages.length}
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
DPI Resolution: ${_dpi}
Double Scanning: ${_doubleScanning ? 'Yes' : 'No'}

═══════════════════════════════════════
File Size: ${(_scannedPages.length * 250)} KB
Date: ${DateTime.now().toString().split('.')[0]}

Status: ✓ SCAN COMPLETE
Document saved to system storage.

═══════════════════════════════════════
Thank you for using our service!
''';

      final success = await PrintService.printReceipt(scanReceipt);
      if (!mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Scan receipt printed successfully!' : 'Print service unavailable (demo mode)'),
          backgroundColor: success ? Colors.green : Colors.orange,
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      print('Error printing scan receipt: $e');
    }
  }

  /// Test printer for scanning service
  Future<void> _testPrintScanning() async {
    try {
      final testReceipt = '''
╔═══════════════════════════════════════╗
║    SCANNING SERVICE TEST PAGE         ║
║       ${DateTime.now().toString().split('.')[0]}    ║
╚═══════════════════════════════════════╝

Test Type: Scan Preview
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Resolution: ${_dpi} DPI
Double Scanning: ${_doubleScanning ? 'Enabled' : 'Disabled'}

Preview Pages: ${_scannedPages.length}

═══════════════════════════════════════

Printer Test: ACTIVE
Connection: OK
Print Quality: Standard

This is a test page to verify your
scanning and printing setup.

═══════════════════════════════════════
Test Date: ${DateTime.now()}
''';

      final success = await PrintService.printText(testReceipt);
      if (!mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Scan test print sent!' : 'Print service unavailable'),
          backgroundColor: success ? Colors.green : Colors.orange,
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Print test error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Widget _buildScanningComplete() {
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.green[50],
              border: Border.all(color: Colors.green),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.check_circle, size: 40, color: Colors.green),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Scanning Complete',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Colors.green[900],
                        ),
                      ),
                      Text(
                        '${_scannedPages.length} pages scanned',
                        style: TextStyle(color: Colors.green[700]),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
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
                      color: Colors.grey[200],
                      child: Center(
                        child: Icon(Icons.image, size: 40, color: Colors.grey[400]),
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Color(0xFF2563EB),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: Text(
                          '${index + 1}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Save Scanned Documents',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    onChanged: (val) => _documentName = val,
                    decoration: InputDecoration(
                      labelText: 'Document Name',
                      hintText: 'e.g., Invoice_2026_Feb',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      suffixText: '.pdf',
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        widget.onAddDocument(
                          ScannedDocument(
                            id: DateTime.now().toString(),
                            name: _documentName.isEmpty ? 'Scanned_${DateTime.now().millisecondsSinceEpoch}.pdf' : '$_documentName.pdf',
                            format: 'PDF',
                            pages: _scannedPages.length,
                            date: DateTime.now().toString().split(' ')[0],
                            size: '${(_scannedPages.length * 250)} KB',
                          ),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Saved ${_scannedPages.length} pages to storage'),
                            backgroundColor: Colors.green,
                          ),
                        );
                        // Print scan receipt after saving
                        _printScanReceipt();
                        
                        setState(() {
                          _isScanning = false;
                          _scannedPages = [];
                          _documentName = '';
                        });
                      },
                      icon: const Icon(Icons.save),
                      label: const Text('Save to Storage'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _testPrintScanning,
                      icon: const Icon(Icons.assessment),
                      label: const Text('Test Printer (Demo)'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.amber[600],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _isScanning = false;
                      _scannedPages = [];
                      _documentName = '';
                    });
                  },
                  icon: const Icon(Icons.close),
                  label: const Text('Discard'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.grey,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _isScanning = true;
                      _scannedPages = [];
                    });
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Scan More'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class PhotocopyingInterface extends StatefulWidget {
  final Function(String) onNavigate;
  final Function(ScannedDocument) onAddDocument;

  const PhotocopyingInterface({
    super.key,
    required this.onNavigate,
    required this.onAddDocument,
  });

  @override
  State<PhotocopyingInterface> createState() => _PhotocopyingInterfaceState();
}

class _PhotocopyingInterfaceState extends State<PhotocopyingInterface> {
  int _copies = 1;
  String _colorMode = 'color';
  String _paperSize = 'A4';
  // Stapling option removed per requirements

  double _calculateCopyingCost() {
    double costPerCopy = _colorMode == 'color' ? 3.0 : 2.0;
    return costPerCopy * _copies;
  }

  /// Print photocopying receipt
  Future<void> _printCopyingReceipt() async {
    try {
      final copyReceipt = '''
╔═══════════════════════════════════════╗
║    PHOTOCOPYING RECEIPT               ║
║   ${DateTime.now().toString().split('.')[0]}    ║
╚═══════════════════════════════════════╝

Service: Photocopying
Copies Requested: $_copies
Paper Size: ${_paperSize}
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}

═══════════════════════════════════════
Cost Breakdown:
Cost per Copy: ₱${(_colorMode == 'color' ? 3.0 : 2.0).toStringAsFixed(2)}
Total Copies: $_copies
Total Cost: ₱${_calculateCopyingCost().toStringAsFixed(2)}

═══════════════════════════════════════
Date: ${DateTime.now().toString().split('.')[0]}
Status: ✓ COPY JOB SUBMITTED

Document will be copied automatically.

═══════════════════════════════════════
Thank you for using our service!
''';

      final success = await PrintService.printReceipt(copyReceipt);
      print('Copying receipt print result: $success');
    } catch (e) {
      print('Error printing copying receipt: $e');
    }
  }

  /// Test printer for photocopying service
  Future<void> _testPrintCopying() async {
    try {
      final testReceipt = '''
╔═══════════════════════════════════════╗
║   PHOTOCOPYING SERVICE TEST PAGE      ║
║       ${DateTime.now().toString().split('.')[0]}    ║
╚═══════════════════════════════════════╝

Test Type: Copy Preview
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Paper Size: ${_paperSize}
Copies: $_copies

═══════════════════════════════════════

Cost Calculation:
Rate: ₱${(_colorMode == 'color' ? 3.0 : 2.0).toStringAsFixed(2)} per copy
Total: ₱${_calculateCopyingCost().toStringAsFixed(2)}

Printer Test: ACTIVE
Connection: OK
Copy Quality: Standard

This is a test page to verify your
photocopying and printing setup.

═══════════════════════════════════════
Test Date: ${DateTime.now()}
''';

      final success = await PrintService.printText(testReceipt);
      if (!mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Copy test print sent!' : 'Print service unavailable'),
          backgroundColor: success ? Colors.green : Colors.orange,
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Print test error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _startPhotocopying() {
    _GCashPaymentPageState.pendingAmount = _calculateCopyingCost();
    _GCashPaymentPageState.printContent = '''PHOTOCOPYING JOB
─────────────────
Copies: $_copies
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Paper Size: ${_paperSize}
Total Cost: ₱${_calculateCopyingCost().toStringAsFixed(2)}''';
    
    // Print receipt after payment succeeds
    _printCopyingReceipt();
    
    widget.onNavigate('payment');
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.copyright, size: 32, color: Color(0xFF2563EB)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Photocopying Service',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: Color(0xFF003D99),
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
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
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
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _copies < 999 ? () => setState(() => _copies++) : null,
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
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: [
                      FilterChip(
                        label: const Text('Color'),
                        selected: _colorMode == 'color',
                        onSelected: (selected) => setState(() => _colorMode = 'color'),
                      ),
                      FilterChip(
                        label: const Text('Black & White'),
                        selected: _colorMode == 'bw',
                        onSelected: (selected) => setState(() => _colorMode = 'bw'),
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
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['A4', 'Letter', 'Legal'].map((size) {
                      return FilterChip(
                        label: Text(size),
                        selected: _paperSize == size,
                        onSelected: (selected) => setState(() => _paperSize = size),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          // Staple option removed
          const SizedBox(height: 24),
          Card(
            color: Colors.blue[50],
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(
                    'Estimated Cost',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '₱${_calculateCopyingCost().toStringAsFixed(2)}',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: Color(0xFF2563EB),
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
              label: const Text('Start Photocopying (Proceed to Payment)'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: Color(0xFF2563EB),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _testPrintCopying,
              icon: const Icon(Icons.assessment),
              label: const Text('Test Printer (Demo)'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber[600],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PaymentInterface extends StatefulWidget {
  final double amount;
  final Function(bool) onPaymentComplete;
  final Function() onTimeout;

  const PaymentInterface({
    super.key,
    required this.amount,
    required this.onPaymentComplete,
    required this.onTimeout,
  });

  @override
  State<PaymentInterface> createState() => _PaymentInterfaceState();
}

class _PaymentInterfaceState extends State<PaymentInterface> {
  late PaymentTransaction? _transaction;
  String _paymentStatus = 'pending'; // pending, processing, success, failed, expired
  late int _timeLeft;
  String? _errorMessage;
  bool _isLoading = true;
  late bool _showDevTools;
  
  final GCashPaymentService _paymentService = GCashPaymentService();
  Timer? _pollingTimer;
  Timer? _countdownTimer;
  PaymentPollingManager? _pollingManager;

  @override
  void initState() {
    super.initState();
    _showDevTools = UiConfig.showDevelopmentTools; // Use config value
    _transaction = null;
    _timeLeft = 300; // 5 minutes
    _initializePayment();
  }

  /// Initialize payment by calling backend API
  Future<void> _initializePayment() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      // Try to create payment with backend
      final transaction = await _paymentService.createPayment(
        amount: widget.amount,
        serviceType: 'document_service',
        documentCount: 1,
      );

      if (!mounted) return;

      setState(() {
        _transaction = transaction;
        _isLoading = false;
        _paymentStatus = 'pending';
        _timeLeft = transaction.expiresIn;
      });

      // Start countdown timer
      _startCountdownTimer();

      // Start polling for payment status
      _startPolling();
    } catch (e) {
      if (!mounted) return;
      
      // Fallback: Show placeholder with demo data if backend fails
      final demoTransaction = PaymentTransaction(
        transactionId: 'DEMO-${DateTime.now().millisecondsSinceEpoch}',
        referenceNumber: 'REF-${DateTime.now().millisecondsSinceEpoch.toString().substring(0, 8)}',
        qrCode: 'DEMO-QR-CODE',
        expiresIn: 300,
        amount: widget.amount,
        status: 'PENDING',
      );
      
      setState(() {
        _isLoading = false;
        _transaction = demoTransaction;
        _paymentStatus = 'pending';
        _timeLeft = 300;
        _errorMessage = 'Running in Demo Mode (Backend not available)';
      });

      // Start countdown timer anyway
      _startCountdownTimer();
    }
  }

  /// Start countdown timer
  void _startCountdownTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        _timeLeft--;
        if (_timeLeft <= 0) {
          timer.cancel();
          if (_paymentStatus == 'pending') {
            _handleTimeout();
          }
        }
      });
    });
  }

  /// Start polling for payment status
  void _startPolling() {
    if (_transaction == null) return;

    _pollingManager = PaymentPollingManager(
      transactionId: _transaction!.transactionId,
      onStatusUpdate: (PaymentStatus status) {
        if (!mounted) return;

        setState(() {
          _paymentStatus = status.status.toLowerCase();
        });

        // Handle final states
        if (status.isSuccessful) {
          _handlePaymentSuccess();
        } else if (status.isFailed) {
          _handlePaymentFailure(
            status.status == 'EXPIRED'
                ? 'Payment expired'
                : 'Payment failed',
          );
        }
      },
      onError: (error) {
        if (!mounted) return;
        setState(() {
          _errorMessage = error;
        });
      },
    );

    _pollingManager!.startPolling();
  }

  /// Handle successful payment
  void _handlePaymentSuccess() {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    if (mounted) {
      setState(() {
        _paymentStatus = 'success';
      });
    }
    
    // Print receipt after successful payment
    _printReceipt();
    
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        widget.onPaymentComplete(true);
      }
    });
  }

  /// Print receipt after successful payment
  Future<void> _printReceipt() async {
    try {
      if (_transaction == null) return;

      final receiptContent = '''
╔═══════════════════════════════════════╗
║        PAYMENT RECEIPT                ║
║   ${DateTime.now().toString().split('.')[0]}    ║
╚═══════════════════════════════════════╝

Transaction ID: ${_transaction!.transactionId}
Reference #: ${_transaction!.referenceNumber}

Amount: ₱${widget.amount.toStringAsFixed(2)}
Status: ✓ PAID

═══════════════════════════════════════
Service: Document Printing
Service Type: Premium Print

═══════════════════════════════════════

Print Content:
${_GCashPaymentPageState.printContent.isNotEmpty ? _GCashPaymentPageState.printContent : 'Standard Receipt'}

═══════════════════════════════════════
Thank you for using our service!
Date: ${DateTime.now().toString().split('.')[0]}
''';

      // Send to printer
      await PrintService.printReceipt(receiptContent);
    } catch (e) {
      // Print error is non-blocking - payment already succeeded
      print('Print receipt error: $e');
    }
  }

  /// Handle payment failure
  void _handlePaymentFailure(String reason) {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    if (mounted) {
      setState(() {
        _paymentStatus = 'failed';
        _errorMessage = reason;
      });
    }
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        widget.onPaymentComplete(false);
      }
    });
  }

  /// Handle payment timeout
  void _handleTimeout() {
    if (_transaction != null && _paymentStatus != 'success') {
      _paymentService.cancelPayment(
        _transaction!.transactionId,
        reason: 'Payment timeout',
      );
    }
    setState(() {
      _paymentStatus = 'expired';
      _errorMessage = 'Payment link expired. Please try again.';
    });
    widget.onTimeout();
  }

  /// Cancel payment
  Future<void> _cancelPayment() async {
    if (_transaction == null) return;

    try {
      _countdownTimer?.cancel();
      _pollingTimer?.cancel();
      
      await _paymentService.cancelPayment(
        _transaction!.transactionId,
        reason: 'User cancelled',
      );

      setState(() {
        _paymentStatus = 'cancelled';
      });

      widget.onPaymentComplete(false);
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to cancel payment: $e';
      });
    }
  }

  /// Format time display
  String _formatTime(int seconds) {
    int mins = seconds ~/ 60;
    int secs = seconds % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  /// (DEV ONLY) Simulate success
  Future<void> _simulateSuccess() async {
    if (_transaction == null) return;
    try {
      await _paymentService.simulatePaymentSuccess(_transaction!.transactionId);
    } catch (e) {
      // Ignored
    }
  }

  /// (DEV ONLY) Simulate failure
  Future<void> _simulateFailure() async {
    if (_transaction == null) return;
    try {
      await _paymentService.simulatePaymentFailure(_transaction!.transactionId);
    } catch (e) {
      // Ignored
    }
  }

  /// (DEV ONLY) Test printer without payment
  Future<void> _testPrintDirect() async {
    try {
      final demoReceipt = '''
╔═══════════════════════════════════════╗
║     PRINTING SERVICE RECEIPT          ║
║       Demo Test - ${DateTime.now()}    ║
╚═══════════════════════════════════════╝

Transaction ID: DEMO-${_transaction?.transactionId ?? 'TEST'}
Reference: ${_transaction?.referenceNumber ?? 'REF-TEST'}

Amount Paid: ₱${widget.amount.toStringAsFixed(2)}
Print Quality: Test Mode
Pages: 1

═══════════════════════════════════════

Status: ✓ TEST SUCCESS

Printer Connection: OK
Print Job Submitted Successfully

═══════════════════════════════════════
Thank you for using our service!
Date: ${DateTime.now()}
''';

      // Test the print service
      final success = await PrintService.printReceipt(demoReceipt);
      
      if (!mounted) return;
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Print job sent successfully!' : 'Print service unavailable (demo mode)'),
          backgroundColor: success ? Colors.green : Colors.orange,
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Print test error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.credit_card, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'GCash Payment',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Text('Scan the QR code with your GCash app to complete payment'),
              ],
            ),
          ],
        ),
        const SizedBox(height: 32),
        if (_isLoading)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 50,
                      height: 50,
                      child: CircularProgressIndicator(
                        strokeWidth: 4,
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Generating payment link...',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
          )
        else if (_errorMessage != null && _paymentStatus == 'failed')
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 80,
                      height: 80,
                      child: Icon(Icons.error_outline, size: 80, color: Colors.red),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Payment Failed',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Colors.red,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _errorMessage ?? 'An error occurred',
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          )
        else if (_paymentStatus == 'success')
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: Colors.green[100],
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check, size: 50, color: Colors.green),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Payment Successful!',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Colors.green,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Your service is being processed',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
          )
        else if (_transaction != null)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Timer
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: _timeLeft < 60 ? Colors.red[50] : Color(0xFFF0F9FF),
                        border: Border.all(
                          color: _timeLeft < 60 ? Colors.red : Color(0xFF60A5FA),
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Time Remaining',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _formatTime(_timeLeft),
                            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                              color: _timeLeft < 60 ? Colors.red : Color(0xFF2563EB),
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Amount
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Color(0xFFF0F9FF),
                        border: Border.all(color: Color(0xFF60A5FA)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Amount to Pay',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '₱${_transaction!.amount.toStringAsFixed(2)}',
                            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              color: Color(0xFF2563EB),
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // QR Code
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Color(0xFFD5D7E0), width: 2),
                        borderRadius: BorderRadius.circular(8),
                        color: Colors.white,
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Scan with GCash',
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                          const SizedBox(height: 12),
                          // QR Code Placeholder
                          Container(
                            width: 280,
                            height: 280,
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.black, width: 2),
                              color: Colors.grey[200],
                            ),
                            child: Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.qr_code_2, size: 80, color: Colors.black87),
                                  const SizedBox(height: 12),
                                  Text(
                                    _transaction != null 
                                      ? _transaction!.referenceNumber 
                                      : 'REF-000000',
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.black87,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Reference Number
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Reference Number',
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _transaction!.referenceNumber,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Demo Mode Notice
                    if (_errorMessage != null && _errorMessage!.contains('Demo Mode'))
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.orange[50],
                          border: Border.all(color: Colors.orange),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.info, color: Colors.orange[700], size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _errorMessage!,
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: Colors.orange[900],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (_errorMessage != null && _errorMessage!.contains('Demo Mode'))
                      const SizedBox(height: 16),

                    // Instructions
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.blue[50],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'How to Pay:',
                            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 12),
                          _buildInstructionStep(
                            '1',
                            'Open your GCash app',
                            context,
                          ),
                          const SizedBox(height: 8),
                          _buildInstructionStep(
                            '2',
                            'Tap the scan/camera button',
                            context,
                          ),
                          const SizedBox(height: 8),
                          _buildInstructionStep(
                            '3',
                            'Point at the QR code above',
                            context,
                          ),
                          const SizedBox(height: 8),
                          _buildInstructionStep(
                            '4',
                            'Enter your MPIN to confirm',
                            context,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Status
                    if (_paymentStatus != 'pending')
                      Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.amber[50],
                              border: Border.all(color: Colors.amber),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.info, color: Colors.amber[700], size: 20),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'Status: ${_paymentStatus.toUpperCase()}',
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Colors.amber[900],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                      ),

                    // Action Buttons
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: _cancelPayment,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.grey[300],
                              foregroundColor: Colors.black,
                            ),
                            child: const Text('Cancel Payment'),
                          ),
                        ),
                      ],
                    ),

                    // Development Tools
                    if (_showDevTools && _transaction != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Column(
                          children: [
                            Divider(color: Colors.grey[300]),
                            const SizedBox(height: 12),
                            Text(
                              'Development Testing',
                              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: Colors.grey[600],
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: _simulateSuccess,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.green[400],
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text('Simulate Success', style: TextStyle(fontSize: 12)),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: _simulateFailure,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.red[400],
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text('Simulate Failure', style: TextStyle(fontSize: 12)),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            ElevatedButton.icon(
                              onPressed: _testPrintDirect,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.blue[600],
                                foregroundColor: Colors.white,
                              ),
                              icon: const Icon(Icons.print, size: 16),
                              label: const Text('Test Printer', style: TextStyle(fontSize: 12)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildInstructionStep(
    String number,
    String text,
    BuildContext context,
  ) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: Color(0xFF2563EB),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              number,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodySmall),
        ),
      ],
    );
  }
}

class StorageInterface extends StatefulWidget {
  final List<ScannedDocument> documents;
  final Function(String) onDelete;
  final Function(ScannedDocument) onPrint;
  final Function(List<ScannedDocument>) onSelectForPrint;
  final bool printingMode;
  final Function() onCancelPrintMode;

  const StorageInterface({
    super.key,
    required this.documents,
    required this.onDelete,
    required this.onPrint,
    required this.onSelectForPrint,
    required this.printingMode,
    required this.onCancelPrintMode,
  });

  @override
  State<StorageInterface> createState() => _StorageInterfaceState();
}

class _StorageInterfaceState extends State<StorageInterface> {
  final Set<String> _selectedDocs = {};

  void _showUploadOptions(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Upload File'),
          content: const Text('Choose transfer method:'),
          actions: [
            TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Bluetooth transfer started...'),
                    backgroundColor: Colors.blue,
                  ),
                );
              },
              icon: const Icon(Icons.bluetooth),
              label: const Text('Bluetooth'),
            ),
            TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('WiFi Hotspot transfer started...'),
                    backgroundColor: Colors.orange,
                  ),
                );
              },
              icon: const Icon(Icons.wifi),
              label: const Text('WiFi Hotspot'),
            ),
            TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                _showQrTransferDialog(context);
              },
              icon: const Icon(Icons.qr_code),
              label: const Text('QR Code'),
            ),
          ],
        );
      },
    );
  }

  void _showQrTransferDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('QR Code Transfer'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.qr_code, size: 80, color: Colors.grey[400]),
                      const SizedBox(height: 12),
                      Text(
                        'TXN-${DateTime.now().millisecondsSinceEpoch}',
                        style: const TextStyle(fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Scan this QR code on another device to transfer files',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
            TextButton.icon(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('QR code copied to clipboard'),
                    backgroundColor: Colors.green,
                  ),
                );
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copy'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.folder_open, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'System Storage',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Color(0xFF003D99),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    widget.printingMode
                        ? 'Select documents to print'
                        : 'View and manage your saved documents',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Color(0xFF4B5563),
                    ),
                  ),
                ],
              ),
            ),
            if (!widget.printingMode)
              ElevatedButton.icon(
                onPressed: () => _showUploadOptions(context),
                icon: const Icon(Icons.cloud_upload),
                label: const Text('Upload'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                ),
              ),
          ],
        ),
        const SizedBox(height: 24),
        if (widget.documents.isEmpty)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(48),
                child: Column(
                  children: [
                    Icon(Icons.folder_open, size: 64, color: Color(0xFF9CA3AF)),
                    const SizedBox(height: 16),
                    Text(
                      'No Documents in Storage',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Color(0xFF4B5563),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text('Upload files or use the scanning service to digitize your documents'),
                  ],
                ),
              ),
            ),
          )
        else
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: widget.documents.map((doc) {
              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      if (widget.printingMode)
                        Checkbox(
                          value: _selectedDocs.contains(doc.id),
                          onChanged: (val) {
                            setState(() {
                              if (val == true) {
                                _selectedDocs.add(doc.id);
                              } else {
                                _selectedDocs.remove(doc.id);
                              }
                            });
                          },
                        ),
                      Icon(Icons.description, color: Color(0xFF2563EB)),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              doc.name,
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            Text(
                              '${doc.format} • ${doc.pages} pages • ${doc.size} • ${doc.date}',
                              style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                            ),
                          ],
                        ),
                      ),
                      if (!widget.printingMode)
                        Row(
                          children: [
                            ElevatedButton.icon(
                              onPressed: () => widget.onPrint(doc),
                              icon: const Icon(Icons.print, size: 16),
                              label: const Text('Print'),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton.icon(
                              onPressed: () => widget.onDelete(doc.id),
                              icon: const Icon(Icons.delete, size: 16),
                              label: const Text('Delete'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.red,
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
      ],
    );
  }
}

// ============================================================================
// Separate GCash Payment Page
// ============================================================================

class GCashPaymentPage extends StatefulWidget {
  final Function(String) onNavigate;

  const GCashPaymentPage({
    super.key,
    required this.onNavigate,
  });

  @override
  State<GCashPaymentPage> createState() => _GCashPaymentPageState();
}

class _GCashPaymentPageState extends State<GCashPaymentPage> {
  static double pendingAmount = 50.0;
  static String printContent = ''; // Store content to print after payment

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Header with back button
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
          ),
          child: Row(
            children: [
              ElevatedButton.icon(
                onPressed: () => widget.onNavigate('services'),
                icon: const Icon(Icons.arrow_back),
                label: const Text('Back to Services'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey[300],
                  foregroundColor: Colors.black,
                ),
              ),
              const SizedBox(width: 16),
              Text(
                'GCash Payment',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Color(0xFF003D99),
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
        // Payment content - scrollable
        Expanded(
          child: SingleChildScrollView(
            child: PaymentInterface(
              amount: pendingAmount,
              onPaymentComplete: (success) {
                if (success) {
                  // Show success and return to services
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Payment successful! Returning to services...'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  Future.delayed(const Duration(seconds: 2), () {
                    if (mounted) {
                      widget.onNavigate('services');
                    }
                  });
                } else {
                  // Show failure message
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Payment failed. Please try again.'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
              onTimeout: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Payment timeout. Returning to services...'),
                    backgroundColor: Colors.orange,
                  ),
                );
                Future.delayed(const Duration(seconds: 2), () {
                  if (mounted) {
                    widget.onNavigate('services');
                  }
                });
              },
            ),
          ),
        ),
      ],
    );
  }
}
