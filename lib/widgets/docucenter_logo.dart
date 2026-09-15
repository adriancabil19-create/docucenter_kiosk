import 'package:flutter/material.dart';

/// DocuCenter brand mark: a printer glyph with a curling CMYK paper ribbon
/// and a soft rainbow glow, drawn on a 64x64 logical grid and scaled to
/// [size]. Mirrors the mark used in the admin web app
/// (admin/components/logo.tsx) so the brand stays consistent across
/// platforms without shipping an image asset.
class DocucenterLogoMark extends StatelessWidget {
  const DocucenterLogoMark({super.key, this.size = 32});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _LogoMarkPainter()),
    );
  }
}

class _LogoMarkPainter extends CustomPainter {
  static const _navy = Color(0xFF12263F);
  static const _cyan = Color(0xFF29B6E8);
  static const _magenta = Color(0xFFEC4899);
  static const _yellow = Color(0xFFFBBF24);

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 64;
    canvas.save();
    canvas.scale(scale, scale);

    final navyStroke = Paint()
      ..color = _navy
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final navyFill = Paint()..color = _navy;
    final white = Paint()..color = Colors.white;

    // Soft rainbow glow behind the emerging paper.
    final glowRect = Rect.fromCenter(center: const Offset(30, 52), width: 30, height: 22);
    final glow = Paint()
      ..shader = RadialGradient(colors: [
        _magenta.withValues(alpha: 0.55),
        _cyan.withValues(alpha: 0.28),
        _yellow.withValues(alpha: 0.0),
      ], stops: const [0.0, 0.55, 1.0]).createShader(glowRect)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawOval(glowRect, glow);

    // Curling CMYK paper ribbon, emerging from the printer's front slot.
    canvas.save();
    canvas.translate(28, 37);
    canvas.rotate(14 * 3.1415926535 / 180);
    final paperRect = RRect.fromRectAndRadius(
      const Rect.fromLTWH(-7, 0, 14, 23),
      const Radius.circular(4),
    );
    final paperPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [_cyan, _magenta, _yellow],
      ).createShader(const Rect.fromLTWH(-7, 0, 14, 23));
    canvas.drawRRect(paperRect, paperPaint);
    canvas.restore();

    // Printer tray + body.
    final tray = RRect.fromRectAndRadius(
      const Rect.fromLTWH(21, 8, 18, 14),
      const Radius.circular(3),
    );
    canvas.drawRRect(tray, white);
    canvas.drawRRect(tray, navyStroke..strokeWidth = 2.2);

    final body = RRect.fromRectAndRadius(
      const Rect.fromLTWH(9, 19, 46, 22),
      const Radius.circular(5),
    );
    canvas.drawRRect(body, white);
    canvas.drawRRect(body, navyStroke..strokeWidth = 2.2);

    // Control panel.
    final panel = RRect.fromRectAndRadius(
      const Rect.fromLTWH(15, 25, 12, 6),
      const Radius.circular(1.5),
    );
    canvas.drawRRect(panel, white);
    canvas.drawRRect(panel, navyStroke..strokeWidth = 1.5);
    canvas.drawCircle(const Offset(34, 28), 2, navyFill);
    canvas.drawCircle(const Offset(40, 28), 2, navyFill);

    // Vents.
    final ventStroke = navyStroke..strokeWidth = 1.5;
    canvas.drawLine(const Offset(46, 24), const Offset(46, 36), ventStroke);
    canvas.drawLine(const Offset(49, 24), const Offset(49, 36), ventStroke);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LogoMarkPainter oldDelegate) => false;
}
