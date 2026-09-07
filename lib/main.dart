import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';
import 'services.dart';
import 'about.dart';
import 'legal_page.dart';
import 'pages/payment_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  const windowOptions = WindowOptions(
    size: Size(1280, 800),
    minimumSize: Size(900, 600),
    fullScreen: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    titleBarStyle: TitleBarStyle.normal,
  );

  windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
  });

  runApp(const MainApp());
}

class MainApp extends StatefulWidget {
  const MainApp({super.key});

  @override
  State<MainApp> createState() => _MainAppState();
}

class _MainAppState extends State<MainApp> {
  String _currentPage = 'home';

  void _navigate(String page) {
    setState(() {
      _currentPage = page;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DOCUCENTER Kiosk',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563EB),
        ),
        useMaterial3: true,
      ),
      home: Scaffold(
        body: Column(
          mainAxisSize: MainAxisSize.max,
          children: [
            Header(
              currentPage: _currentPage,
              onNavigate: _navigate,
            ),
            Expanded(
              child: HomePage(
                currentPage: _currentPage,
                onNavigate: _navigate,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class Header extends StatefulWidget {
  final String currentPage;
  final ValueChanged<String> onNavigate;

  const Header({
    super.key,
    required this.currentPage,
    required this.onNavigate,
  });

  @override
  State<Header> createState() => _HeaderState();
}

class _HeaderState extends State<Header> {
  bool _mobileMenuOpen = false;

  final List<Map<String, String>> navItems = [
    {'id': 'home', 'label': 'Home'},
    {'id': 'services', 'label': 'Services'},
    {'id': 'about', 'label': 'About'},
    {'id': 'legal', 'label': 'Legal'},
  ];

  void _handleNavigate(String page) {
    widget.onNavigate(page);
    setState(() {
      _mobileMenuOpen = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 1024;

    return Material(
      elevation: 4,
      child: Container(
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Top bar with logo and menu button
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Logo/Title
                  Expanded(
                    child: GestureDetector(
                      onTap: () => _handleNavigate('home'),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: const Color(0xFF2563EB),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Center(
                              child: Text(
                                'DC',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'DOCUCENTER Kiosk',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                  color: const Color(0xFF003D99),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                'University of Cebu',
                                style:
                                    Theme.of(context).textTheme.labelSmall?.copyWith(
                                  color: const Color(0xFF4B5563),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  // Desktop Navigation
                  if (!isMobile)
                    Row(
                      children: navItems.map((item) {
                        final isActive = widget.currentPage == item['id'];
                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: TextButton(
                            onPressed: () => _handleNavigate(item['id']!),
                            style: TextButton.styleFrom(
                              backgroundColor: isActive
                                  ? const Color(0xFF2563EB)
                                  : Colors.transparent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(6),
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 8,
                              ),
                            ),
                            child: Text(
                              item['label']!,
                              style: TextStyle(
                                color: isActive
                                    ? Colors.white
                                    : const Color(0xFF374151),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  // Mobile Menu Button
                  if (isMobile)
                    IconButton(
                      icon: Icon(
                        _mobileMenuOpen ? Icons.close : Icons.menu,
                        color: const Color(0xFF003D99),
                      ),
                      tooltip: _mobileMenuOpen
                          ? 'Close navigation menu'
                          : 'Open navigation menu',
                      onPressed: () {
                        setState(() {
                          _mobileMenuOpen = !_mobileMenuOpen;
                        });
                      },
                    ),
                ],
              ),
              // Mobile Navigation Menu
              if (isMobile && _mobileMenuOpen) ...[
                const SizedBox(height: 12),
                Column(
                  children: navItems.map((item) {
                    final isActive = widget.currentPage == item['id'];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Container(
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: isActive
                              ? const Color(0xFF2563EB)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: TextButton(
                          onPressed: () => _handleNavigate(item['id']!),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              item['label']!,
                              style: TextStyle(
                                color: isActive
                                    ? Colors.white
                                    : const Color(0xFF374151),
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class Footer extends StatelessWidget {
  /// Optional navigation callback so footer links can open in-app pages
  /// (e.g. the Legal screen). When null, the links are hidden.
  final ValueChanged<String>? onNavigate;

  const Footer({super.key, this.onNavigate});

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 768;

    return Container(
      color: const Color(0xFF111827), // gray-900
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Footer content grid
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1344),
            child: isMobile
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildFooterColumn(
                        context,
                        'DOCUCENTER Kiosk',
                        'Self-Service Document Processing Station with Real-Time Monitoring and Automated Payment System',
                      ),
                      const SizedBox(height: 32),
                      _buildFooterColumn(
                        context,
                        'University',
                        'University of Cebu\nLapu-Lapu and Mandaue Campus\nCollege of Computer Engineering',
                      ),
                      const SizedBox(height: 32),
                      _buildFooterColumn(
                        context,
                        'Project Information',
                        'Bachelor of Science in\nComputer Engineering\nAcademic Year 2025–2026',
                      ),
                      const SizedBox(height: 32),
                      _buildFooterColumn(
                        context,
                        'Operator',
                        'DocuCenter\nDeveloper: Charles Adrian L. Cabil\nadriancabil12@gmail.com',
                      ),
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          'DOCUCENTER Kiosk',
                          'Self-Service Document Processing Station with Real-Time Monitoring and Automated Payment System',
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          'University',
                          'University of Cebu\nLapu-Lapu and Mandaue Campus\nCollege of Computer Engineering',
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          'Project Information',
                          'Bachelor of Science in\nComputer Engineering\nAcademic Year 2025–2026',
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          'Operator',
                          'DocuCenter\nDeveloper: Charles Adrian L. Cabil\nadriancabil12@gmail.com',
                        ),
                      ),
                    ],
                  ),
          ),
          // Divider
          const SizedBox(height: 24),
          Container(
            height: 1,
            color: const Color(0xFF1F2937), // gray-800
          ),
          const SizedBox(height: 20),
          // Legal links
          if (onNavigate != null)
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                _buildFooterLink(context, 'Privacy Policy', 'legal'),
                _buildFooterDot(),
                _buildFooterLink(context, 'Terms & Conditions', 'legal'),
                _buildFooterDot(),
                _buildFooterLink(context, 'Cookie Policy', 'legal'),
                _buildFooterDot(),
                _buildFooterLink(context, 'Refund Policy', 'legal'),
              ],
            ),
          // Copyright
          const SizedBox(height: 16),
          Text(
            '© 2025–2026 DocuCenter — an undergraduate thesis prototype by '
            'Charles Adrian L. Cabil, University of Cebu – Lapu-Lapu and Mandaue Campus.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: const Color(0xFFCBD1DC), // lighter grey for AA contrast on gray-900
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildFooterDot() => const Text(
        '·',
        style: TextStyle(color: Color(0xFF6B7280)),
      );

  Widget _buildFooterLink(BuildContext context, String label, String pageId) {
    return TextButton(
      onPressed: () => onNavigate?.call(pageId),
      style: TextButton.styleFrom(
        foregroundColor: const Color(0xFFDBE9F8),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        minimumSize: const Size(0, 40),
        tapTargetSize: MaterialTapTargetSize.padded,
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          decoration: TextDecoration.underline,
        ),
      ),
    );
  }

  Widget _buildFooterColumn(
    BuildContext context,
    String title,
    String content,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          content,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: const Color(0xFFA3A9B8), // gray-400
            height: 1.6,
          ),
        ),
      ],
    );
  }
}

class HomePage extends StatefulWidget {
  final String currentPage;
  final ValueChanged<String> onNavigate;

  const HomePage({
    super.key,
    required this.currentPage,
    required this.onNavigate,
  });

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  void _navigate(String page) {
    widget.onNavigate(page);
  }

  @override
  Widget build(BuildContext context) {
    return _buildPageContent();
  }

  Widget _buildPageContent() {
    switch (widget.currentPage) {
      case 'payment':
        return PAYMONGOPaymentPage(onNavigate: widget.onNavigate);
      case 'services':
        return ServicesPage(onNavigate: widget.onNavigate);
      case 'about':
        return const AboutPage();
      case 'legal':
        return LegalPage(onNavigate: widget.onNavigate);
      default:
        return _buildHomePageContent();
    }
  }

  Widget _buildHomePageContent() {
    return SingleChildScrollView(
      child: Column(
        children: [
          // Hero Section
          _buildHeroSection(context),
          
          // Rationale Section
          _buildRationaleSection(context),
          
          // Features Section
          _buildFeaturesSection(context),
          
          // Benefits Section
          _buildBenefitsSection(context),
          
          // Call to Action Section
          _buildCallToActionSection(context),
          
          // Footer
          Footer(onNavigate: widget.onNavigate),
        ],
      ),
    );
  }

  Widget _buildHeroSection(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF003D99), // blue-900
            Color(0xFF0052CC), // blue-800
            Color(0xFF2563EB), // blue-600
          ],
        ),
      ),
      child: Stack(
        children: [
          // Dark overlay
          Container(
            color: Colors.black.withValues(alpha: 0.4),
          ),
          // Content
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 96),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 896),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'DOCUCENTER Kiosk',
                      style: Theme.of(context).textTheme.displayLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Self-Service Document Processing Station',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: const Color(0xFFDBE9F8), // blue-100
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    Text(
                      'Print, scan, and photocopy documents at the kiosk, with staff-side device monitoring and cashless payment',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: const Color(0xFFF0F9FF), // blue-50
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    ElevatedButton(
                      onPressed: () => _navigate('services'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF003D99), // blue-900
                        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
                      ),
                      child: const Text(
                        'Try Our Services',
                        style: TextStyle(fontSize: 18),
                      ),
                    ),
                    const SizedBox(height: 32),
                    // Service badges
                    Wrap(
                      spacing: 16,
                      runSpacing: 16,
                      alignment: WrapAlignment.center,
                      children: [
                        _buildServiceBadge('Printing'),
                        _buildServiceBadge('Scanning'),
                        _buildServiceBadge('Photocopying'),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServiceBadge(String label) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0052CC),
        border: Border.all(
          color: const Color(0xFF60A5FA),
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildRationaleSection(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 64),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 896),
          child: Column(
            children: [
              Text(
                'Rationale',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: const Color(0xFF003D99), // blue-900
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'The DocuCenter Kiosk looks at the need for quicker, more accessible document processing on campus. Traditional counters can mean long queues, limited hours, and manual payment handling.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF374151), // gray-700
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'By combining a self-service kiosk with staff-side device monitoring and a cashless payment integration, the project aims to help students, faculty, and staff complete routine document tasks with less waiting and less manual processing.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF374151),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'This is an undergraduate thesis prototype developed at the University of Cebu – Lapu-Lapu and Mandaue Campus. It is being piloted for evaluation and is not yet a commercial service.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF374151),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFeaturesSection(BuildContext context) {
    final features = [
      {
        'icon': Icons.print,
        'title': 'Printing Services',
        'description': 'High-quality document printing with multiple format support',
      },
      {
        'icon': Icons.document_scanner,
        'title': 'Scanning',
        'description': 'Fast and efficient document scanning to digital format',
      },
      {
        'icon': Icons.copy,
        'title': 'Photocopying',
        'description': 'Quick photocopying services with adjustable settings',
      },
      {
        'icon': Icons.credit_card,
        'title': 'Automated Payment',
        'description': 'Seamless payment integration for hassle-free transactions',
      },
      {
        'icon': Icons.analytics,
        'title': 'Device Monitoring',
        'description': 'Staff can track paper-tray levels and kiosk status from the admin console',
      },
      {
        'icon': Icons.desktop_mac,
        'title': 'User-Friendly Interface',
        'description': 'Intuitive touchscreen interface for easy navigation',
      },
    ];

    return Container(
      color: const Color(0xFFF9FAFB), // gray-50
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 64),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1344),
          child: Column(
            children: [
              Text(
                'Core Features',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: const Color(0xFF003D99),
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Comprehensive document processing capabilities designed for the modern campus environment',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF4B5563), // gray-600
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: MediaQuery.of(context).size.width < 768 
                    ? 1 
                    : MediaQuery.of(context).size.width < 1024 
                      ? 2 
                      : 3,
                  crossAxisSpacing: 32,
                  mainAxisSpacing: 32,
                  childAspectRatio: 1.1,
                ),
                itemCount: features.length,
                itemBuilder: (context, index) {
                  final feature = features[index];
                  return _buildFeatureCard(
                    context,
                    feature['icon'] as IconData,
                    feature['title'] as String,
                    feature['description'] as String,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFeatureCard(
    BuildContext context,
    IconData icon,
    String title,
    String description,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 32,
              color: const Color(0xFF2563EB), // blue-600
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF4B5563),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBenefitsSection(BuildContext context) {
    final benefits = [
      {
        'emoji': '🎓',
        'title': 'Students',
        'description': 'Access printing and scanning services anytime, with quick payments and no waiting lines',
      },
      {
        'emoji': '👨‍🏫',
        'title': 'Faculty',
        'description': 'Efficient document processing for teaching materials and administrative documents',
      },
      {
        'emoji': '💼',
        'title': 'Staff',
        'description': 'Streamlined operations with real-time monitoring and reduced manual processing',
      },
    ];

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 64),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1344),
          child: Column(
            children: [
              Text(
                'Who Benefits?',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: const Color(0xFF003D99),
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 48),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: MediaQuery.of(context).size.width < 768
                    ? 1
                    : 3,
                  crossAxisSpacing: 32,
                  mainAxisSpacing: 32,
                  childAspectRatio: 1.2,
                ),
                itemCount: benefits.length,
                itemBuilder: (context, index) {
                  final benefit = benefits[index];
                  return _buildBenefitCard(
                    context,
                    benefit['emoji'] as String,
                    benefit['title'] as String,
                    benefit['description'] as String,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBenefitCard(
    BuildContext context,
    String emoji,
    String title,
    String description,
  ) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: const BoxDecoration(
            color: Color(0xFFDEE6F8), // blue-100
            shape: BoxShape.circle,
          ),
          child: Center(
            // Decorative — the group name is announced by the text below.
            child: ExcludeSemantics(
              child: Text(
                emoji,
                style: const TextStyle(fontSize: 32),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          description,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: const Color(0xFF4B5563),
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildCallToActionSection(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            Color(0xFF2563EB), // blue-600
            Color(0xFF1E40AF), // blue-800
          ],
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 64),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 896),
          child: Column(
            children: [
              Text(
                'Experience the Future of Document Services',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              Text(
                'The DocuCenter Kiosk is a student-built prototype exploring how self-service and cashless payment can speed up routine document tasks on campus.',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: const Color(0xFFF0F9FF), // blue-50
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              Text(
                'A thesis project by the College of Computer Engineering, University of Cebu - Lapu-Lapu and Mandaue Campus',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFFDBE9F8), // blue-100
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => _navigate('about'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF1E40AF),
                ),
                child: const Text('Learn More'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

