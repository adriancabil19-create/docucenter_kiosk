import 'package:flutter/material.dart';

/// A labeled checkbox for two-sided ("duplex") printing, with an info icon
/// that explains what duplex means on tap. This is a touchscreen kiosk, not
/// a mouse-driven desktop app, so the tooltip is tap-triggered (Flutter's
/// default long-press is easy to miss on a public kiosk) rather than
/// hover-only.
///
/// Printing only — the scanner has no duplex ADF unit, so duplex SCANNING
/// isn't offered anywhere in the kiosk.
class DuplexToggle extends StatelessWidget {
  final String label;
  final String explanation;
  final bool value;
  final ValueChanged<bool> onChanged;

  /// When false, the checkbox is greyed out and forced off — used to hide
  /// duplex PRINTING on paper sizes the printer's duplexer can't handle
  /// (Folio/"long" bond paper jams it). [disabledReason] is appended to the
  /// tooltip so the "why is this greyed out" question is answered in the
  /// same place the explanation already is.
  final bool enabled;
  final String? disabledReason;

  const DuplexToggle({
    super.key,
    required this.label,
    required this.explanation,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.disabledReason,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final message = enabled || disabledReason == null
        ? explanation
        : '$explanation\n\n$disabledReason';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Checkbox(
          value: enabled ? value : false,
          onChanged: enabled ? (v) => onChanged(v ?? false) : null,
        ),
        GestureDetector(
          onTap: enabled ? () => onChanged(!value) : null,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: enabled ? null : colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        const SizedBox(width: 4),
        Tooltip(
          message: message,
          triggerMode: TooltipTriggerMode.tap,
          showDuration: const Duration(seconds: 8),
          textStyle: const TextStyle(fontSize: 12, color: Colors.white),
          decoration: BoxDecoration(
            color: Colors.black87,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(
            Icons.info_outline,
            size: 18,
            color: enabled ? colorScheme.primary : colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// The standard duplex explanation, shared so every toggle reads the same way.
const String kDuplexExplanation =
    'Duplex prints both sides of the paper — page 1 on the front, page 2 on '
    'the back, and so on. It uses fewer physical sheets for multi-page '
    'documents.';

/// Shown next to a duplex PRINT toggle when the selected paper size can't
/// be duplexed. Kept as one shared string so the wording matches everywhere.
const String kDuplexPrintUnsupportedReason =
    'Not available for this paper size — the printer cannot duplex Folio '
    '(long) paper. Switch to A4 or Letter to enable double-sided printing.';

/// Paper sizes the printer's duplex unit can physically handle — mirrors
/// `isDuplexCapablePaperSize` in backend/src/services/print.service.ts.
/// Folio ("long" bond paper) jams the duplexer on the real printer, so
/// duplex printing is only ever offered for A4/Letter ("short").
/// Case-insensitive.
bool isDuplexPrintCapable(String paperSize) {
  final size = paperSize.toLowerCase();
  return size == 'a4' || size == 'letter';
}
