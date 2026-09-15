import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../kiosk_runtime_service.dart';
import '../../scanner_status.dart';
import '../../staff_service.dart';
import '../../staff_session.dart';
import '../../storage_service.dart';

const _brandBlue = Color(0xFF2563EB);

enum _Status { ok, bad, checking }

/// Staff dashboard (rule 13) — the landing screen after a successful login.
class StaffDashboardPage extends StatefulWidget {
  const StaffDashboardPage({super.key, required this.onNavigate, required this.onReturnToKiosk});
  final ValueChanged<String> onNavigate;
  final VoidCallback onReturnToKiosk;

  @override
  State<StaffDashboardPage> createState() => _StaffDashboardPageState();
}

class _StaffDashboardPageState extends State<StaffDashboardPage> {
  _Status _scanner = _Status.checking;
  _Status _payment = _Status.checking;
  _Status _internet = _Status.checking;
  _Status _storage = _Status.checking;

  @override
  void initState() {
    super.initState();
    _refreshOnDemandChecks();
  }

  Future<void> _refreshOnDemandChecks() async {
    setState(() {
      _scanner = _Status.checking;
      _payment = _Status.checking;
      _internet = _Status.checking;
      _storage = _Status.checking;
    });

    final scanner = await const ScannerStatusService().check();
    if (mounted) {
      setState(() => _scanner = scanner.availability == ScannerAvailability.unavailable ? _Status.bad : _Status.ok);
    }

    final payment = await StaffService.checkPaymentGateway();
    if (mounted) setState(() => _payment = payment == true ? _Status.ok : _Status.bad);

    final internet = await StaffService.checkInternet();
    if (mounted) setState(() => _internet = internet ? _Status.ok : _Status.bad);

    final stats = await StorageService.getStorageStats();
    if (mounted) setState(() => _storage = stats != null ? _Status.ok : _Status.bad);
  }

  @override
  Widget build(BuildContext context) {
    final staff = StaffSession.instance.currentStaff;
    return Material(
      color: const Color(0xFFF8FAFC),
      child: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => StaffSession.instance.noteActivity(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(
                    child: Column(
                      children: [
                        Text(
                          'DOCUCENTER',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, letterSpacing: 1),
                        ),
                        Text(
                          'STAFF MODE',
                          style: TextStyle(color: _brandBlue, fontWeight: FontWeight.w600, letterSpacing: 2),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('Welcome, ${staff?.name ?? ''}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('ROLE: ${(staff?.role ?? '').toUpperCase()}', style: const TextStyle(color: Colors.black54, fontSize: 12)),
                  if (StaffSession.instance.expiringSoon) ...[
                    const SizedBox(height: 12),
                    _ExpiringBanner(onContinue: () => StaffSession.instance.noteActivity()),
                  ],
                  const SizedBox(height: 20),
                  const Text('SYSTEM STATUS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  AnimatedBuilder(
                    animation: KioskRuntime.instance,
                    builder: (context, _) => Column(
                      children: [
                        const _StatusRow('Kiosk Application', _Status.ok),
                        _StatusRow('Printer', KioskRuntime.instance.printerState == 'ONLINE' ? _Status.ok : _Status.bad),
                        _StatusRow('Scanner', _scanner),
                        _StatusRow('Receipt Printer', KioskRuntime.instance.printerState == 'ONLINE' ? _Status.ok : _Status.bad),
                        _StatusRow('Payment Gateway', _payment),
                        _StatusRow('Backend', KioskRuntime.instance.connected ? _Status.ok : _Status.bad),
                        _StatusRow('Internet', _internet),
                        _StatusRow('Storage', _storage),
                      ],
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: _refreshOnDemandChecks,
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Refresh'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _MenuButton('Diagnostics', Icons.fact_check_outlined, () => widget.onNavigate('diagnostics')),
                  _MenuButton('Printer & Scanner', Icons.print_outlined, () => widget.onNavigate('printerScanner')),
                  _MenuButton('Payment Test', Icons.payments_outlined, () => widget.onNavigate('payment')),
                  _MenuButton('Transactions', Icons.receipt_long_outlined, () => widget.onNavigate('transactions')),
                  _MenuButton('Error Logs', Icons.report_outlined, () => widget.onNavigate('errorLogs')),
                  _MenuButton('Storage / Cleanup', Icons.folder_delete_outlined, () => widget.onNavigate('storage')),
                  const SizedBox(height: 20),
                  SizedBox(
                    height: 52,
                    child: OutlinedButton(
                      onPressed: widget.onReturnToKiosk,
                      child: const Text('RETURN TO KIOSK', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                  if (staff?.isAdmin == true) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 44,
                      child: TextButton(
                        onPressed: () => _confirmExit(context),
                        child: const Text('EXIT APPLICATION', style: TextStyle(color: Colors.redAccent)),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _confirmExit(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Exit Application?'),
        content: const Text(
          'This closes DOCUCENTER on this development machine. Windows kiosk lockdown is configured separately.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => SystemNavigator.pop(),
            child: const Text('Exit'),
          ),
        ],
      ),
    );
  }
}

class _ExpiringBanner extends StatelessWidget {
  const _ExpiringBanner({required this.onContinue});
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.amber[50], borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.amber)),
      child: Row(
        children: [
          const Expanded(child: Text('Staff session expiring soon.', style: TextStyle(fontSize: 13))),
          TextButton(onPressed: onContinue, child: const Text('CONTINUE')),
        ],
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow(this.label, this.status);
  final String label;
  final _Status status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      _Status.ok => Colors.green,
      _Status.bad => Colors.red,
      _Status.checking => Colors.grey,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
          Container(width: 12, height: 12, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        ],
      ),
    );
  }
}

class _MenuButton extends StatelessWidget {
  const _MenuButton(this.label, this.icon, this.onTap);
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SizedBox(
        height: 54,
        child: OutlinedButton.icon(
          style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft, foregroundColor: Colors.black87),
          onPressed: onTap,
          icon: Icon(icon, color: _brandBlue),
          label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
