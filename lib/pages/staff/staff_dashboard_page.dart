import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../assistance_service.dart';
import '../../kiosk_runtime_service.dart';
import '../../scanner_status.dart';
import '../../staff_service.dart';
import '../../staff_session.dart';
import '../../storage_service.dart';
import 'staff_theme.dart';

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
    // Already polling app-wide (started by the customer-facing Ask-for-
    // Assistance button in main.dart) — the dashboard just listens in,
    // rather than starting a second poll of the same endpoint.
    AssistanceState.instance.start();
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
      color: StaffColors.background,
      child: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => StaffSession.instance.noteActivity(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _HeroHeader(name: staff?.name ?? '', role: (staff?.role ?? '').toUpperCase()),
                  if (StaffSession.instance.expiringSoon) ...[
                    const SizedBox(height: 14),
                    _ExpiringBanner(onContinue: () => StaffSession.instance.noteActivity()),
                  ],
                  AnimatedBuilder(
                    animation: AssistanceState.instance,
                    builder: (context, _) {
                      if (!AssistanceState.instance.isActive) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: _AssistanceBanner(
                          acknowledged: AssistanceState.instance.status == AssistanceStatus.acknowledged,
                          onTap: () => widget.onNavigate('assistance'),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      const StaffSectionLabel('System Status'),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: _refreshOnDemandChecks,
                        icon: const Icon(Icons.refresh_rounded, size: 16),
                        label: const Text('Refresh'),
                        style: TextButton.styleFrom(foregroundColor: StaffColors.primary, padding: EdgeInsets.zero),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  StaffCard(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    child: AnimatedBuilder(
                      animation: KioskRuntime.instance,
                      builder: (context, _) => Column(
                        children: [
                          const _StatusRow('Kiosk Application', _Status.ok, Icons.dashboard_outlined),
                          _StatusRow(
                            'Printer',
                            KioskRuntime.instance.printerState == 'ONLINE' ? _Status.ok : _Status.bad,
                            Icons.print_outlined,
                          ),
                          _StatusRow('Scanner', _scanner, Icons.document_scanner_outlined),
                          _StatusRow('Payment Gateway', _payment, Icons.payments_outlined),
                          _StatusRow(
                            'Backend',
                            KioskRuntime.instance.connected ? _Status.ok : _Status.bad,
                            Icons.dns_outlined,
                          ),
                          _StatusRow('Internet', _internet, Icons.wifi_rounded),
                          _StatusRow('Storage', _storage, Icons.folder_outlined, isLast: true),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  const StaffSectionLabel('Tools'),
                  const SizedBox(height: 10),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.05,
                    children: [
                      _MenuTile('Assistance', Icons.support_agent_outlined, StaffColors.primary,
                          () => widget.onNavigate('assistance')),
                      _MenuTile('Print Recovery', Icons.restart_alt_outlined, StaffColors.warning,
                          () => widget.onNavigate('printRecovery')),
                      _MenuTile('Diagnostics', Icons.fact_check_outlined, StaffColors.success,
                          () => widget.onNavigate('diagnostics')),
                      _MenuTile('Printer & Scanner', Icons.print_outlined, StaffColors.primary,
                          () => widget.onNavigate('printerScanner')),
                      _MenuTile('Transactions', Icons.receipt_long_outlined, const Color(0xFF7C3AED),
                          () => widget.onNavigate('transactions')),
                      _MenuTile('Error Logs', Icons.report_outlined, StaffColors.danger,
                          () => widget.onNavigate('errorLogs')),
                      _MenuTile('Storage / Cleanup', Icons.folder_delete_outlined, const Color(0xFF0891B2),
                          () => widget.onNavigate('storage')),
                    ],
                  ),
                  const SizedBox(height: 26),
                  SizedBox(
                    height: 52,
                    child: OutlinedButton.icon(
                      onPressed: widget.onReturnToKiosk,
                      icon: const Icon(Icons.logout_rounded, size: 18),
                      label: const Text('RETURN TO KIOSK', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.4)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: StaffColors.textPrimary,
                        side: const BorderSide(color: StaffColors.border, width: 1.4),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
                  if (staff?.isAdmin == true) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 44,
                      child: TextButton(
                        onPressed: () => _confirmExit(context),
                        style: TextButton.styleFrom(foregroundColor: StaffColors.danger),
                        child: const Text('EXIT APPLICATION', style: TextStyle(fontWeight: FontWeight.w600)),
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Exit Application?'),
        content: const Text(
          'This closes DOCUCENTER on this development machine. Windows kiosk lockdown is configured separately.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: StaffColors.danger),
            onPressed: () => SystemNavigator.pop(),
            child: const Text('Exit'),
          ),
        ],
      ),
    );
  }
}

/// Blue gradient hero — brand identity + who's signed in, replacing the
/// plain centered text block.
class _HeroHeader extends StatelessWidget {
  const _HeroHeader({required this.name, required this.role});
  final String name;
  final String role;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [StaffColors.primary, StaffColors.primaryDark],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(color: StaffColors.primary.withValues(alpha: 0.28), blurRadius: 20, offset: const Offset(0, 8)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.badge_outlined, color: Colors.white, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'STAFF MODE',
                  style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700, fontSize: 11, letterSpacing: 1.6),
                ),
                const SizedBox(height: 2),
                Text(
                  name.isEmpty ? 'Welcome' : 'Welcome, $name',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 19),
                  overflow: TextOverflow.ellipsis,
                ),
                if (role.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      role,
                      style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.6),
                    ),
                  ),
                ],
              ],
            ),
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
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: StaffColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: StaffColors.warning.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.timer_outlined, size: 18, color: StaffColors.warning),
          const SizedBox(width: 10),
          const Expanded(child: Text('Staff session expiring soon.', style: TextStyle(fontSize: 13))),
          TextButton(
            onPressed: onContinue,
            style: TextButton.styleFrom(foregroundColor: StaffColors.warning),
            child: const Text('CONTINUE', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

/// Eye-catching call-to-action when a customer at this kiosk needs help —
/// the whole point of surfacing it here is so staff don't have to go looking
/// for it.
class _AssistanceBanner extends StatelessWidget {
  const _AssistanceBanner({required this.acknowledged, required this.onTap});
  final bool acknowledged;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = acknowledged ? StaffColors.primaryDark : const Color(0xFFB45309);
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Icon(acknowledged ? Icons.support_agent_rounded : Icons.notifications_active_rounded, color: Colors.white),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  acknowledged ? 'You are assisting a customer' : 'A customer at this kiosk needs assistance',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow(this.label, this.status, this.icon, {this.isLast = false});
  final String label;
  final _Status status;
  final IconData icon;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final (color, statusLabel) = switch (status) {
      _Status.ok => (StaffColors.success, 'Online'),
      _Status.bad => (StaffColors.danger, 'Offline'),
      _Status.checking => (StaffColors.textMuted, 'Checking'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: isLast
          ? null
          : const BoxDecoration(border: Border(bottom: BorderSide(color: StaffColors.border, width: 1))),
      child: Row(
        children: [
          Icon(icon, size: 18, color: StaffColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14, color: StaffColors.textPrimary))),
          StaffStatusPill(label: statusLabel, color: color),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile(this.label, this.icon, this.color, this.onTap);
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return StaffCard(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          StaffIconBadge(icon: icon, color: color, size: 38),
          const SizedBox(height: 8),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11.5, color: StaffColors.textPrimary),
          ),
        ],
      ),
    );
  }
}
