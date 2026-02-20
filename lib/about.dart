import 'package:flutter/material.dart';

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
            child: Column(
              children: [
                Text(
                  'About the Project',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: const Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Learn more about the team behind the DOCUCENTER Kiosk and our academic institution',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: const Color(0xFF4B5563),
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          // Project Overview
          _buildSection(
            context,
            'Project Overview',
            Icons.info_outline,
            '''The DOCUCENTER Kiosk project represents a comprehensive thesis work undertaken as partial fulfillment of the requirements for the degree of Bachelor of Science in Information Technology at the University of Cebu - Lapu-Lapu and Mandaue Campus.

This innovative project addresses the growing need for efficient, accessible, and automated document processing services within the university environment. By integrating self-service technology, real-time IoT monitoring, and automated payment systems, the DOCUCENTER Kiosk aims to revolutionize how students, faculty, and staff access essential document services.

The project combines theoretical foundations from multiple disciplines including Human-Computer Interaction, Self-Service Technology Theory, Technology Acceptance Model, and IoT systems to create a holistic solution that is both user-friendly and operationally efficient.''',
          ),

          // University Information
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF003D99), Color(0xFF1E40AF)],
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.apartment, size: 24, color: Colors.white),
                      const SizedBox(width: 12),
                      Text(
                        'University Information',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Institution', style: TextStyle(fontSize: 10, color: Color(0xFFDBE9F8))),
                            Text('University of Cebu', style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Campus', style: TextStyle(fontSize: 10, color: Color(0xFFDBE9F8))),
                            Text('Lapu-Lapu and Mandaue', style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Program', style: TextStyle(fontSize: 10, color: Color(0xFFDBE9F8))),
                            Text('BS in Computer Engineering', style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Academic Year', style: TextStyle(fontSize: 10, color: Color(0xFFDBE9F8))),
                            Text('2024-2025', style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // Research Team
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              children: [
                Text(
                  'Research Team',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: const Color(0xFF003D99),
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                GridView.count(
                  crossAxisCount: MediaQuery.of(context).size.width < 768
                      ? 1
                      : MediaQuery.of(context).size.width < 1024
                          ? 2
                          : 3,
                  childAspectRatio: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  children: [
                    _buildTeamMember('Charles Adrian Cabil', 'Lead Researcher & Developer'),
                    _buildTeamMember('Mark Lee Duyag', 'Banker'),
                    _buildTeamMember('Ignacio Maurice Vergara', 'Banker'),
                  ],
                ),
              ],
            ),
          ),

          // Thesis Adviser
          _buildSection(
            context,
            'Thesis Adviser',
            Icons.school,
            'Engr. Darwin Espera\nThesis Adviser\nCollege of Engineering\n\nThe research team would like to express sincere gratitude to our thesis adviser for invaluable guidance, support, and expertise throughout the development of this project.',
            showIcon: true,
          ),

          // Project Timeline
          _buildTimelineSection(context),

          // Acknowledgments
          _buildAcknowledgmentsSection(context),

          // Contact Information
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [Color(0xFF2563EB), Color(0xFF003D99)],
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    'Get in Touch',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'For inquiries about this research project or collaboration opportunities, please contact:',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color(0xFFDBE9F8)),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'College of Engineering Major in Computer\nUniversity of Cebu - Lapu-Lapu and Mandaue Campus\n\nEmail: adriancabil12@gmail.com',
                    style: TextStyle(color: Colors.white, fontSize: 14),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSection(
    BuildContext context,
    String title,
    IconData icon,
    String content, {
    bool showIcon = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, size: 28, color: const Color(0xFF2563EB)),
                  const SizedBox(width: 12),
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: const Color(0xFF003D99),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (showIcon)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: const BoxDecoration(
                        color: Color(0xFFDEE6F8),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.person, color: Color(0xFF2563EB), size: 32),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        content,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Color(0xFF374151),
                          height: 1.6,
                        ),
                      ),
                    ),
                  ],
                )
              else
                Text(
                  content,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Color(0xFF374151),
                    height: 1.6,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTeamMember(String name, String role) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Color(0xFFDEE6F8),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.person, size: 24, color: Color(0xFF2563EB)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    name,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    role,
                    style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineSection(BuildContext context) {
    final timelineItems = [
      ('Oct 2025', 'Project Conceptualization', 'Initial research, problem identification, and proposal development'),
      ('Nov 2025', 'Thesis Paper Pre-Development', 'Comprehensive review of theoretical frameworks and related studies'),
      ('Dec 2025', 'Data Collection', 'Survey administration, user testing, and feedback gathering'),
      ('Jan - Feb 2026', 'Development', 'Architecture design and prototype development'),
      ('Mar 2026', 'Testing & Refinement', 'Iterative testing, debugging, and performance optimization'),
      ('Apr 2026', 'Thesis Writing', 'Documentation of research findings, methodologies, and conclusions'),
      ('May 2026', 'Final Submission & Defense', 'Submission of thesis paper and preparation for defense presentation'),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.calendar_month, size: 28, color: Color(0xFF2563EB)),
                  const SizedBox(width: 12),
                  Text(
                    'Project Timeline',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Color(0xFF003D99),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Column(
                children: timelineItems.asMap().entries.map((entry) {
                  final isLast = entry.key == timelineItems.length - 1;
                  return Padding(
                    padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 120,
                          child: Text(
                            entry.value.$1,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF6B7280),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Container(
                            width: 24,
                            height: 2,
                            color: Color(0xFF2563EB),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.value.$2,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                entry.value.$3,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF6B7280),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAcknowledgmentsSection(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Acknowledgments',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Color(0xFF003D99),
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'The research team would like to express our deepest gratitude to the following individuals and organizations who made this project possible:',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Color(0xFF374151),
                ),
              ),
              const SizedBox(height: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildAcknowledgmentItem('Our thesis adviser, for invaluable guidance and unwavering support throughout this research journey'),
                  _buildAcknowledgmentItem('The University of Cebu - Lapu-Lapu and Mandaue Campus administration for providing resources and facilities'),
                  _buildAcknowledgmentItem('The College of Computer Engineering faculty for their expertise and constructive feedback'),
                  _buildAcknowledgmentItem('All survey respondents and user testing participants who contributed valuable insights'),
                  _buildAcknowledgmentItem('Our families and friends for their constant encouragement and support'),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                'This project is dedicated to advancing technological innovation in education and improving the campus experience for all members of the university community.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Color(0xFF374151),
                  fontStyle: FontStyle.italic,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAcknowledgmentItem(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6, right: 12),
            child: Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: Color(0xFF2563EB),
                shape: BoxShape.circle,
              ),
            ),
          ),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 13, color: Color(0xFF374151), height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}
