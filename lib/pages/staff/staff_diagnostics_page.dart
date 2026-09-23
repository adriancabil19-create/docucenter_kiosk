import 'package:flutter/material.dart';
import '../../kiosk_runtime_service.dart';
import '../../scanner_status.dart';
import '../../staff_service.dart';
import '../../storage_service.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

enum _CheckState { pending, running, pass, fail, manual }

class _Check {
  _Check(this.label);
  final String label;
  _CheckState state = _CheckState.pending;
}

/// Full-system diagnostic sweep (rule 14). Every check calls the real
/// service — nothing here is a hard-coded PASS.
class StaffDiagnosticsPage extends StatefulWidget {
  const StaffDiagnosticsPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffDiagnosticsPage> createState() => _StaffDiagnosticsPageState();
}

class _StaffDiagnosticsPageState extends State<StaffDiagnosticsPage> {
  final Map<String, _Check> _checks = {
    'app': _Check('Application'),
    'backend': _Check('Backend'),
    'storage': _Check('Database / Storage'),
    'network': _Check('Network'),
    'payment': _Check('Payment Connection'),
    'printer': _Check('Printer'),
    'scanner': _Check('Scanner'),
  };
  bool _running = false;

  Future<void> _runAll() async {
    setState(() {
      _running = true;
      for (final c in _checks.values) {
        c.state = _CheckState.running;
      }
    });

    void set(String key, bool ok) => setState(() => _checks[key]!.state = ok ? _CheckState.pass : _CheckState.fail);

    setState(() => _checks['app']!.state = _CheckState.pass); // we're running, so the app itself is up

    set('backend', KioskRuntime.instance.connected);
    set('printer', KioskRuntime.instance.printerState == 'ONLINE');

    final storageStats = await StorageService.getStorageStats();
    set('storage', storageStats != null);

    final internet = await StaffService.checkInternet();
    set('network', internet);

    final payment = await StaffService.checkPaymentGateway();
    setState(() => _checks['payment']!.state = payment == null ? _CheckState.manual : (payment ? _CheckState.pass : _CheckState.fail));

    final scanner = await const ScannerStatusService().check();
    set('scanner', scanner.availability != ScannerAvailability.unavailable);

    setState(() => _running = false);
  }

  @override
  Widget build(BuildContext context) {
    final entries = _checks.values.toList();
    return StaffScaffold(
      title: 'System Diagnostics',
      onBack: widget.onBack,
      children: [
        const StaffSectionLabel('Checks'),
        const SizedBox(height: 10),
        StaffCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Column(
            children: [
              for (var i = 0; i < entries.length; i++) _CheckRow(entries[i], isLast: i == entries.length - 1),
            ],
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 54,
          child: FilledButton.icon(
            onPressed: _running ? null : _runAll,
            icon: Icon(_running ? null : Icons.play_arrow_rounded),
            style: FilledButton.styleFrom(
              backgroundColor: StaffColors.primary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            label: Text(
              _running ? 'RUNNING…' : 'RUN FULL DIAGNOSTIC',
              style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.4),
            ),
          ),
        ),
      ],
    );
  }
}

class _CheckRow extends StatelessWidget {
  const _CheckRow(this.check, {this.isLast = false});
  final _Check check;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (check.state) {
      _CheckState.pending => (Icons.circle_outlined, StaffColors.textMuted),
      _CheckState.running => (Icons.sync_rounded, StaffColors.primary),
      _CheckState.pass => (Icons.check_circle_rounded, StaffColors.success),
      _CheckState.fail => (Icons.cancel_rounded, StaffColors.danger),
      _CheckState.manual => (Icons.help_rounded, StaffColors.warning),
    };
    final statusText = switch (check.state) {
      _CheckState.pending => 'Not run',
      _CheckState.running => 'Checking…',
      _CheckState.pass => 'Pass',
      _CheckState.fail => 'Fail',
      _CheckState.manual => 'Manual test required',
    };
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 13),
      decoration: isLast
          ? null
          : const BoxDecoration(border: Border(bottom: BorderSide(color: StaffColors.border, width: 1))),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(check.label, style: const TextStyle(fontSize: 14.5, color: StaffColors.textPrimary)),
          ),
          Text(statusText, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
