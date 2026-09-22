import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../strings.dart';
import 'docucenter_logo.dart';
import 'service_tutorial.dart';
import 'service_tutorial_panel.dart';

/// One softly floating background document — position, size and timing are
/// fixed per instance (seeded) so the drift looks organic without being
/// regenerated (and jumping) on every rebuild.
class _Paper {
  _Paper(int seed)
      : _rnd = math.Random(seed),
        left = math.Random(seed).nextDouble(),
        top = math.Random(seed + 1).nextDouble(),
        size = 22 + math.Random(seed + 2).nextDouble() * 26,
        amplitude = 16 + math.Random(seed + 3).nextDouble() * 30,
        phase = math.Random(seed + 4).nextDouble() * 2 * math.pi,
        speed = 0.5 + math.Random(seed + 5).nextDouble() * 0.7,
        opacity = 0.05 + math.Random(seed + 6).nextDouble() * 0.09,
        rotation = math.Random(seed + 7).nextDouble() * 2 * math.pi;

  // ignore: unused_field
  final math.Random _rnd;
  final double left;
  final double top;
  final double size;
  final double amplitude;
  final double phase;
  final double speed;
  final double opacity;
  final double rotation;
}

/// Full-screen standby / screensaver animation shown after the kiosk has
/// gone untouched for [idleTimeout]. Gently advertises the three services
/// and invites a tap anywhere, which hands control back to Home via
/// [onDismiss].
class IdleScreen extends StatefulWidget {
  const IdleScreen({super.key, required this.onDismiss});

  final VoidCallback onDismiss;

  static const idleTimeout = Duration(minutes: 1);

  @override
  State<IdleScreen> createState() => _IdleScreenState();
}

class _IdleScreenState extends State<IdleScreen>
    with TickerProviderStateMixin {
  late final AnimationController _introCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..forward();

  // Drives the logo glow, the tap-hand bob, and the "touch to continue"
  // shimmer — one slow heartbeat shared by everything in the foreground.
  late final AnimationController _pulseCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1700),
  )..repeat(reverse: true);

  // Expanding ring behind the tap-hand icon, mimicking a touch ripple.
  late final AnimationController _rippleCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat();

  // Slow drift for the background documents.
  late final AnimationController _floatCtrl = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 16),
  )..repeat();

  late final List<_Paper> _papers =
      List.generate(4, (i) => _Paper(i * 101 + 7));

  @override
  void dispose() {
    _introCtrl.dispose();
    _pulseCtrl.dispose();
    _rippleCtrl.dispose();
    _floatCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onDismiss,
      child: Material(
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF001F4D),
                Color(0xFF003D99),
                Color(0xFF0052CC),
              ],
            ),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) => Stack(
              fit: StackFit.expand,
              children: [
                _buildFloatingPapers(constraints),
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _introCtrl,
                    curve: Curves.easeOut,
                  ),
                  child: ScaleTransition(
                    scale: Tween<double>(begin: 0.94, end: 1).animate(
                      CurvedAnimation(
                        parent: _introCtrl,
                        curve: Curves.easeOutCubic,
                      ),
                    ),
                    child: Center(
                      child: SingleChildScrollView(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 32,
                            vertical: 40,
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _buildBrand(),
                              const SizedBox(height: 32),
                              _buildHowItWorksShowcase(),
                              const SizedBox(height: 48),
                              _buildTapPrompt(),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFloatingPapers(BoxConstraints constraints) {
    return AnimatedBuilder(
      animation: _floatCtrl,
      builder: (context, _) {
        final t = _floatCtrl.value * 2 * math.pi;
        return Stack(
          children: _papers.map((p) {
            final dx = p.left * constraints.maxWidth +
                math.sin(t * p.speed + p.phase) * p.amplitude;
            final dy = p.top * constraints.maxHeight +
                math.cos(t * p.speed * 0.8 + p.phase) * p.amplitude;
            return Positioned(
              left: dx,
              top: dy,
              child: Transform.rotate(
                angle: p.rotation + t * 0.05 * p.speed,
                child: Icon(
                  Icons.description_rounded,
                  size: p.size,
                  color: Colors.white.withValues(alpha: p.opacity),
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }

  Widget _buildBrand() {
    return Column(
      children: [
        AnimatedBuilder(
          animation: _pulseCtrl,
          builder: (context, child) {
            final glow = 14 + _pulseCtrl.value * 14;
            return Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.white
                        .withValues(alpha: 0.35 + _pulseCtrl.value * 0.25),
                    blurRadius: glow,
                    spreadRadius: glow * 0.25,
                  ),
                ],
              ),
              child: child,
            );
          },
          child: const Center(
            child: DocucenterLogoMark(size: 60),
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'DOCUCENTER Kiosk',
          style: TextStyle(
            color: Colors.white,
            fontSize: 30,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          Strings.t('idle.subtitle'),
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.85),
            fontSize: 16,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  /// "How Does This Work?" — three autoplaying panels (Printing, Scanning,
  /// Photocopying), each stepping through its own 3-step flow on a timer.
  /// Purely decorative here (taps still fall through to [widget.onDismiss]);
  /// the tap-through version lives in HowItWorksPage.
  Widget _buildHowItWorksShowcase() {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1080),
      child: Column(
        children: [
          Text(
            Strings.t('tutorial.heading'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            Strings.t('tutorial.subheading'),
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.8),
              fontSize: 14,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              final panels = <Widget>[
                for (var i = 0; i < kServiceTutorials.length; i++)
                  ServiceTutorialPanel(
                    key: ValueKey('idle-tutorial-${kServiceTutorials[i].id}'),
                    tutorial: kServiceTutorials[i],
                    autoPlay: true,
                    compact: true,
                    staggerDelay: Duration(milliseconds: i * 500),
                  ),
              ];
              if (constraints.maxWidth < 760) {
                return Column(
                  children: [
                    for (final p in panels) ...[p, const SizedBox(height: 12)],
                  ],
                );
              }
              return IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < panels.length; i++) ...[
                      if (i > 0) const SizedBox(width: 14),
                      Expanded(child: panels[i]),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildTapPrompt() {
    return Column(
      children: [
        SizedBox(
          width: 120,
          height: 120,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedBuilder(
                animation: _rippleCtrl,
                builder: (context, _) {
                  final scale = 0.5 + _rippleCtrl.value * 0.7;
                  final opacity = (1 - _rippleCtrl.value).clamp(0.0, 1.0);
                  return Opacity(
                    opacity: opacity * 0.6,
                    child: Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 90,
                        height: 90,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                      ),
                    ),
                  );
                },
              ),
              AnimatedBuilder(
                animation: _pulseCtrl,
                builder: (context, child) => Transform.translate(
                  offset: Offset(0, _pulseCtrl.value * 6),
                  child: Transform.scale(
                    scale: 1 - _pulseCtrl.value * 0.08,
                    child: child,
                  ),
                ),
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.touch_app_rounded,
                    color: Color(0xFF003D99),
                    size: 34,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        AnimatedBuilder(
          animation: _pulseCtrl,
          builder: (context, child) => Opacity(
            opacity: 0.6 + _pulseCtrl.value * 0.4,
            child: child,
          ),
          child: Text(
            Strings.t('idle.tap'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}
