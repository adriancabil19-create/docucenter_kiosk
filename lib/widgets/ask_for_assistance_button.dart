import 'package:flutter/material.dart';
import '../assistance_service.dart';

/// Customer-facing "Ask for Assistance" control (rule 12). Meant to be placed
/// as a `Positioned` child in the app's outer `Stack` (see main.dart), so it
/// floats above whichever service screen is showing without disrupting that
/// screen's own layout.
///
/// Renders one of: the Ask button (no active request), a "waiting" pill with
/// a Cancel action (PENDING), an "in progress" pill (ACKNOWLEDGED), or a
/// brief concluded pill (RESOLVED/CANCELLED/EXPIRED) that clears itself once
/// the backend's grace window passes.
class AskForAssistanceButton extends StatefulWidget {
  const AskForAssistanceButton({super.key});

  @override
  State<AskForAssistanceButton> createState() => _AskForAssistanceButtonState();
}

class _AskForAssistanceButtonState extends State<AskForAssistanceButton> {
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    AssistanceState.instance.start();
  }

  void _showMessage(String text, {Color color = const Color(0xFF334155)}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), backgroundColor: color, behavior: SnackBarBehavior.floating),
    );
  }

  Future<void> _confirmAndRequest() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request Assistance'),
        content: const Text('Would you like to request assistance from staff?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Request Assistance'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _submitting = true);
    final result = await AssistanceState.instance.requestAssistance();
    if (!mounted) return;
    setState(() => _submitting = false);

    switch (result.outcome) {
      case CreateOutcome.success:
        _showMessage('Your request has been recorded. Staff will be notified shortly.',
            color: const Color(0xFF15803D));
        break;
      case CreateOutcome.activeExists:
        _showMessage('An assistance request is already active.');
        break;
      case CreateOutcome.cooldown:
        _showMessage('Please wait a moment before requesting again.');
        break;
      case CreateOutcome.rateLimited:
        _showMessage('Too many requests. Please wait a few minutes or ask staff directly.');
        break;
      case CreateOutcome.networkError:
        _showMessage('Unable to contact staff right now. Please try again or ask staff directly.',
            color: const Color(0xFFB91C1C));
        break;
    }
  }

  Future<void> _confirmAndCancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Request'),
        content: const Text('Cancel your assistance request?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep Waiting')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB91C1C)),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Cancel Request'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final ok = await AssistanceState.instance.cancel();
    if (ok) _showMessage('Your request has been cancelled.');
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AssistanceState.instance,
      builder: (context, _) {
        final status = AssistanceState.instance.status;
        switch (status) {
          case AssistanceStatus.pending:
            return _StatusPill(
              icon: Icons.hourglass_top_rounded,
              color: const Color(0xFFB45309),
              label: 'Waiting for staff assistance…',
              semanticsLabel: 'Assistance requested. Waiting for a staff member.',
              trailing: TextButton(
                onPressed: _confirmAndCancel,
                style: TextButton.styleFrom(foregroundColor: Colors.white, minimumSize: const Size(0, 44)),
                child: const Text('Cancel'),
              ),
            );
          case AssistanceStatus.acknowledged:
            return const _StatusPill(
              icon: Icons.support_agent_rounded,
              color: Color(0xFF1D4ED8),
              label: 'Staff member is assisting you.',
              semanticsLabel: 'A staff member is now assisting you.',
            );
          case AssistanceStatus.resolved:
            return const _StatusPill(
              icon: Icons.check_circle_rounded,
              color: Color(0xFF15803D),
              label: 'Assistance completed.',
              semanticsLabel: 'Your assistance request is complete.',
            );
          case AssistanceStatus.cancelled:
            return const _StatusPill(
              icon: Icons.cancel_rounded,
              color: Color(0xFF475569),
              label: 'Request cancelled.',
              semanticsLabel: 'Your assistance request was cancelled.',
            );
          case AssistanceStatus.expired:
            return const _StatusPill(
              icon: Icons.timer_off_rounded,
              color: Color(0xFF475569),
              label: 'Request timed out.',
              semanticsLabel: 'Your assistance request timed out.',
            );
          case null:
            return Semantics(
              button: true,
              label: 'Ask staff for assistance',
              child: Material(
                color: const Color(0xFFB91C1C),
                elevation: 6,
                borderRadius: BorderRadius.circular(999),
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: _submitting ? null : _confirmAndRequest,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_submitting)
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                          )
                        else
                          const Icon(Icons.help_rounded, color: Colors.white, size: 22),
                        const SizedBox(width: 10),
                        const Text(
                          'ASK FOR ASSISTANCE',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
        }
      },
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.icon,
    required this.color,
    required this.label,
    required this.semanticsLabel,
    this.trailing,
  });

  final IconData icon;
  final Color color;
  final String label;
  final String semanticsLabel;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: semanticsLabel,
      child: Material(
        color: color,
        elevation: 6,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: Colors.white, size: 22),
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
              ),
              if (trailing != null) ...[const SizedBox(width: 4), trailing!],
            ],
          ),
        ),
      ),
    );
  }
}
