import 'package:flutter/material.dart';
import 'storage_service.dart';
import 'strings.dart';
import 'transfer_service.dart';
import 'pages/printing_page.dart';
import 'pages/image_print_settings_page.dart';
import 'pages/scanning_page.dart';
import 'pages/photocopying_page.dart';
import 'pages/storage_page.dart';

class ServicesPage extends StatefulWidget {
  final Function(String) onNavigate;

  const ServicesPage({super.key, required this.onNavigate});

  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  /// null → show the service picker. Otherwise only the chosen service's
  /// interface is shown, with a "Back to Services" button.
  String? _activeService;
  List<StorageDocument> _savedDocuments = [];
  List<StorageDocument> _selectedDocsForPrint = [];
  bool _printingFromStorage = false;
  /// Which print flow "Back to Printing" should return to — 'printing' or
  /// 'imagePrint' — set alongside _printingFromStorage.
  String _printingSource = 'printing';
  final TransferManager _transferManager = TransferManager();

  @override
  void initState() {
    super.initState();
    _loadDocuments();
    _transferManager.initializeAll();
  }

  @override
  void dispose() {
    _transferManager.dispose();
    super.dispose();
  }

  Future<void> _loadDocuments() async {
    final docs = await StorageService.getDocuments();
    setState(() {
      _savedDocuments = docs;
    });
  }

  bool get _backendAvailable => StorageService.backendAvailable;

  void _handleServiceChange(String service) {
    setState(() {
      _activeService = service;
    });
  }

