import 'package:flutter/material.dart';
import '../../staff_session.dart';
import 'staff_theme.dart';

/// Kept as an alias so existing references to the old name still resolve —
/// prefer [StaffColors.primary] in new code.
const staffBrandBlue = StaffColors.primary;

/// Shared shell for every Staff Mode sub-screen: a raised header bar with a
/// back button and title, and scrollable content below — plus resetting the
/// inactivity timer on any tap.
class StaffScaffold extends StatelessWidget {
  const StaffScaffold({
    super.key,
    required this.title,
    required this.onBack,
    required this.children,
    this.actions,
    this.maxWidth = 560,
  });

  final String title;
  final VoidCallback onBack;
  final List<Widget> children;
  final List<Widget>? actions;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: StaffColors.background,
      child: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => StaffSession.instance.noteActivity(),
          child: Column(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: StaffColors.surface,
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 2)),
                  ],
                ),
                padding: const EdgeInsets.fromLTRB(6, 8, 16, 14),
                child: SafeArea(
                  bottom: false,
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: onBack,
                        icon: const Icon(Icons.arrow_back_rounded),
                        style: IconButton.styleFrom(
                          backgroundColor: StaffColors.background,
                          foregroundColor: StaffColors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: StaffColors.textPrimary,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ),
                      ...?actions,
                    ],
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxWidth),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
