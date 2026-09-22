import 'package:flutter/material.dart';

/// One step of a service's "how it works" walkthrough.
class TutorialStep {
  const TutorialStep({
    required this.icon,
    required this.titleKey,
    required this.descriptionKey,
    required this.imageAsset,
  });

  /// Fallback glyph if [imageAsset] fails to load.
  final IconData icon;
  final String titleKey;
  final String descriptionKey;

  /// A real, tightly-cropped screenshot of the actual kiosk screen for this
  /// step (e.g. just the Documents card, just the Print Settings card, or
  /// the real payment/consent screen) — each step gets its own image.
  final String imageAsset;
}

/// One service's full walkthrough — used by both the idle-screen showcase
/// (autoplay) and the interactive "How It Works" tab (tap-through).
class ServiceTutorial {
  const ServiceTutorial({
    required this.id,
    required this.icon,
    required this.labelKey,
    required this.color,
    required this.steps,
  });

  final String id;
  final IconData icon;
  final String labelKey;
  final Color color;
  final List<TutorialStep> steps;
}

/// The three kiosk services and their real step-by-step flow — mirrors
/// printing_page.dart / scanning_page.dart / photocopying_page.dart.
const List<ServiceTutorial> kServiceTutorials = [
  ServiceTutorial(
    id: 'printing',
    icon: Icons.print_rounded,
    labelKey: 'idle.print',
    color: Color(0xFF2563EB),
    steps: [
      TutorialStep(
        icon: Icons.folder_open_rounded,
        titleKey: 'tutorial.printing.step1.title',
        descriptionKey: 'tutorial.printing.step1.desc',
        imageAsset: 'assets/tutorial/printing_step1.png',
      ),
      TutorialStep(
        icon: Icons.tune_rounded,
        titleKey: 'tutorial.printing.step2.title',
        descriptionKey: 'tutorial.printing.step2.desc',
        imageAsset: 'assets/tutorial/printing_step2.png',
      ),
      TutorialStep(
        icon: Icons.payments_rounded,
        titleKey: 'tutorial.printing.step3.title',
        descriptionKey: 'tutorial.printing.step3.desc',
        imageAsset: 'assets/tutorial/printing_step3.png',
      ),
    ],
  ),
  ServiceTutorial(
    id: 'scanning',
    icon: Icons.document_scanner_rounded,
    labelKey: 'idle.scan',
    color: Color(0xFF059669),
    steps: [
      TutorialStep(
        icon: Icons.description_outlined,
        titleKey: 'tutorial.scanning.step1.title',
        descriptionKey: 'tutorial.scanning.step1.desc',
        imageAsset: 'assets/tutorial/scanning_step1.png',
      ),
      TutorialStep(
        icon: Icons.tune_rounded,
        titleKey: 'tutorial.scanning.step2.title',
        descriptionKey: 'tutorial.scanning.step2.desc',
        imageAsset: 'assets/tutorial/scanning_step2.png',
      ),
      TutorialStep(
        icon: Icons.document_scanner_rounded,
        titleKey: 'tutorial.scanning.step3.title',
        descriptionKey: 'tutorial.scanning.step3.desc',
        imageAsset: 'assets/tutorial/scanning_step3.png',
      ),
    ],
  ),
  ServiceTutorial(
    id: 'photocopying',
    icon: Icons.copy_all_rounded,
    labelKey: 'idle.copy',
    color: Color(0xFF9333EA),
    steps: [
      TutorialStep(
        icon: Icons.description_outlined,
        titleKey: 'tutorial.photocopying.step1.title',
        descriptionKey: 'tutorial.photocopying.step1.desc',
        imageAsset: 'assets/tutorial/photocopying_step1.png',
      ),
      TutorialStep(
        icon: Icons.tune_rounded,
        titleKey: 'tutorial.photocopying.step2.title',
        descriptionKey: 'tutorial.photocopying.step2.desc',
        imageAsset: 'assets/tutorial/photocopying_step2.png',
      ),
      TutorialStep(
        icon: Icons.payments_rounded,
        titleKey: 'tutorial.photocopying.step3.title',
        descriptionKey: 'tutorial.photocopying.step3.desc',
        imageAsset: 'assets/tutorial/photocopying_step3.png',
      ),
    ],
  ),
];
