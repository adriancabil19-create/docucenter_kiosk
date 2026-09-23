/// Shared plain-text receipt formatting.
///
/// Every receipt shown on-screen or printed goes through these helpers so
/// dividers, alignment, and date formatting stay identical across the
/// payment receipt and each service's job-detail block.
library;

const int kReceiptWidth = 40;

final String kReceiptDivider = '=' * kReceiptWidth;
final String kReceiptSubDivider = '-' * kReceiptWidth;

/// Marks [text] as a line that should render centered. A no-op: both
/// renderers this text ends up in (the on-screen `Text` widget's
/// `textAlign: TextAlign.center`, and the printed PDF's `align: 'center'`)
/// already center each line themselves. Baking in leading spaces here as
/// well used to double up — the renderer centered the *padded* string,
/// pushing the visible text past true center — so this exists only to keep
/// call sites self-documenting about intent.
String centerReceiptLine(String text) => text;

/// A short `Label: value` line. Deliberately not padded/columnar — on a
/// full-width printed page (not narrow receipt paper), a fixed-width
/// label/value table just reads as a left-shifted row next to a lot of
/// empty space. A short line centers cleanly like every other line in the
/// receipt.
String receiptRow(String label, String value) => '$label: $value';

/// `yyyy-MM-dd HH:mm:ss` in local time, without the sub-second precision
/// `DateTime.toString()` includes.
String formatReceiptDate(DateTime dateTime) {
  final d = dateTime.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} '
      '${two(d.hour)}:${two(d.minute)}:${two(d.second)}';
}

/// The largest font size (within [minFontSize]..[maxFontSize]) at which
/// [text] — set in a monospace font with [lineHeight] line spacing — fits
/// both [maxWidth] and [maxHeight] without wrapping or overflow.
///
/// Deliberately not a `FittedBox` transform: scaling a whole rendered block
/// to fit the tighter of width/height leaves the other axis under-filled,
/// which for a narrow, many-line receipt inside a wide, short card meant a
/// tiny block of text stranded in a lot of empty space. Sizing the font
/// directly lets each axis use the space it actually needs.
double receiptFontSize(
  String text,
  double maxWidth,
  double maxHeight, {
  double minFontSize = 8,
  double maxFontSize = 14,
  double lineHeight = 1.65,
  double charWidthEm = 0.62,
}) {
  final lines = text.split('\n');
  final lineCount = lines.length;
  final longestLine = lines.fold<int>(0, (m, l) => l.length > m ? l.length : m);

  final heightFit = lineCount == 0 ? maxFontSize : maxHeight / (lineCount * lineHeight);
  final widthFit = longestLine == 0 ? maxFontSize : maxWidth / (longestLine * charWidthEm);

  final fit = [heightFit, widthFit, maxFontSize].reduce((a, b) => a < b ? a : b);
  return fit.clamp(minFontSize, maxFontSize);
}
