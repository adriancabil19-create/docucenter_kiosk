import 'package:flutter/material.dart';
import '../../print_service.dart';
import '../../scanner_status.dart';
import '../../staff_session.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

/// Printer and scanner diagnostics (rules 15-17), grouped under one dashboard
/// entry per rule 13's "Printer & Scanner" menu item. No receipt printer here
/// — receipts are shown on-screen after a transaction, never printed.
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
  bool _printOk = false;

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
    final ok = await PrintingService.printTestPage(
      actor: StaffSession.instance.currentStaff?.name,
    );
    if (!mounted) return;
    setState(() {
      _printing = false;
      _printOk = ok;
      _printResult = ok ? 'Test page sent to the printer.' : 'Print test failed — check the printer.';
    });
  }

  @override
  Widget build(BuildContext context) {
    return StaffScaffold(
      title: 'Printer & Scanner',
      onBack: widget.onBack,
      children: [
        const StaffSectionLabel('Printer Test'),
        const SizedBox(height: 10),
        StaffCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  StaffIconBadge(icon: Icons.print_rounded, color: StaffColors.primary, size: 40),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Send a one-page test print to confirm the printer is working end to end.',
                      style: TextStyle(fontSize: 13, color: StaffColors.textSecondary, height: 1.4),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton.icon(
                  onPressed: _printing ? null : _printTest,
                  icon: _printing
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.print_outlined, size: 18),
                  style: FilledButton.styleFrom(
                    backgroundColor: StaffColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  label: Text(_printing ? 'Printing…' : 'Print Test Page', style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              if (_printResult != null) ...[
                const SizedBox(height: 12),
                StaffBanner(
                  text: _printResult!,
                  color: _printOk ? StaffColors.success : StaffColors.danger,
                  icon: _printOk ? Icons.check_circle_outline_rounded : Icons.error_outline_rounded,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 22),
        const StaffSectionLabel('Scanner Test'),
        const SizedBox(height: 10),
        StaffCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ScannerStatusPanel(snapshot: _scanner, onRetry: _checkScanner),
              SizedBox(
                width: double.infinity,
                height: 46,
                child: OutlinedButton.icon(
                  onPressed: _checkScanner,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Refresh Status', style: TextStyle(fontWeight: FontWeight.w700)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: StaffColors.textPrimary,
                    side: const BorderSide(color: StaffColors.border, width: 1.4),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
