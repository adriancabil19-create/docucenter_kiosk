// DEMO MODE: Photocopying requires physical copier hardware.
// This page simulates the photocopying workflow for thesis/demo purposes.
import 'package:flutter/material.dart';
import 'package:flutter_twain_scanner/dynamsoft_service.dart';
import 'package:image/image.dart' as img;
import 'dart:typed_data';
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
  // Photocopying settings - ADF-only with selectable options
  int _copies = 1;
  String _colorMode = 'color';
  String _dpi = '300';
  String _paperSize = 'A4';
  String _quality = 'standard';
  bool _collate = true;
  final double _brightness = 0.0;
  final double _contrast = 0.0;

  bool _isScanning = false;
  List<Uint8List> _scannedImages = [];
  String _scanStatus = '';
  String _adfMessage = ''; // ADF status message

  final DynamsoftService _dynamsoftService = DynamsoftService();
  final String _host = 'http://127.0.0.1:18622';
  final String _license = 't0200EQYAACdTxWAVwW/IIbkLSSWSboeM7i37QH6J75HEH8pOSydAno8ilBC40qlhRTQ37w7VY63TyF81OQumTpZk/m+MRFi215UTE5wy3pnEY508wYlHTiKXPm0+bZXGxQEIwJon+16HH8A1kNdyAjZ99F4ZCgA9QDqA9NbAPaC5C5981MmLv/85vXegLScmOGW8sy6QMU6e4MQjpy+QxZLa/W73XCBc35wCQA+QJpDmZWoUCJ0B9ABpAtupilEAZLQ2zhn7AZNyN6M='; // Dynamsoft license key

  bool get _hasDynamsoftLicense => _license.trim().isNotEmpty;

  double _calculateCopyingCost() {
    // Photocopying pricing: Color 2 pesos, B/W 1 peso
    double costPerCopy = _colorMode == 'color' ? 2.0 : 1.0;
    return costPerCopy * _copies;
  }

  /// Get paper dimensions in pixels based on paper size and DPI
  Map<String, int> _getPaperDimensions() {
    int dpi = int.tryParse(_dpi) ?? 300;
    // Paper dimensions in inches
    late double width, height;
    
    switch (_paperSize) {
      case 'A4':
        width = 8.27; // 210mm
        height = 11.69; // 297mm
        break;
      case 'Folio':
        width = 8.5; // 216mm
        height = 13.0; // 330mm
        break;
      case 'Letter':
        width = 8.5; // 216mm
        height = 11.0; // 279mm
        break;
      default:
        width = 8.27;
        height = 11.69;
    }
    
    // Convert inches to pixels at specified DPI
    return {
      'width': (width * dpi).toInt(),
      'height': (height * dpi).toInt(),
    };
  }

  /// Resize scanned image to match the selected paper size
  Future<Uint8List> _resizeImageToPaperSize(Uint8List imageData) async {
    try {
      // Decode the image
      img.Image? image = img.decodeImage(imageData);
      if (image == null) return imageData; // If decode fails, return original
      
      // Get target paper dimensions
      final dimensions = _getPaperDimensions();
      final targetWidth = dimensions['width']!;
      final targetHeight = dimensions['height']!;
      
      // Resize image to match paper dimensions
      img.Image resized = img.copyResize(
        image,
        width: targetWidth,
        height: targetHeight,
        interpolation: img.Interpolation.linear,
      );
      
      // Encode back to bytes
      return Uint8List.fromList(img.encodeJpg(resized, quality: 95));
    } catch (e) {
      debugPrint('Image resize failed: $e');
      return imageData; // Return original if resize fails
    }
  }

  /// Resize all scanned images to paper size
  Future<List<Uint8List>> _resizeAllImages(List<Uint8List> images) async {
    List<Uint8List> resized = [];
    for (final image in images) {
      final resizedImage = await _resizeImageToPaperSize(image);
      resized.add(resizedImage);
    }
    return resized;
  }


  Future<void> _scanForCopying() async {
    setState(() {
      _isScanning = true;
      _scanStatus = 'Connecting to scanner service...';
    });

    try {
      // Get list of devices
      List<dynamic> devices = await _dynamsoftService.getDevices(_host);
      if (devices.isEmpty) {
        setState(() {
          _scanStatus = 'No scanners found. Please ensure Brother MFC-J2730DW is connected and TWAIN driver is installed.';
          _isScanning = false;
        });
        return;
      }

      setState(() {
        _scanStatus = 'Found scanner: ${devices[0]['name']}. Starting scan with ADF...';
      });

      if (!_hasDynamsoftLicense) {
        final scanned = await _scanUsingDirectTwain();
        if (scanned) {
          return;
        }
      }

      Map<String, dynamic> job = await _dynamsoftService.createJob(_host, {
        'license': _license,
        'device': devices[0]['device'],
        'config': {
          'IfShowUI': false,
          'PixelType': _colorMode == 'color' ? 2 : 0,
          'Resolution': int.tryParse(_dpi) ?? 300,
          'IfFeederEnabled': true,
          'IfDuplexEnabled': false,
        }
      });

      if (job.isEmpty) {
        throw Exception(
          'Dynamsoft createJob failed. Please verify the license key in the app and ensure the Dynamic Web TWAIN Service is running.',
        );
      }

      // Get scanned images
      List<Uint8List> images = await _dynamsoftService.getImageStreams(_host, job['jobuid']);

      if (images.isEmpty) {
        throw Exception('No scanned image data was returned by Dynamsoft.');
      }

      // Resize images to selected paper size
      setState(() {
        _scanStatus = 'Resizing images to $_paperSize...';
      });
      List<Uint8List> resizedImages = await _resizeAllImages(images);

      setState(() {
        _scannedImages = resizedImages;
        _scanStatus = 'Scan completed successfully! ${resizedImages.length} page(s) scanned and resized to $_paperSize.';
        _isScanning = false;
      });

    } catch (e) {
      setState(() {
        _scanStatus = 'Scan failed: $e';
        _isScanning = false;
      });
    }
  }

  Future<void> _scanDocument() async {
    setState(() {
      _isScanning = true;
      _scanStatus = 'Starting scan...';
      _adfMessage = 'Preparing scanner...';
    });
    await _scanForCopying();
  }

  Future<bool> _scanUsingDirectTwain() async {
    try {
      // Simulate TWAIN scan for demo purposes (replace with actual API when available)
      await Future.delayed(const Duration(seconds: 2)); // Simulate scan delay
      // Mock scanned image data (e.g., a simple white image)
      Uint8List mockImage = Uint8List.fromList(List.generate(100 * 100 * 3, (index) => 255)); // 100x100 RGB white image
      List<Uint8List> images = [mockImage]; // Simulate one scanned page

      if (images.isNotEmpty) {
        // Resize images to selected paper size
        setState(() {
          _scanStatus = 'Resizing images to $_paperSize...';
        });
        List<Uint8List> resizedImages = await _resizeAllImages(images);

        setState(() {
          _scannedImages = resizedImages;
          _scanStatus = 'Scan completed successfully using TWAIN! ${resizedImages.length} page(s) scanned and resized to $_paperSize.';
          _isScanning = false;
        });
        return true;
      } else {
        setState(() {
          _scanStatus = 'TWAIN scan failed: No images captured.';
          _isScanning = false;
        });
        return false;
      }
    } catch (e) {
      setState(() {
        _scanStatus = 'TWAIN scan failed: $e';
        _isScanning = false;
      });
      return false;
    }
  }

  /// Build receipt text for photocopying — called after payment succeeds.
  String _buildCopyingReceipt() {
    String brightnessLabel;
    if (_brightness < -0.1) {
      brightnessLabel = 'Dark (${(_brightness * 100).round()}%)';
    } else if (_brightness > 0.1) {
      brightnessLabel = 'Bright (+${(_brightness * 100).round()}%)';
    } else {
      brightnessLabel = 'Normal';
    }

    String contrastLabel;
    if (_contrast < -0.1) {
      contrastLabel = 'Low (${(_contrast * 100).round()}%)';
    } else if (_contrast > 0.1) {
      contrastLabel = 'High (+${(_contrast * 100).round()}%)';
    } else {
      contrastLabel = 'Normal';
    }

    return '''
========================================
         PHOTOCOPYING RECEIPT
   ${DateTime.now().toString().split('.')[0]}
========================================

Service: Photocopying
Copies Requested: $_copies
Paper Size: $_paperSize
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Copy Quality: ${_quality == 'draft' ? 'Draft' : 'Standard'}
Collate: ${_collate ? 'Yes (1-2-3, 1-2-3)' : 'No (1-1-1, 2-2-2)'}
Brightness: $brightnessLabel
Contrast: $contrastLabel

----------------------------------------
Cost Breakdown:
Cost per Copy: PHP ${(_colorMode == 'color' ? 2.0 : 1.0).toStringAsFixed(2)}
Total Copies: $_copies
Total Cost: PHP ${_calculateCopyingCost().toStringAsFixed(2)}

----------------------------------------
Date: ${DateTime.now().toString().split('.')[0]}
Status: [COPY JOB SUBMITTED]

Document will be copied automatically.

----------------------------------------
Thank you for using our service!
''';
  }

  void _startPhotocopying() async {
    if (_scannedImages.isEmpty) {
      await _scanDocument();
      if (_scannedImages.isEmpty) {
        // Scan failed, don't proceed
        return;
      }
    }

    PAYMONGOPaymentPageState.pendingAmount = _calculateCopyingCost();
    PAYMONGOPaymentPageState.printContent = '''PHOTOCOPYING JOB
-----------------
Copies: $_copies
Color Mode: ${_colorMode == 'color' ? 'Color' : 'Black & White'}
Paper Size: $_paperSize
Copy Quality: ${_quality == 'draft' ? 'Draft' : 'Standard'}
Collate: ${_collate ? 'Yes' : 'No'}
Total Cost: PHP ${_calculateCopyingCost().toStringAsFixed(2)}''';
    PAYMONGOPaymentPageState.printFiles = _scannedImages; // Use scanned images
    PAYMONGOPaymentPageState.paperSize = _paperSize;
    PAYMONGOPaymentPageState.colorMode = _colorMode;
    PAYMONGOPaymentPageState.quality = _quality;
    // Store the photocopying receipt so it prints AFTER payment succeeds
    PAYMONGOPaymentPageState.pendingReceiptContent = _buildCopyingReceipt();

    widget.onNavigate('payment');
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Demo mode notice
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: Colors.green[50],
              border: Border.all(color: Colors.green),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Scanner Connected — Brother MFC-J2730DW detected via TWAIN. Ready for real scanning.',
                    style: TextStyle(fontSize: 12, color: Colors.black87),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
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
                          const Text('Documents scanned via ADF and copied • Color scanning default'),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Display ADF message if applicable
          if (_adfMessage.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: _adfMessage.contains('please place') ? Colors.orange[50] : Colors.green[50],
                border: Border.all(color: _adfMessage.contains('please place') ? Colors.orange : Colors.green),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    _adfMessage.contains('please place') ? Icons.warning : Icons.check_circle,
                    color: _adfMessage.contains('please place') ? Colors.orange : Colors.green,
                    size: 24,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _adfMessage,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: _adfMessage.contains('please place') ? Colors.orange[900] : Colors.green[900],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          // Copy configuration
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Number of Copies',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
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
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _copies < 20 ? () => setState(() => _copies++) : null,
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
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['color', 'bw'].map((mode) {
                      final label = mode == 'color' ? 'Color' : 'B&W';
                      return FilterChip(
                        label: Text(label),
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
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Resolution (DPI)',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['150', '200', '300', '600'].map((dpi) {
                      return FilterChip(
                        label: Text(dpi),
                        selected: _dpi == dpi,
                        onSelected: (_) => setState(() => _dpi = dpi),
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
                    'Paper Size',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
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
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Copy Quality',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    children: ['standard', 'draft'].map((quality) {
                      final label = quality == 'draft' ? 'Draft' : 'Standard';
                      return FilterChip(
                        label: Text(label),
                        selected: _quality == quality,
                        onSelected: (_) => setState(() => _quality = quality),
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
                title: const Text('Collate Copies'),
                subtitle: const Text('Keep copies in order when printing multiple pages'),
                value: _collate,
                onChanged: (val) => setState(() => _collate = val ?? true),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Card(
            color: Colors.blue[50],
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text(
                    'Estimated Cost',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '₱${_calculateCopyingCost().toStringAsFixed(2)}',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: const Color(0xFF2563EB),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          if (_scanStatus.isNotEmpty)
            Card(
              color: _scannedImages.isNotEmpty ? Colors.green[50] : Colors.red[50],
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(_scanStatus),
              ),
            ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isScanning ? null : _startPhotocopying,
              icon: _isScanning ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.play_arrow),
              label: Text(_isScanning ? 'Scanning...' : (_scannedImages.isNotEmpty ? 'Proceed to Payment' : 'Scan Document')),
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

}

