import 'package:flutter/material.dart';
import 'storage_service.dart';
import 'transfer_service.dart';
import 'pages/printing_page.dart';
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
  String _activeService = 'printing';
  List<StorageDocument> _savedDocuments = [];
  List<StorageDocument> _selectedDocsForPrint = [];
  bool _printingFromStorage = false;
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
                    color: const Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'Select a service below to access printing, scanning, or photocopying features',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: const Color(0xFF4B5563),
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
          color: isActive ? const Color(0xFF2563EB) : Colors.white,
          border: Border.all(
            color: isActive ? const Color(0xFF2563EB) : const Color(0xFFE5E7EB),
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
                color: isActive ? Colors.white : const Color(0xFF2563EB),
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
                  color: isActive ? Colors.white70 : const Color(0xFF4B5563),
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
          onUpload: _loadDocuments,
          transferManager: _transferManager,
        );
      default:
        return const SizedBox.shrink();
    }
  }
}
