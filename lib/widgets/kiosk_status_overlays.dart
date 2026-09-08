import 'package:flutter/material.dart';
import '../kiosk_runtime_service.dart';

/// Wraps the whole app UI and layers connectivity / maintenance state on top:
///
///  * a non-blocking amber banner when the local backend is unreachable,
///  * a non-blocking banner when the admin has disabled printing,
///  * a full-screen blocking panel when the kiosk is in maintenance mode.
///
/// Rebuilds only when [KioskRuntime] notifies, so the rest of the tree is
/// untouched in the common (healthy) case.
class KioskShell extends StatelessWidget {
  const KioskShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: KioskRuntime.instance,
      builder: (context, _) {
        final rt = KioskRuntime.instance;
        return Stack(
          children: [
            Positioned.fill(child: child),

            // Status banners stack under the top edge, newest concern first.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                bottom: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (rt.showOffline)
                      _Banner(
                        color: const Color(0xFFB45309),
                        icon: Icons.wifi_off,
                        text: 'Connection lost — some services are temporarily unavailable. '
                            'Retrying automatically…',
                        onAction: rt.refresh,
                        actionLabel: 'Retry now',
                      ),
                    if (rt.printingDisabled && !rt.maintenance)
                      const _Banner(
                        color: Color(0xFF9A3412),
                        icon: Icons.print_disabled,
                        text: 'Printing is temporarily disabled by the operator.',
                      ),
                  ],
                ),
              ),
            ),

            if (rt.maintenance) const _MaintenanceOverlay(),
          ],
        );
      },
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.color,
    required this.icon,
    required this.text,
    this.onAction,
    this.actionLabel,
  });

  final Color color;
  final IconData icon;
  final String text;
  final VoidCallback? onAction;
  final String? actionLabel;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
            if (onAction != null && actionLabel != null) ...[
              const SizedBox(width: 12),
              TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white54),
                  minimumSize: const Size(0, 36),
                ),
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MaintenanceOverlay extends StatelessWidget {
  const _MaintenanceOverlay();

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        color: const Color(0xFF0F172A),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.build_circle_outlined, color: Colors.white, size: 72),
                  const SizedBox(height: 24),
                  Text(
                    'DOCUCENTER is temporarily unavailable',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'The kiosk is in maintenance mode. Please try again shortly or ask '
                    'a staff member for assistance.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 15, height: 1.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