  void _handleDeleteDocument(String id) async {
    final docToDelete = _savedDocuments.firstWhere(
      (doc) => doc.id == id,
      orElse: () => StorageDocument(
        id: '', name: '', originalName: '', format: '', pages: 0, size: '', date: '', mimeType: '',
      ),
    );

    if (docToDelete.id.isNotEmpty) {
      final success = await StorageService.deleteDocument(docToDelete.name);
      if (success) {
        setState(() {
          _savedDocuments.removeWhere((doc) => doc.id == id);
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Document deleted successfully'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    }
  }

  void _handleSelectDocForPrint(List<StorageDocument> docs) {
    if (docs.isEmpty) return;

    final imageCount = docs.where((d) => d.isImage).length;
    if (imageCount > 0 && imageCount < docs.length) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select only images or only documents for one print job.'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final isImageJob = imageCount == docs.length;
    setState(() {
      _selectedDocsForPrint = docs;
      _activeService = isImageJob ? 'imagePrint' : 'printing';
      _printingSource = _activeService!;
      _printingFromStorage = true;
    });
  }

  void _handleBrowseStorage() {
    setState(() {
      _activeService = 'storage';
      _printingFromStorage = true;
    });
  }

  static const Map<String, String> _serviceTitleKeys = {
    'printing': 'services.printing.title',
    'scanning': 'services.scanning.title',
    'photocopying': 'services.photocopying.title',
    'storage': 'services.storage.title',
  };

  String _serviceTitleFor(String? serviceId) {
    if (serviceId == 'imagePrint') return Strings.t('services.imagePrint.title');
    final key = _serviceTitleKeys[serviceId];
    return key == null ? '' : Strings.t(key);
  }

  @override
  Widget build(BuildContext context) {
    return _activeService == null ? _buildServicePicker(context) : _buildServiceView(context);
  }

  /// Step 1 — pick a service. Nothing else is shown.
  Widget _buildServicePicker(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(child: _buildServicePickerContent(context)),
        ),
      ),
    );
  }

  Widget _buildServicePickerContent(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 16),
            child: Column(
              children: [
                Text(
                  Strings.t('services.heading'),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  Strings.t('services.subheading'),
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1500),
              child: GridView.count(
                crossAxisCount: MediaQuery.of(context).size.width < 768 ? 1 : 4,
                childAspectRatio: 0.95,
                crossAxisSpacing: 28,
                mainAxisSpacing: 28,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildServiceButton('printing', Strings.t('services.printing.title'),
                      Strings.t('services.printing.subtitle'), Icons.print),
                  _buildServiceButton('scanning', Strings.t('services.scanning.title'),
                      Strings.t('services.scanning.subtitle'), Icons.document_scanner),
                  _buildServiceButton('photocopying', Strings.t('services.photocopying.title'),
                      Strings.t('services.photocopying.subtitle'), Icons.copy),
                  _buildServiceButton('storage', Strings.t('services.storage.title'),
                      Strings.t('services.storage.subtitle'), Icons.folder_open),
                ],
              ),
            ),
          ),
        ],
    );
  }

  /// Step 2 — the chosen service only, with a Back button. The app header
  /// stays above this (it lives in main.dart).
  Widget _buildServiceView(BuildContext context) {
    // While picking documents to print, "Back" returns to the Printing screen
    // rather than all the way out to the picker.
    final backToPrinting = _activeService == 'storage' && _printingFromStorage;
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 12, 16, 0),
            child: Row(
              children: [
                TextButton.icon(
                  onPressed: () => setState(() {
                    if (backToPrinting) {
                      _activeService = _printingSource;
                      _printingFromStorage = false;
                    } else {
                      _activeService = null;
                      _printingFromStorage = false;
                    }
                  }),
                  icon: const Icon(Icons.arrow_back, size: 20),
                  label: Text(backToPrinting
                      ? (_printingSource == 'imagePrint'
                          ? Strings.t('services.backToImagePrint')
                          : Strings.t('services.backToPrinting'))
                      : Strings.t('services.backToServices')),
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFF2563EB),
                    minimumSize: const Size(0, 44),
                  ),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    _serviceTitleFor(_activeService),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Theme.of(context).colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: Theme.of(context).colorScheme.surface,
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            padding: const EdgeInsets.all(32),
            child: _buildActiveServiceWidget(),
          ),
        ],
      ),
    );
  }

  Widget _buildServiceButton(String serviceId, String title, String subtitle, IconData icon) {
    final isActive = _activeService == serviceId;
    final colorScheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: isActive,
      label: '$title. $subtitle',
      child: InkWell(
        onTap: () => _handleServiceChange(serviceId),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          decoration: BoxDecoration(
            color: isActive ? const Color(0xFF2563EB) : colorScheme.surface,
            border: Border.all(
              color: isActive ? const Color(0xFF2563EB) : colorScheme.outlineVariant,
              width: isActive ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ExcludeSemantics(
                  child: Icon(
                    icon,
                    size: 76,
                    color: isActive ? Colors.white : const Color(0xFF2563EB),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                    color: isActive ? Colors.white : colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 15,
                    color: isActive ? Colors.white : colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
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
          onRemoveSelectedDoc: (docId) {
            setState(() {
              _selectedDocsForPrint.removeWhere((doc) => doc.id == docId);
            });
          },
          onNavigate: widget.onNavigate,
        );
      case 'imagePrint':
        return ImagePrintSettingsInterface(
          onBrowseStorage: _handleBrowseStorage,
          selectedDocs: _selectedDocsForPrint,
          onClearSelectedDocs: () {
            setState(() {
              _selectedDocsForPrint = [];
              _printingFromStorage = false;
            });
          },
          onRemoveSelectedDoc: (docId) {
            setState(() {
              _selectedDocsForPrint.removeWhere((doc) => doc.id == docId);
            });
          },
          onNavigate: widget.onNavigate,
        );
      case 'scanning':
        return ScanningInterface(
          savedDocuments: _savedDocuments,
          onDocumentSaved: _loadDocuments,
          onNavigate: widget.onNavigate,
        );
      case 'photocopying':
        return PhotocopyingInterface(
          onNavigate: widget.onNavigate,
          onDocumentSaved: _loadDocuments,
        );
      case 'storage':
        return StorageInterface(
          documents: _savedDocuments,
          onDelete: _handleDeleteDocument,
          onPrint: (doc) {
            setState(() {
              _selectedDocsForPrint = [doc];
              _activeService = doc.isImage ? 'imagePrint' : 'printing';
              _printingSource = _activeService!;
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
          onUpload: _loadDocuments,
          transferManager: _transferManager,
          backendAvailable: _backendAvailable,
        );
      default:
        return const SizedBox.shrink();
    }
  }
}
