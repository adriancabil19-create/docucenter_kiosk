import 'dart:async';

import 'package:flutter/material.dart';

import '../strings.dart';
import 'service_tutorial.dart';

/// One service's "how it works" card — a small mock kiosk screen that steps
/// through [ServiceTutorial.steps].
///
/// Two modes, driven by the same widget:
///  - Idle screen (autoPlay: true): cycles on its own timer, with a thin
///    progress bar counting down to the next step.
///  - "How It Works" tab (interactive: true): tap the dots or the arrows to
///    move between steps by hand, plus a "Try This Service" button.
class ServiceTutorialPanel extends StatefulWidget {
  const ServiceTutorialPanel({
    super.key,
    required this.tutorial,
    this.autoPlay = false,
    this.interactive = false,
    this.compact = false,
    this.onTryService,
    this.stepDuration = const Duration(milliseconds: 3200),
    this.staggerDelay = Duration.zero,
  });

  final ServiceTutorial tutorial;
  final bool autoPlay;
  final bool interactive;

  /// Smaller sizing/typography for the idle screen, where three of these
  /// share a row alongside the rest of the standby animation.
  final bool compact;

  final VoidCallback? onTryService;
  final Duration stepDuration;

  /// Delay before this panel's first auto-advance — staggering the three
  /// panels a little makes the row feel alive instead of ticking in lockstep.
  final Duration staggerDelay;

  @override
  State<ServiceTutorialPanel> createState() => _ServiceTutorialPanelState();
}

class _ServiceTutorialPanelState extends State<ServiceTutorialPanel>
    with SingleTickerProviderStateMixin {
  int _index = 0;
  Timer? _startTimer;
  late final AnimationController _progressCtrl = AnimationController(
    vsync: this,
    duration: widget.stepDuration,
  );

  @override
  void initState() {
    super.initState();
    if (widget.autoPlay) {
      _progressCtrl.addStatusListener(_onProgressStatus);
      _startTimer = Timer(widget.staggerDelay, () {
        if (mounted) _progressCtrl.forward();
      });
    }
  }

  void _onProgressStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || !mounted) return;
    setState(() => _index = (_index + 1) % widget.tutorial.steps.length);
    _progressCtrl
      ..reset()
      ..forward();
  }

  void _goTo(int i) {
    setState(() => _index = i.clamp(0, widget.tutorial.steps.length - 1));
    if (widget.autoPlay) {
      _progressCtrl
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _startTimer?.cancel();
    _progressCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tutorial = widget.tutorial;
    final step = tutorial.steps[_index];
    final compact = widget.compact;

    return Container(
      padding: EdgeInsets.all(compact ? 14 : 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tutorial.color.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildHeader(compact),
          SizedBox(height: compact ? 10 : 16),
          _buildMockScreen(step, compact),
          SizedBox(height: compact ? 10 : 14),
          _buildStepText(step, compact),
          SizedBox(height: compact ? 10 : 16),
          _buildDots(),
          if (widget.autoPlay) ...[
            const SizedBox(height: 8),
            _buildProgressBar(),
          ],
          if (widget.interactive) ...[
            const SizedBox(height: 14),
            _buildInteractiveControls(),
          ],
        ],
      ),
    );
  }

  Widget _buildHeader(bool compact) {
    return Row(
      children: [
        Container(
          width: compact ? 28 : 34,
          height: compact ? 28 : 34,
          decoration: BoxDecoration(
            color: widget.tutorial.color.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(widget.tutorial.icon, color: widget.tutorial.color, size: compact ? 16 : 20),
        ),
        const SizedBox(width: 8),
        Text(
          Strings.t(widget.tutorial.labelKey),
          style: TextStyle(
            fontSize: compact ? 14 : 17,
            fontWeight: FontWeight.bold,
            color: const Color(0xFF1E293B),
          ),
        ),
      ],
    );
  }

  /// A real, tightly-cropped screenshot of this step's actual kiosk screen
  /// (its own [TutorialStep.imageAsset]) — crossfades to the next step's
  /// image rather than panning across one shared screenshot, since each
  /// step now has its own dedicated capture (Documents card, Settings
  /// card, the real payment screen, ...).
  Widget _buildMockScreen(TutorialStep step, bool compact) {
    final height = compact ? 150.0 : 280.0;
    return Container(
      height: height,
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 450),
            transitionBuilder: (child, anim) => FadeTransition(opacity: anim, child: child),
            child: Image.asset(
              step.imageAsset,
              key: ValueKey(step.imageAsset),
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              errorBuilder: (context, error, stack) => Container(
                color: widget.tutorial.color.withValues(alpha: 0.08),
                alignment: Alignment.center,
                child: Icon(step.icon, size: compact ? 40 : 56, color: widget.tutorial.color),
              ),
            ),
          ),
          // Darken the top-left corner a touch so the step badge stays
          // legible over whatever part of the screenshot is in view.
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0x66000000), Colors.transparent],
                  stops: [0, 0.55],
                ),
              ),
            ),
          ),
          Positioned(
            left: 8,
            top: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: widget.tutorial.color,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '${Strings.t('tutorial.stepLabel')} ${_index + 1}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.4,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepText(TutorialStep step, bool compact) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      child: Column(
        key: ValueKey('${step.titleKey}-text'),
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            Strings.t(step.titleKey),
            style: TextStyle(
              fontSize: compact ? 13 : 15,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF1E293B),
            ),
          ),
          if (!compact) ...[
            const SizedBox(height: 4),
            Text(
              Strings.t(step.descriptionKey),
              style: const TextStyle(fontSize: 12.5, color: Color(0xFF64748B), height: 1.35),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDots() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(widget.tutorial.steps.length, (i) {
        final active = i == _index;
        return Padding(
          padding: const EdgeInsets.only(right: 6),
          child: GestureDetector(
            onTap: widget.interactive ? () => _goTo(i) : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: active ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: active ? widget.tutorial.color : widget.tutorial.color.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildProgressBar() {
    return AnimatedBuilder(
      animation: _progressCtrl,
      builder: (context, _) {
        final remaining =
            (widget.stepDuration.inMilliseconds * (1 - _progressCtrl.value) / 1000).ceil();
        return Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: _progressCtrl.value,
                  minHeight: 3,
                  backgroundColor: widget.tutorial.color.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation(widget.tutorial.color),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${Strings.t('tutorial.resetsIn')} ${remaining}s',
              style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
            ),
          ],
        );
      },
    );
  }

  Widget _buildInteractiveControls() {
    final last = widget.tutorial.steps.length - 1;
    return Row(
      children: [
        IconButton(
          onPressed: _index > 0 ? () => _goTo(_index - 1) : null,
          icon: const Icon(Icons.chevron_left_rounded),
          tooltip: 'Previous step',
          style: IconButton.styleFrom(
            backgroundColor: const Color(0xFFF1F5F9),
            foregroundColor: const Color(0xFF334155),
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          onPressed: _index < last ? () => _goTo(_index + 1) : null,
          icon: const Icon(Icons.chevron_right_rounded),
          tooltip: 'Next step',
          style: IconButton.styleFrom(
            backgroundColor: const Color(0xFFF1F5F9),
            foregroundColor: const Color(0xFF334155),
          ),
        ),
        const Spacer(),
        if (widget.onTryService != null)
          ElevatedButton(
            onPressed: widget.onTryService,
            style: ElevatedButton.styleFrom(
              backgroundColor: widget.tutorial.color,
              foregroundColor: Colors.white,
            ),
            child: Text(Strings.t('tutorial.tryService')),
          ),
      ],
    );
  }
}
