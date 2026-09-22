import 'package:flutter/material.dart';

import '../strings.dart';
import '../widgets/service_tutorial.dart';
import '../widgets/service_tutorial_panel.dart';

/// Interactive "How It Works" tab — lets a new user tap through each
/// service's steps at their own pace (unlike the idle screen's autoplay
/// showcase, which just advertises the same three panels passively).
class HowItWorksPage extends StatelessWidget {
  const HowItWorksPage({super.key, required this.onNavigate});

  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFF8FAFC),
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1250),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  Strings.t('tutorial.heading'),
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1E293B),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  Strings.t('tutorial.subheading'),
                  style: const TextStyle(fontSize: 15, color: Color(0xFF64748B)),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final isNarrow = constraints.maxWidth < 900;
                    final panels = kServiceTutorials
                        .map(
                          (t) => ServiceTutorialPanel(
                            key: ValueKey('tutorial-${t.id}'),
                            tutorial: t,
                            interactive: true,
                            onTryService: () => onNavigate('services'),
                          ),
                        )
                        .toList();
                    if (isNarrow) {
                      return Column(
                        children: [
                          for (final p in panels) ...[
                            p,
                            const SizedBox(height: 16),
                          ],
                        ],
                      );
                    }
                    return IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (var i = 0; i < panels.length; i++) ...[
                            if (i > 0) const SizedBox(width: 16),
                            Expanded(child: panels[i]),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
