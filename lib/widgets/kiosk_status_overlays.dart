import 'package:flutter/material.dart';
import '../config.dart';
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

/// Full-screen blocking maintenance screen — red, iconic, and deliberately
/// plain so it reads as an official "out of service" notice.
class _MaintenanceOverlay extends StatefulWidget {
  const _MaintenanceOverlay();

  @override
  State<_MaintenanceOverlay> createState() => _MaintenanceOverlayState();
}

class _MaintenanceOverlayState extends State<_MaintenanceOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Material(
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF7F1D1D), // red-900
                Color(0xFFB91C1C), // red-700
                Color(0xFF991B1B), // red-800
              ],
            ),
          ),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Icon badge
                    Container(
                      width: 132,
                      height: 132,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 2),
                      ),
                      child: const Icon(Icons.engineering_rounded, color: Colors.white, size: 68),
                    ),
                    const SizedBox(height: 32),
                    const Text(
                      'MAINTENANCE MODE',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 3,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'This kiosk is temporarily out of service while staff perform '
                      'maintenance. We apologise for the inconvenience.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Color(0xFFFEE2E2), // red-100
                        fontSize: 16,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 28),
                    // Live status pill
                    FadeTransition(
                      opacity: Tween<double>(begin: 0.35, end: 1).animate(_pulse),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.circle, color: Colors.white, size: 10),
                            SizedBox(width: 10),
                            Text(
                              'Service will resume shortly',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 40),
                    Divider(color: Colors.white.withValues(alpha: 0.2), height: 1),
                    const SizedBox(height: 20),
                    Text(
                      'DOCUCENTER  ·  ${BackendConfig.kioskId}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'For assistance, please contact a staff member.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
