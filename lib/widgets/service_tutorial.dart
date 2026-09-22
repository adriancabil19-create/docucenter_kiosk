import 'package:flutter/material.dart';

/// One step of a service's "how it works" walkthrough.
class TutorialStep {
  const TutorialStep({
    required this.icon,
    required this.titleKey,
    required this.descriptionKey,
    this.focusAlignment = Alignment.center,
  });

  /// Fallback glyph if [ServiceTutorial.imageAsset] fails to load.
  final IconData icon;
  final String titleKey;
  final String descriptionKey;

  /// Where the panel's real screenshot pans/zooms to for this step — e.g.
  /// the Documents area for "choose your file", the settings area for "set
  /// your options". Gives one static screenshot a guided-tour feel.
  final Alignment focusAlignment;
}

/// One service's full walkthrough — used by both the idle-screen showcase
/// (autoplay) and the interactive "How It Works" tab (tap-through).
class ServiceTutorial {
  const ServiceTutorial({
    required this.id,
    required this.icon,
    required this.labelKey,
    required this.color,
    required this.imageAsset,
    required this.steps,
  });

  final String id;
  final IconData icon;
  final String labelKey;
  final Color color;

  /// A real screenshot of this service's actual kiosk screen — the panel
  /// pans/zooms across it per step instead of switching images.
  final String imageAsset;

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
    imageAsset: 'assets/tutorial/printing.png',
    steps: [
      TutorialStep(
        icon: Icons.folder_open_rounded,
        titleKey: 'tutorial.printing.step1.title',
        descriptionKey: 'tutorial.printing.step1.desc',
        focusAlignment: Alignment(-0.7, -0.4),
      ),
      TutorialStep(
        icon: Icons.tune_rounded,
        titleKey: 'tutorial.printing.step2.title',
        descriptionKey: 'tutorial.printing.step2.desc',
        focusAlignment: Alignment(0.7, -0.2),
      ),
      TutorialStep(
        icon: Icons.payments_rounded,
        titleKey: 'tutorial.printing.step3.title',
        descriptionKey: 'tutorial.printing.step3.desc',
        focusAlignment: Alignment(-0.5, 0.9),
      ),
    ],
  ),
  ServiceTutorial(
    id: 'scanning',
    icon: Icons.document_scanner_rounded,
    labelKey: 'idle.scan',
    color: Color(0xFF059669),
    imageAsset: 'assets/tutorial/scanning.png',
    steps: [
      TutorialStep(
        icon: Icons.description_outlined,
        titleKey: 'tutorial.scanning.step1.title',
        descriptionKey: 'tutorial.scanning.step1.desc',
        focusAlignment: Alignment(-0.7, -0.4),
      ),
      TutorialStep(
        icon: Icons.document_scanner_rounded,
        titleKey: 'tutorial.scanning.step2.title',
        descriptionKey: 'tutorial.scanning.step2.desc',
        focusAlignment: Alignment(0.7, -0.2),
      ),
      TutorialStep(
        icon: Icons.save_alt_rounded,
        titleKey: 'tutorial.scanning.step3.title',
        descriptionKey: 'tutorial.scanning.step3.desc',
        focusAlignment: Alignment(-0.5, 0.9),
      ),
    ],
  ),
  ServiceTutorial(
    id: 'photocopying',
    icon: Icons.copy_all_rounded,
    labelKey: 'idle.copy',
    color: Color(0xFF9333EA),
    imageAsset: 'assets/tutorial/photocopying.png',
    steps: [
      TutorialStep(
        icon: Icons.description_outlined,
        titleKey: 'tutorial.photocopying.step1.title',
        descriptionKey: 'tutorial.photocopying.step1.desc',
        focusAlignment: Alignment(-0.7, -0.4),
      ),
      TutorialStep(
        icon: Icons.tune_rounded,
        titleKey: 'tutorial.photocopying.step2.title',
        descriptionKey: 'tutorial.photocopying.step2.desc',
        focusAlignment: Alignment(0.7, -0.2),
      ),
      TutorialStep(
        icon: Icons.payments_rounded,
        titleKey: 'tutorial.photocopying.step3.title',
        descriptionKey: 'tutorial.photocopying.step3.desc',
        focusAlignment: Alignment(-0.5, 0.9),
      ),
    ],
  ),
];
