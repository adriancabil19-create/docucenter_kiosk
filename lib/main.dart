import 'dart:async';

import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';
import 'services.dart';
import 'about.dart';
import 'legal_page.dart';
import 'pages/payment_page.dart';
import 'kiosk_runtime_service.dart';
import 'settings_service.dart';
import 'strings.dart';
import 'widgets/kiosk_status_overlays.dart';
import 'widgets/idle_screen.dart';
import 'widgets/settings_panel.dart';
import 'widgets/docucenter_logo.dart';
import 'pages/staff/staff_mode_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();
  await AppSettings.instance.load();

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
  // The page we navigated *from*, so a page reached mid-flow (e.g. Legal,
  // opened from the payment consent screen) can send the user back to where
  // they actually were instead of always dumping them on the marketing home
  // page and losing their in-progress job.
  String _previousPage = 'home';

  // Swapped for a fresh key when the operator issues "Restart app" — forces the
  // whole UI subtree to be torn down and rebuilt (a soft reload), without
  // killing the process.
  Key _shellKey = UniqueKey();

  // Bumped every time the user navigates to Services, so re-entering it from
  // the header always lands on the service picker rather than the last-open
  // service.
  int _servicesEntries = 0;

  // Standby animation: shown after 30s with no touch anywhere in the app,
  // to draw in passersby and invite them to start a job.
  Timer? _idleTimer;
  bool _showIdleScreen = false;

  // Staff Mode: rendered as a full-screen overlay above everything else,
  // reached via the header logo's hidden 5-tap gesture.
  bool _showStaffMode = false;

  @override
  void initState() {
    super.initState();
    // Begin polling this kiosk's runtime flags (offline / maintenance /
    // printing-disabled) from the local backend.
    KioskRuntime.instance.start();
    // "Restart app" command → soft reload rather than a process kill.
    KioskRuntime.instance.onReloadRequested = _softReload;
    _resetIdleTimer();
  }

  @override
  void dispose() {
    KioskRuntime.instance.onReloadRequested = null;
    _idleTimer?.cancel();
    super.dispose();
  }

  void _resetIdleTimer() {
    _idleTimer?.cancel();
    _idleTimer = Timer(IdleScreen.idleTimeout, _onIdleTimeout);
  }

  void _onIdleTimeout() {
    if (!mounted) return;
    // The payment screen runs its own multi-minute session (QR scan /
    // gateway wait) with no need for repeated touches — never interrupt it
    // with the standby screen. Just keep deferring until the user leaves it.
    if (_currentPage == 'payment' || _showStaffMode) {
      _resetIdleTimer();
      return;
    }
    setState(() => _showIdleScreen = true);
  }

  void _enterStaffMode() {
    setState(() => _showStaffMode = true);
  }

  /// Return to a clean customer-facing state — same soft-reload path used for
  /// the admin's "Restart app" command, so nothing from the Staff session
  /// (or any in-progress customer job) lingers.
  void _exitStaffMode() {
    setState(() => _showStaffMode = false);
    _softReload();
  }

  /// Raw pointer-down handler covering the whole app — while the idle screen
  /// is up, dismissal is handled by [_dismissIdleScreen] instead so the two
  /// don't race on the same tap.
  void _handleUserActivity() {
    if (_showIdleScreen) return;
    _resetIdleTimer();
  }

  void _dismissIdleScreen() {
    setState(() {
      _showIdleScreen = false;
      _currentPage = 'home';
      _previousPage = 'home';
    });
    _resetIdleTimer();
  }

  /// Reset the kiosk to a pristine home screen and rebuild the UI subtree.
  void _softReload() {
    if (!mounted) return;
    setState(() {
      _currentPage = 'home';
      _previousPage = 'home';
      _shellKey = UniqueKey();
    });
  }

  void _navigate(String page) {
    setState(() {
      _previousPage = _currentPage;
      _currentPage = page;
      if (page == 'services') _servicesEntries++;
    });
  }

  /// Light/dark theme sharing one seed color; button/touch-target sizes
  /// scale with the accessibility text-size setting so "Large"/"Extra Large"
  /// enlarges tappable controls app-wide, not just text.
  ThemeData _buildTheme(Brightness brightness, double textScale) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF2563EB),
      brightness: brightness,
    );
    final minTapHeight = 44.0 * textScale;
    return ThemeData(
      colorScheme: colorScheme,
      useMaterial3: true,
      scaffoldBackgroundColor: colorScheme.surface,
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(minimumSize: Size(0, minTapHeight)),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(minimumSize: Size(0, minTapHeight)),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(minimumSize: Size(0, minTapHeight)),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: Size(minTapHeight, minTapHeight)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppSettings.instance,
      builder: (context, _) {
        final settings = AppSettings.instance;
        return MaterialApp(
          title: 'DOCUCENTER Kiosk',
          debugShowCheckedModeBanner: false,
          theme: _buildTheme(Brightness.light, settings.textScale),
          darkTheme: _buildTheme(Brightness.dark, settings.textScale),
          themeMode: settings.themeMode,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(settings.textScale),
            ),
            child: child!,
          ),
          home: Scaffold(
            body: Listener(
              behavior: HitTestBehavior.translucent,
              onPointerDown: (_) => _handleUserActivity(),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: KioskShell(
                      child: Column(
                        key: _shellKey,
                        mainAxisSize: MainAxisSize.max,
                        children: [
                          Header(
                            currentPage: _currentPage,
                            onNavigate: _navigate,
                            onStaffModeRequested: _enterStaffMode,
                          ),
                          const KioskBanners(),
                          Expanded(
                            child: HomePage(
                              currentPage: _currentPage,
                              previousPage: _previousPage,
                              onNavigate: _navigate,
                              servicesEntries: _servicesEntries,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_showIdleScreen)
                    Positioned.fill(
                      child: IdleScreen(onDismiss: _dismissIdleScreen),
                    ),
                  if (_showStaffMode)
                    Positioned.fill(
                      child: StaffModeShell(onExit: _exitStaffMode),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class Header extends StatefulWidget {
  final String currentPage;
  final ValueChanged<String> onNavigate;
  final VoidCallback? onStaffModeRequested;

  const Header({
    super.key,
    required this.currentPage,
    required this.onNavigate,
    this.onStaffModeRequested,
  });

  @override
  State<Header> createState() => _HeaderState();
}

class _HeaderState extends State<Header> {
  bool _mobileMenuOpen = false;

  // Staff Mode's hidden entry point: 5 taps on the logo within 3 seconds.
  // Every tap still navigates home as before — this just counts alongside it.
  int _logoTapCount = 0;
  Timer? _logoTapTimer;

  static const List<String> _navIds = ['home', 'services', 'about', 'legal'];

  static String _navLabel(String id) => Strings.t('nav.$id');

  void _handleNavigate(String page) {
    widget.onNavigate(page);
    setState(() {
      _mobileMenuOpen = false;
    });
  }

  void _onLogoTap() {
    _handleNavigate('home');
    if (widget.onStaffModeRequested == null) return;
    _logoTapCount++;
    _logoTapTimer?.cancel();
    _logoTapTimer = Timer(const Duration(seconds: 3), () => _logoTapCount = 0);
    if (_logoTapCount >= 5) {
      _logoTapCount = 0;
      _logoTapTimer?.cancel();
      widget.onStaffModeRequested!();
    }
  }

  @override
  void dispose() {
    _logoTapTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 1024;
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      elevation: 4,
      child: Container(
        color: colorScheme.surface,
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
                      onTap: _onLogoTap,
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                            ),
                            child: const Center(
                              child: DocucenterLogoMark(size: 30),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                Strings.t('home.title'),
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                  color: colorScheme.primary,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                'University of Cebu',
                                style:
                                    Theme.of(context).textTheme.labelSmall?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
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
                      children: [
                        ..._navIds.map((id) {
                          final isActive = widget.currentPage == id;
                          return Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            child: TextButton(
                              onPressed: () => _handleNavigate(id),
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
                                _navLabel(id),
                                style: TextStyle(
                                  color: isActive
                                      ? Colors.white
                                      : colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ),
                          );
                        }),
                        IconButton(
                          icon: Icon(Icons.settings_outlined, color: colorScheme.onSurfaceVariant),
                          tooltip: Strings.t('header.settings'),
                          onPressed: () => showSettingsPanel(context),
                        ),
                      ],
                    ),
                  // Mobile Menu Button
                  if (isMobile) ...[
                    IconButton(
                      icon: Icon(Icons.settings_outlined, color: colorScheme.primary),
                      tooltip: Strings.t('header.settings'),
                      onPressed: () => showSettingsPanel(context),
                    ),
                    IconButton(
                      icon: Icon(
                        _mobileMenuOpen ? Icons.close : Icons.menu,
                        color: colorScheme.primary,
                      ),
                      tooltip: _mobileMenuOpen
                          ? Strings.t('header.closeMenu')
                          : Strings.t('header.openMenu'),
                      onPressed: () {
                        setState(() {
                          _mobileMenuOpen = !_mobileMenuOpen;
                        });
                      },
                    ),
                  ],
                ],
              ),
              // Mobile Navigation Menu
              if (isMobile && _mobileMenuOpen) ...[
                const SizedBox(height: 12),
                Column(
                  children: _navIds.map((id) {
                    final isActive = widget.currentPage == id;
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
                          onPressed: () => _handleNavigate(id),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              _navLabel(id),
                              style: TextStyle(
                                color: isActive
                                    ? Colors.white
                                    : colorScheme.onSurfaceVariant,
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
                        Strings.t('footer.kiosk.title'),
                        'Self-Service Document Processing Station with Real-Time Monitoring and Automated Payment System',
                      ),
                      const SizedBox(height: 16),
                      _buildFooterColumn(
                        context,
                        Strings.t('footer.university.title'),
                        'University of Cebu\nLapu-Lapu and Mandaue Campus\nCollege of Computer Engineering',
                      ),
                      const SizedBox(height: 16),
                      _buildFooterColumn(
                        context,
                        Strings.t('footer.project.title'),
                        'Bachelor of Science in\nComputer Engineering\nAcademic Year 2025–2026',
                      ),
                      const SizedBox(height: 16),
                      _buildFooterColumn(
                        context,
                        Strings.t('footer.operator.title'),
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
                          Strings.t('footer.kiosk.title'),
                          'Self-Service Document Processing Station with Real-Time Monitoring and Automated Payment System',
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          Strings.t('footer.university.title'),
                          'University of Cebu\nLapu-Lapu and Mandaue Campus\nCollege of Computer Engineering',
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          Strings.t('footer.project.title'),
                          'Bachelor of Science in\nComputer Engineering\nAcademic Year 2025–2026',
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _buildFooterColumn(
                          context,
                          Strings.t('footer.operator.title'),
                          'DocuCenter\nDeveloper: Charles Adrian L. Cabil\nadriancabil12@gmail.com',
                        ),
                      ),
                    ],
                  ),
          ),
          // Divider
          const SizedBox(height: 10),
          Container(
            height: 1,
            color: const Color(0xFF1F2937), // gray-800
          ),
          const SizedBox(height: 8),
          // Legal links
          if (onNavigate != null)
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 2,
              children: [
                _buildFooterLink(context, Strings.t('footer.privacy'), 'legal'),
                _buildFooterDot(),
                _buildFooterLink(context, Strings.t('footer.terms'), 'legal'),
                _buildFooterDot(),
                _buildFooterLink(context, Strings.t('footer.cookies'), 'legal'),
                _buildFooterDot(),
                _buildFooterLink(context, Strings.t('footer.refund'), 'legal'),
              ],
            ),
          // Copyright
          const SizedBox(height: 8),
          Text(
            '© 2025–2026 DocuCenter — an undergraduate thesis prototype by '
            'Charles Adrian L. Cabil, University of Cebu – Lapu-Lapu and Mandaue Campus.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: const Color(0xFFCBD1DC), // lighter grey for AA contrast on gray-900
              fontSize: 11,
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
          fontSize: 12,
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
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          content,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: const Color(0xFFA3A9B8), // gray-400
            fontSize: 11,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}

class HomePage extends StatefulWidget {
  final String currentPage;
  final String previousPage;
  final ValueChanged<String> onNavigate;

  /// Increments each time the user navigates to Services — used to key the
  /// ServicesPage so it resets to the picker on every fresh entry.
  final int servicesEntries;

  const HomePage({
    super.key,
    required this.currentPage,
    required this.previousPage,
    required this.onNavigate,
    this.servicesEntries = 0,
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
        return ServicesPage(
          key: ValueKey('services-${widget.servicesEntries}'),
          onNavigate: widget.onNavigate,
        );
      case 'about':
        return AboutPage(onNavigate: widget.onNavigate);
      case 'legal':
        // Opened mid-flow (e.g. from the payment consent screen), Legal
        // should send the user back to that flow, not always to Home —
        // otherwise their in-progress job looks like it vanished.
        return LegalPage(onNavigate: widget.onNavigate, backTarget: widget.previousPage);
      default:
        return _buildHomePageContent();
    }
  }

  Widget _buildHomePageContent() {
    // Kiosk home is a launcher, not a brochure: a compact hero + the footer.
    // Sticky-footer layout — the hero fills the space between the header and
    // the footer so its gradient carries to the bottom (no dead strip under
    // the footer), and it scrolls only if the window is too short to fit.
    return Column(
      children: [
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: _buildHeroSection(context),
              ),
            ),
          ),
        ),
        Footer(onNavigate: widget.onNavigate),
      ],
    );
  }

  Widget _buildHeroSection(BuildContext context) {
    return Container(
      // Centre the content when the hero is stretched to fill the viewport.
      alignment: Alignment.center,
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
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 48),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 896),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      Strings.t('home.title'),
                      style: Theme.of(context).textTheme.displayLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      Strings.t('home.subtitle'),
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: const Color(0xFFDBE9F8), // blue-100
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    Text(
                      Strings.t('home.description'),
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
                      child: Text(
                        Strings.t('home.cta'),
                        style: const TextStyle(fontSize: 18),
                      ),
                    ),
                    const SizedBox(height: 32),
                    // Service badges
                    Wrap(
                      spacing: 16,
                      runSpacing: 16,
                      alignment: WrapAlignment.center,
                      children: [
                        _buildServiceBadge(Strings.t('home.badge.printing')),
                        _buildServiceBadge(Strings.t('home.badge.scanning')),
                        _buildServiceBadge(Strings.t('home.badge.photocopying')),
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

}
