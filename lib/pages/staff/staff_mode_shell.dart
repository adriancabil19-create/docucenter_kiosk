import 'package:flutter/material.dart';
import '../../staff_session.dart';
import 'staff_assistance_page.dart';
import 'staff_dashboard_page.dart';
import 'staff_diagnostics_page.dart';
import 'staff_error_logs_page.dart';
import 'staff_login_page.dart';
import 'staff_payment_test_page.dart';
import 'staff_pin_recovery_page.dart';
import 'staff_printer_scanner_page.dart';
import 'staff_storage_cleanup_page.dart';
import 'staff_transactions_page.dart';

/// Owns Staff Mode's internal navigation, matching this app's existing
/// string-keyed page-switching convention (see `_MainAppState`/`ServicesPage`
/// in main.dart) rather than introducing Navigator routes.
class StaffModeShell extends StatefulWidget {
  const StaffModeShell({super.key, required this.onExit});

  /// Called when Staff Mode should close entirely — login cancelled, session
  /// timed out, or "Return to Kiosk" pressed. The host (main.dart) is
  /// responsible for resetting the customer-facing UI.
  final VoidCallback onExit;

  @override
  State<StaffModeShell> createState() => _StaffModeShellState();
}

class _StaffModeShellState extends State<StaffModeShell> {
  String _page = 'login';

  @override
  void initState() {
    super.initState();
    StaffSession.instance.onTimedOut = () {
      if (mounted) widget.onExit();
    };
  }

  @override
  void dispose() {
    StaffSession.instance.onTimedOut = null;
    super.dispose();
  }

  void _go(String page) => setState(() => _page = page);

  void _returnToKiosk() {
    StaffSession.instance.signOut();
    widget.onExit();
  }

  @override
  Widget build(BuildContext context) {
    switch (_page) {
      case 'recovery':
        return StaffPinRecoveryPage(onDone: () => _go('login'));
      case 'dashboard':
        return StaffDashboardPage(onNavigate: _go, onReturnToKiosk: _returnToKiosk);
      case 'assistance':
        return StaffAssistancePage(onBack: () => _go('dashboard'));
      case 'diagnostics':
        return StaffDiagnosticsPage(onBack: () => _go('dashboard'));
      case 'printerScanner':
        return StaffPrinterScannerPage(onBack: () => _go('dashboard'));
      case 'payment':
        return StaffPaymentTestPage(onBack: () => _go('dashboard'));
      case 'transactions':
        return StaffTransactionsPage(onBack: () => _go('dashboard'));
      case 'errorLogs':
        return StaffErrorLogsPage(onBack: () => _go('dashboard'));
      case 'storage':
        return StaffStorageCleanupPage(onBack: () => _go('dashboard'));
      case 'login':
      default:
        return StaffLoginPage(
          onLoggedIn: () => _go('dashboard'),
          onForgotPin: () => _go('recovery'),
          onCancel: widget.onExit,
        );
    }
  }
}
