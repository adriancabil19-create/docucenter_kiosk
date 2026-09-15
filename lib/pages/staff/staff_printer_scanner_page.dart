import 'package:flutter/material.dart';
import '../../print_service.dart';
import '../../scanner_status.dart';
import '_staff_scaffold.dart';

/// Printer, scanner, and receipt-printer diagnostics (rules 15-17), grouped
/// under one dashboard entry per rule 13's "Printer & Scanner" menu item.
class StaffPrinterScannerPage extends StatefulWidget {
  const StaffPrinterScannerPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffPrinterScannerPage> createState() => _StaffPrinterScannerPageState();
}

class _StaffPrinterScannerPageState extends State<StaffPrinterScannerPage> {
  static const _scannerService = ScannerStatusService();

  bool _printing = false;
  String? _printResult;
  bool _printingReceipt = false;
  String? _receiptResult;

  var _scanner = const ScannerStatusSnapshot.checking();

  @override
  void initState() {
    super.initState();
    _checkScanner();
  }

  Future<void> _checkScanner() async {
    setState(() => _scanner = const ScannerStatusSnapshot.checking());
    final result = await _scannerService.check();
    if (mounted) setState(() => _scanner = result);
  }

  Future<void> _printTest() async {
    setState(() {
      _printing = true;
      _printResult = null;
    });
    final ok = await PrintingService.printTestPage();
    if (!mounted) return;
    setState(() {
      _printing = false;
      _printResult = ok ? 'Test page sent to the printer.' : 'Print test failed — check the printer.';
    });
  }

  Future<void> _printTestReceipt() async {
    setState(() {
      _printingReceipt = true;
      _receiptResult = null;
    });
    final ok = await PrintingService.printReceipt(
      'DOCUCENTER KIOSK\n--- STAFF DIAGNOSTIC RECEIPT ---\nThis is a test receipt.\nNo transaction was recorded.',
    );
    if (!mounted) return;
    setState(() {
      _printingReceipt = false;
      _receiptResult = ok ? 'Test receipt printed.' : 'Receipt test failed — check the printer.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return StaffScaffold(
      title: 'Printer & Scanner',
      onBack: widget.onBack,
      children: [
        const Text('PRINTER TEST', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _printing ? null : _printTest,
            child: Text(_printing ? 'Printing…' : 'Print Test Page'),
          ),
        ),
        if (_printResult != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_printResult!)),
        const SizedBox(height: 24),

        const Text('SCANNER TEST', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        ScannerStatusPanel(snapshot: _scanner, onRetry: _checkScanner),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(onPressed: _checkScanner, child: const Text('Refresh Status')),
        ),
        const SizedBox(height: 24),

        const Text('RECEIPT PRINTER', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _printingReceipt ? null : _printTestReceipt,
            child: Text(_printingReceipt ? 'Printing…' : 'Print Test Receipt'),
          ),
        ),
        if (_receiptResult != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_receiptResult!)),
      ],
    );
  }
}
