import 'package:flutter/material.dart';

class AboutPage extends StatefulWidget {
  final ValueChanged<String> onNavigate;

  const AboutPage({super.key, required this.onNavigate});

  @override
  State<AboutPage> createState() => _AboutPageState();
}

class _AboutPageState extends State<AboutPage> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..forward();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Staggered entrance: each section fades and slides up a little after the
  /// previous one, driven off one shared controller (not a per-widget timer).
  Widget _reveal(int index, Widget child) {
    final start = (index * 0.1).clamp(0.0, 0.6);
    final anim = CurvedAnimation(
      parent: _controller,
      curve: Interval(start, (start + 0.4).clamp(0.0, 1.0), curve: Curves.easeOut),
    );
    return AnimatedBuilder(
      animation: anim,
      builder: (context, c) => Opacity(
        opacity: anim.value,
        child: Transform.translate(offset: Offset(0, (1 - anim.value) * 14), child: c),
      ),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Center wraps this specifically because the outer Column here
          // uses crossAxisAlignment.start (everything else on the page is
          // left-aligned cards) — the Hero's own Text widgets center THEIR
          // text, but that centered text sits inside a Column that shrinks
          // to its content width, so without this it still hugs the left
          // margin instead of sitting in the middle of the full page width.
          Center(child: _reveal(0, _buildHero(context))),
          const SizedBox(height: 20),

          _reveal(1, _buildIntroSection(context)),
          const SizedBox(height: 16),

          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _reveal(2, _buildWhatYouCanDoSection(context))),
                const SizedBox(width: 16),
                Expanded(
                  child: _reveal(
                    2,
                    _buildInfoGridSection(context, 'University', [
                      ('Institution', 'University of Cebu'),
                      ('Campus', 'Lapu-Lapu and Mandaue'),
                      ('Program', 'BS in Computer Engineering'),
                      ('Academic Year', '2025–2026'),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          _reveal(3, _buildTeamSection(context)),
          const SizedBox(height: 20),

          // Minimal operator/legal line instead of a full card — the nav
          // bar's own "Legal" tab is the real destination for this, so this
          // just needs to exist, not compete for attention.
          Center(
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              children: [
                Text(
                  '© 2025–2026 DocuCenter · Charles Adrian L. Cabil · adriancabil12@gmail.com ·',
                  style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
                ),
                InkWell(
                  onTap: () => widget.onNavigate('legal'),
                  child: Text(
                    'Legal & Privacy',
                    style: TextStyle(
                      fontSize: 11,
                      color: colorScheme.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  // ── Hero ─────────────────────────────────────────────────────────────────

  Widget _buildHero(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Text(
          'DOCUCENTER Kiosk',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: colorScheme.primary,
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 6),
        Text(
          'Self-Service Printing  •  Photocopying  •  Scanning',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 14),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: Text(
            'A self-service document processing station designed for students, faculty, '
            'and staff of the University of Cebu.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  height: 1.5,
                ),
          ),
        ),
        const SizedBox(height: 20),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          runSpacing: 12,
          children: [
            _serviceChip(context, Icons.print_outlined, 'Printing'),
            _serviceChip(context, Icons.content_copy_outlined, 'Photocopying'),
            _serviceChip(context, Icons.document_scanner_outlined, 'Scanning'),
          ],
        ),
      ],
    );
  }

  Widget _serviceChip(BuildContext context, IconData icon, String label) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        color: colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20, color: colorScheme.onPrimaryContainer),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: colorScheme.onPrimaryContainer,
            ),
          ),
        ],
      ),
    );
  }

  // ── Shared card chrome ───────────────────────────────────────────────────

  /// Every card on this page uses this instead of a bare Card — Material 3's
  /// default Card in this theme is a near-flat tonal fill with almost no
  /// shadow. A real white surface, a crisp hairline border, and a soft drop
  /// shadow give it actual depth instead of reading as pale/washed out.
  Widget _cardWrap(BuildContext context, Widget child) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colorScheme.outlineVariant.withValues(alpha: 0.6)),
        boxShadow: [
          BoxShadow(
            color: colorScheme.shadow.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _sectionHeader(BuildContext context, String title, IconData icon) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: colorScheme.primaryContainer,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 16, color: colorScheme.onPrimaryContainer),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  // ── About DOCUCENTER ─────────────────────────────────────────────────────

  Widget _buildIntroSection(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return _cardWrap(
      context,
      Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, 'About DOCUCENTER', Icons.info_outline),
            const SizedBox(height: 12),
            Text(
              'DOCUCENTER is a self-service document processing kiosk developed as an '
              'undergraduate thesis project under the BS Computer Engineering program of '
              'the University of Cebu. It is currently a working prototype under pilot '
              'evaluation, not a commercial service.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurface,
                    height: 1.5,
                  ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _badge(context, 'BS Computer Engineering'),
                _badge(context, '2025–2026'),
                _badge(context, 'Thesis Prototype'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _badge(BuildContext context, String label) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: colorScheme.onSecondaryContainer,
        ),
      ),
    );
  }

  // ── What You Can Do ──────────────────────────────────────────────────────

  Widget _buildWhatYouCanDoSection(BuildContext context) {
    final items = [
      (Icons.print_outlined, 'Print Documents', 'Print documents in black & white or color.'),
      (Icons.content_copy_outlined, 'Photocopy Documents', 'Create copies directly from the kiosk.'),
      (Icons.document_scanner_outlined, 'Scan Documents', 'Scan documents and save them digitally.'),
      (Icons.payment_outlined, 'Secure Payment', 'Complete transactions through supported online payment methods.'),
    ];

    return _cardWrap(
      context,
      Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, 'What DOCUCENTER Provides', Icons.checklist_outlined),
            const SizedBox(height: 14),
            for (var i = 0; i < items.length; i++) ...[
              _buildCapabilityRow(context, items[i].$1, items[i].$2, items[i].$3),
              if (i != items.length - 1) const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCapabilityRow(BuildContext context, IconData icon, String title, String desc) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 18, color: colorScheme.onPrimaryContainer),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              Text(
                desc,
                style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant, height: 1.3),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── University ───────────────────────────────────────────────────────────

  Widget _buildInfoField((String, String) field) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(field.$1, style: TextStyle(fontSize: 10, color: colorScheme.onSurfaceVariant)),
        Text(field.$2, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _buildInfoGridSection(
    BuildContext context,
    String title,
    List<(String, String)> fields,
  ) {
    return _cardWrap(
      context,
      Padding(
        padding: const EdgeInsets.all(20),
        // This card sits next to "What DOCUCENTER Provides", which has more
        // content and is taller — both are stretched to match
        // (IntrinsicHeight) so their borders line up instead of one trailing
        // off short. Centering the header+fields as ONE block (not pinning
        // the header to the top and only centering the fields below it)
        // is what actually reads as centered in the taller card.
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sectionHeader(context, title, Icons.apartment_outlined),
              const SizedBox(height: 14),
              for (var i = 0; i < fields.length; i += 2)
                Padding(
                  padding: EdgeInsets.only(bottom: i + 2 < fields.length ? 16 : 0),
                  child: SizedBox(
                    // Row defaults to mainAxisSize.max, so with Expanded
                    // children it naturally claims the Center's full loose
                    // width — this SizedBox just makes that explicit instead
                    // of relying on that behavior implicitly three widgets away.
                    width: double.infinity,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _buildInfoField(fields[i])),
                        if (i + 1 < fields.length) ...[
                          const SizedBox(width: 12),
                          Expanded(child: _buildInfoField(fields[i + 1])),
                        ],
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Research Team ────────────────────────────────────────────────────────

  Widget _buildTeamSection(BuildContext context) {
    final team = [
      ('Charles Adrian L. Cabil', 'Lead Researcher & Developer'),
      ('Mark Lee Duyag', 'Co-Researcher'),
      ('Ignacio Maurice Vergara', 'Co-Researcher'),
      ('Engr. Darwin Espera', 'Thesis Adviser'),
    ];

    return _cardWrap(
      context,
      Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionHeader(context, 'Research Team', Icons.groups_outlined),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < team.length; i++) ...[
                  if (i != 0) const SizedBox(width: 10),
                  Expanded(child: _buildTeamMember(context, team[i].$1, team[i].$2)),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamMember(BuildContext context, String name, String role) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border(top: BorderSide(color: colorScheme.primary, width: 3)),
        boxShadow: [
          BoxShadow(
            color: colorScheme.shadow.withValues(alpha: 0.05),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: colorScheme.primaryContainer,
            child: Icon(Icons.person_outline, size: 16, color: colorScheme.onPrimaryContainer),
          ),
          const SizedBox(height: 8),
          Text(
            name,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
            maxLines: 2,
          ),
          Text(
            role,
            style: TextStyle(fontSize: 10, color: colorScheme.onSurfaceVariant),
            maxLines: 2,
          ),
        ],
      ),
    );
  }
}
