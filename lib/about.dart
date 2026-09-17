import 'package:flutter/material.dart';

class AboutPage extends StatelessWidget {
  final ValueChanged<String> onNavigate;

  const AboutPage({super.key, required this.onNavigate});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — matches the other service pages
          Row(
            children: [
              Icon(Icons.info_outline, size: 32, color: colorScheme.primary),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'About',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: colorScheme.primary,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    Text(
                      'The project, the team, and how to reach us',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Two columns — left is narrative (overview, operator/contact),
          // right is structured facts (university, team) — so neither side
          // ends up as a mostly-empty card next to a crowded one.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  children: [
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
                    const SizedBox(height: 16),
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
                          onPressed: () => onNavigate('legal'),
                          icon: const Icon(Icons.description_outlined, size: 18),
                          label: const Text('View Legal & Privacy'),
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
                    _buildInfoGridSection(context, 'University', [
                      ('Institution', 'University of Cebu'),
                      ('Campus', 'Lapu-Lapu and Mandaue'),
                      ('Program', 'BS in Computer Engineering'),
                      ('Academic Year', '2025–2026'),
                    ]),
                    const SizedBox(height: 16),
                    _buildTeamSection(context),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          _buildTimelineSection(context),
          const SizedBox(height: 16),

          _buildSection(
            context,
            'Acknowledgments',
            Icons.volunteer_activism_outlined,
            'Thanks to our thesis adviser for guidance throughout this project; the University '
            'of Cebu – Lapu-Lapu and Mandaue Campus for resources and facilities; the College '
            'of Computer Engineering faculty for feedback during development; and everyone who '
            'took part in testing and evaluation.',
          ),

          const SizedBox(height: 24),
        ],
      ),
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
            Row(
              children: [
                Icon(icon, size: 22, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 10),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
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
            Row(
              children: [
                Icon(Icons.apartment_outlined, size: 22, color: colorScheme.primary),
                const SizedBox(width: 10),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
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
    final colorScheme = Theme.of(context).colorScheme;
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
            Row(
              children: [
                Icon(Icons.groups_outlined, size: 22, color: colorScheme.primary),
                const SizedBox(width: 10),
                Text(
                  'Research Team',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
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
      ('Oct 2025', 'Conceptualization', 'Problem identification and proposal development'),
      ('Nov 2025', 'Literature Review', 'Review of theoretical frameworks and related studies'),
      ('Dec 2025', 'Data Collection', 'Surveys, user testing, and feedback gathering'),
      ('Jan – Feb 2026', 'Development', 'Architecture design and prototype build'),
      ('Mar 2026', 'Testing & Refinement', 'Iterative testing, debugging, and performance work'),
      ('Apr 2026', 'Thesis Writing', 'Documentation of methodology and findings'),
      ('May 2026', 'Defense', 'Thesis submission and defense'),
      ('Jun 2026 – Present', 'Pilot', 'Ongoing pilot deployment and refinement'),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.timeline_outlined, size: 22, color: colorScheme.primary),
                const SizedBox(width: 10),
                Text(
                  'Timeline',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 4.2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 24,
              children: timelineItems.map((item) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 110,
                      child: Text(
                        item.$1,
                        style: TextStyle(
                          fontSize: 12,
                          color: colorScheme.onSurfaceVariant,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.$2,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                          Text(
                            item.$3,
                            style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
