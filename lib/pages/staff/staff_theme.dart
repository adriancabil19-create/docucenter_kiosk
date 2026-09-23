import 'package:flutter/material.dart';

/// Shared design language for every Staff Mode screen — one small set of
/// colors/components so ~12 different screens read as one product instead
/// of a pile of ad-hoc pale containers.
class StaffColors {
  StaffColors._();
  static const primary = Color(0xFF2563EB);
  static const primaryDark = Color(0xFF1D4ED8);
  static const primarySoft = Color(0xFFEFF4FF);
  static const background = Color(0xFFF1F5F9);
  static const surface = Colors.white;
  static const success = Color(0xFF10B981);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const textPrimary = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF64748B);
  static const textMuted = Color(0xFF94A3B8);
  static const border = Color(0xFFE2E8F0);
}

/// A soft-elevated card — replaces the flat white + `Colors.black12` border
/// containers used across every staff screen before this pass.
class StaffCard extends StatelessWidget {
  const StaffCard({super.key, required this.child, this.padding, this.color, this.onTap});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final Color? color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding ?? const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color ?? StaffColors.surface,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.045), blurRadius: 18, offset: const Offset(0, 6)),
        ],
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(borderRadius: BorderRadius.circular(18), onTap: onTap, child: card),
    );
  }
}

/// A colored rounded-square icon badge — the same header language used in
/// the redesigned How-It-Works tutorial cards, for visual consistency
/// across the whole app rather than just within Staff Mode.
class StaffIconBadge extends StatelessWidget {
  const StaffIconBadge({super.key, required this.icon, required this.color, this.size = 44});

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(icon, color: color, size: size * 0.52),
    );
  }
}

/// Small bold uppercase label used above a group of content.
class StaffSectionLabel extends StatelessWidget {
  const StaffSectionLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.0,
        color: StaffColors.textSecondary,
      ),
    );
  }
}

/// A colored status dot + label pill — replaces plain colored circles used
/// for ONLINE/OFFLINE-style indicators throughout Staff Mode.
class StaffStatusPill extends StatelessWidget {
  const StaffStatusPill({super.key, required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 5),
          ] else ...[
            Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 6),
          ],
          Text(label, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// A soft-tinted banner for warnings/info notices — replaces the repeated
/// `Colors.amber[50]` ad-hoc boxes.
class StaffBanner extends StatelessWidget {
  const StaffBanner({super.key, required this.text, this.color = StaffColors.warning, this.icon = Icons.info_outline});

  final String text;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 12.5, height: 1.4, color: color.withValues(alpha: 0.95))),
          ),
        ],
      ),
    );
  }
}
