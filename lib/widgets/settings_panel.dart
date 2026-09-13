import 'package:flutter/material.dart';
import '../settings_service.dart';
import '../strings.dart';

/// Opens the kiosk's accessibility/appearance settings as a modal sheet.
/// Reachable from the header's gear icon on every screen.
void showSettingsPanel(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => const _SettingsSheet(),
  );
}

class _SettingsSheet extends StatelessWidget {
  const _SettingsSheet();

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppSettings.instance,
      builder: (context, _) {
        final settings = AppSettings.instance;
        final colorScheme = Theme.of(context).colorScheme;
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              left: 24,
              right: 24,
              top: 20,
              bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: colorScheme.outlineVariant,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                Text(
                  Strings.t('settings.title'),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 24),

                _SectionLabel(Strings.t('settings.language')),
                const SizedBox(height: 10),
                SegmentedButton<AppLanguage>(
                  segments: [
                    ButtonSegment(
                      value: AppLanguage.en,
                      label: Text(Strings.t('settings.language.en')),
                    ),
                    ButtonSegment(
                      value: AppLanguage.fil,
                      label: Text(Strings.t('settings.language.fil')),
                    ),
                  ],
                  selected: {settings.language},
                  onSelectionChanged: (sel) => settings.setLanguage(sel.first),
                ),
                const SizedBox(height: 24),

                _SectionLabel(Strings.t('settings.theme')),
                const SizedBox(height: 10),
                SegmentedButton<ThemeMode>(
                  segments: [
                    ButtonSegment(
                      value: ThemeMode.light,
                      icon: const Icon(Icons.light_mode_outlined),
                      label: Text(Strings.t('settings.theme.light')),
                    ),
                    ButtonSegment(
                      value: ThemeMode.dark,
                      icon: const Icon(Icons.dark_mode_outlined),
                      label: Text(Strings.t('settings.theme.dark')),
                    ),
                    ButtonSegment(
                      value: ThemeMode.system,
                      icon: const Icon(Icons.smartphone_outlined),
                      label: Text(Strings.t('settings.theme.system')),
                    ),
                  ],
                  selected: {settings.themeMode},
                  onSelectionChanged: (sel) => settings.setThemeMode(sel.first),
                ),
                const SizedBox(height: 24),

                _SectionLabel(Strings.t('settings.textSize')),
                const SizedBox(height: 10),
                SegmentedButton<TextSizeOption>(
                  segments: [
                    ButtonSegment(
                      value: TextSizeOption.normal,
                      label: Text(Strings.t('settings.textSize.normal')),
                    ),
                    ButtonSegment(
                      value: TextSizeOption.large,
                      label: Text(Strings.t('settings.textSize.large')),
                    ),
                    ButtonSegment(
                      value: TextSizeOption.extraLarge,
                      label: Text(Strings.t('settings.textSize.extraLarge')),
                    ),
                  ],
                  selected: {settings.textSize},
                  onSelectionChanged: (sel) => settings.setTextSize(sel.first),
                ),
                const SizedBox(height: 28),

                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(Strings.t('settings.close')),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w600,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
  }
}
