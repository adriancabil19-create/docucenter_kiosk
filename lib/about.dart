import 'package:flutter/material.dart';
import 'widgets/docucenter_logo.dart';

class AboutPage extends StatefulWidget {
  final ValueChanged<String> onNavigate;

  const AboutPage({super.key, required this.onNavigate});

  @override
  State<AboutPage> createState() => _AboutPageState();
}

class _AboutPageState extends State<AboutPage> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Staggered entrance: each section fades and slides up a little after the
  /// previous one, driven off one shared controller (not a per-widget timer).
  Widget _reveal(int index, Widget child) {
    final start = (index * 0.08).clamp(0.0, 0.7);
    final anim = CurvedAnimation(
      parent: _controller,
      curve: Interval(start, (start + 0.35).clamp(0.0, 1.0), curve: Curves.easeOut),
    );
    return AnimatedBuilder(
      animation: anim,
      builder: (context, c) => Opacity(
        opacity: anim.value,
        child: Transform.translate(offset: Offset(0, (1 - anim.value) * 18), child: c),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _reveal(0, _buildHero(context)),
          const SizedBox(height: 20),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  children: [
                    _reveal(
                      1,
                      _buildSection(
                        context,
                        'Project Overview',
                        Icons.description_outlined,
                        'DocuCenter Kiosk is an undergraduate thesis project for the Bachelor of '
                        'Science in Computer Engineering program at the University of Cebu – '
                        'Lapu-Lapu and Mandaue Campus. It combines a self-service kiosk, staff '
                        'device monitoring, and online payment to streamline routine document '
                        'tasks — printing, photocopying, and scanning — for students, faculty, '
                        'and staff.\n\n'
                        'It is currently a working prototype under pilot evaluation and is not '
                        'a commercial service.',
                      ),
                    ),
                    const SizedBox(height: 16),
                    _reveal(
                      2,
                      _buildSection(
                        context,
                        'Operator & Contact',
                        Icons.storefront_outlined,
                        'Developed and operated by Charles Adrian L. Cabil, College of Computer '
                        'Engineering, University of Cebu – Lapu-Lapu and Mandaue Campus.\n\n'
                        'adriancabil12@gmail.com',
                        trailing: Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () => widget.onNavigate('legal'),
                            icon: const Icon(Icons.description_outlined, size: 18),
                            label: const Text('View Legal & Privacy'),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  children: [
                    _reveal(
                      1,
                      _buildInfoGridSection(context, 'University', [
                        ('Institution', 'University of Cebu'),
                        ('Campus', 'Lapu-Lapu and Mandaue'),
                        ('Program', 'BS in Computer Engineering'),
                        ('Academic Year', '2025–2026'),
                      ]),
                    ),
                    const SizedBox(height: 16),
                    _reveal(2, _buildTeamSection(context)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          _reveal(3, _buildTimelineSection(context)),
          const SizedBox(height: 16),

          _reveal(
            4,
            _buildSection(
              context,
              'Acknowledgments',
              Icons.volunteer_activism_outlined,
              'Thanks to our thesis adviser for guidance throughout this project; the University '
              'of Cebu – Lapu-Lapu and Mandaue Campus for resources and facilities; the College '
              'of Computer Engineering faculty for feedback during development; and everyone who '
              'took part in testing and evaluation.',
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildHero(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colorScheme.primaryContainer.withValues(alpha: 0.55),
            colorScheme.surface,
          ],
        ),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(color: colorScheme.outlineVariant),
              boxShadow: [
                BoxShadow(
                  color: colorScheme.shadow.withValues(alpha: 0.08),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Center(child: DocucenterLogoMark(size: 44)),
          ),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'About DocuCenter',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  'A self-service document kiosk built for the University of Cebu community — '
                  'the project, the people behind it, and how to reach us.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                        height: 1.5,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(BuildContext context, String title, IconData icon) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: colorScheme.primaryContainer,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 18, color: colorScheme.onPrimaryContainer),
        ),
        const SizedBox(width: 12),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _buildSection(
    BuildContext context,
    String title,
    IconData icon,
    String content, {
    Widget? trailing,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, title, icon),
            const SizedBox(height: 16),
            Text(
              content,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurface,
                    height: 1.6,
                  ),
            ),
            if (trailing != null) ...[
              const SizedBox(height: 12),
              trailing,
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInfoGridSection(
    BuildContext context,
    String title,
    List<(String, String)> fields,
  ) {
    final colorScheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, title, Icons.apartment_outlined),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.6,
              mainAxisSpacing: 8,
              crossAxisSpacing: 16,
              children: fields.map((f) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(f.$1, style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 2),
                    Text(f.$2, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  ],
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamSection(BuildContext context) {
    final team = [
      ('Charles Adrian Cabil', 'Lead Researcher & Developer'),
      ('Mark Lee Duyag', 'Co-Researcher'),
      ('Ignacio Maurice Vergara', 'Co-Researcher'),
      ('Engr. Darwin Espera', 'Thesis Adviser'),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, 'Research Team', Icons.groups_outlined),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.4,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              children: team.map((m) => _buildTeamMember(context, m.$1, m.$2)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamMember(BuildContext context, String name, String role) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.person_outline, size: 20, color: colorScheme.primary),
          const SizedBox(height: 6),
          Text(
            name,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            role,
            style: TextStyle(fontSize: 10, color: colorScheme.onSurfaceVariant),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineSection(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final timelineItems = [
      ('Oct 2025', 'Conceptualization', 'Problem identification and proposal development', Icons.lightbulb_outline),
      ('Nov 2025', 'Literature Review', 'Review of theoretical frameworks and related studies', Icons.menu_book_outlined),
      ('Dec 2025', 'Data Collection', 'Surveys, user testing, and feedback gathering', Icons.fact_check_outlined),
      ('Jan – Feb 2026', 'Development', 'Architecture design and prototype build', Icons.code),
      ('Mar 2026', 'Testing & Refinement', 'Iterative testing, debugging, and performance work', Icons.bug_report_outlined),
      ('Apr 2026', 'Thesis Writing', 'Documentation of methodology and findings', Icons.edit_note),
      ('May 2026', 'Defense', 'Thesis submission and defense', Icons.school_outlined),
      ('Jun 2026 – Present', 'Pilot', 'Ongoing pilot deployment and refinement', Icons.rocket_launch_outlined),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, 'Timeline', Icons.timeline_outlined),
            const SizedBox(height: 20),
            ...timelineItems.asMap().entries.map((entry) {
              final isLast = entry.key == timelineItems.length - 1;
              final (date, title, desc, icon) = entry.value;
              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Dot + connecting line
                    Column(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: colorScheme.primaryContainer,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(icon, size: 16, color: colorScheme.onPrimaryContainer),
                        ),
                        if (!isLast)
                          Expanded(
                            child: Container(
                              width: 2,
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              color: colorScheme.outlineVariant,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(bottom: isLast ? 0 : 20, top: 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              date,
                              style: TextStyle(
                                fontSize: 11,
                                color: colorScheme.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              title,
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            ),
                            Text(
                              desc,
                              style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
