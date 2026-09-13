import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../strings.dart';

class _ServiceItem {
  const _ServiceItem(this.icon, this.labelKey);
  final IconData icon;
  final String labelKey;

  String get label => Strings.t(labelKey);
}

const _services = [
  _ServiceItem(Icons.print_rounded, 'idle.print'),
  _ServiceItem(Icons.document_scanner_rounded, 'idle.scan'),
  _ServiceItem(Icons.copy_all_rounded, 'idle.copy'),
];

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

  Timer? _serviceTimer;
  int _serviceIndex = 0;

  @override
  void initState() {
    super.initState();
    _serviceTimer = Timer.periodic(const Duration(milliseconds: 2600), (_) {
      if (!mounted) return;
      setState(() => _serviceIndex = (_serviceIndex + 1) % _services.length);
    });
  }

  @override
  void dispose() {
    _serviceTimer?.cancel();
    _introCtrl.dispose();
    _pulseCtrl.dispose();
    _rippleCtrl.dispose();
    _floatCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final service = _services[_serviceIndex];
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
                              const SizedBox(height: 28),
                              _buildServiceShowcase(service),
                              const SizedBox(height: 56),
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
            child: Text(
              'DC',
              style: TextStyle(
                color: Color(0xFF003D99),
                fontWeight: FontWeight.w800,
                fontSize: 32,
              ),
            ),
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

  Widget _buildServiceShowcase(_ServiceItem service) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 500),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.25),
            end: Offset.zero,
          ).animate(anim),
          child: child,
        ),
      ),
      child: Column(
        key: ValueKey(service.label),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
            ),
            child: Icon(service.icon, color: Colors.white, size: 44),
          ),
          const SizedBox(height: 12),
          Text(
            service.label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
            ),
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
