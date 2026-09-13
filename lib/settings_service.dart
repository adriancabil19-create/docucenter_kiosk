import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppLanguage { en, fil }

/// Accessibility text/touch-target size presets, applied app-wide via
/// [AppSettings.textScale] and the button themes built from it.
enum TextSizeOption { normal, large, extraLarge }

extension TextSizeScale on TextSizeOption {
  double get scale {
    switch (this) {
      case TextSizeOption.normal:
        return 1.0;
      case TextSizeOption.large:
        return 1.15;
      case TextSizeOption.extraLarge:
        return 1.3;
    }
  }
}

/// Kiosk-wide user preferences: theme, text/touch-target size, and language.
///
/// A singleton `ChangeNotifier` (same shape as [KioskRuntime]) so the shell
/// in `main.dart` can rebuild the whole [MaterialApp] whenever a preference
/// changes, while persisting the choice so it survives a kiosk restart.
class AppSettings extends ChangeNotifier {
  AppSettings._();
  static final AppSettings instance = AppSettings._();

  ThemeMode themeMode = ThemeMode.light;
  TextSizeOption textSize = TextSizeOption.normal;
  AppLanguage language = AppLanguage.en;

  double get textScale => textSize.scale;

  static const _kTheme = 'settings.themeMode';
  static const _kTextSize = 'settings.textSize';
  static const _kLanguage = 'settings.language';

  bool _loaded = false;

  /// Restores persisted preferences. Safe to call once at startup, before
  /// the first frame — falls back to the defaults above on any failure.
  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final themeIndex = prefs.getInt(_kTheme);
      if (themeIndex != null && themeIndex < ThemeMode.values.length) {
        themeMode = ThemeMode.values[themeIndex];
      }
      final sizeIndex = prefs.getInt(_kTextSize);
      if (sizeIndex != null && sizeIndex < TextSizeOption.values.length) {
        textSize = TextSizeOption.values[sizeIndex];
      }
      final langIndex = prefs.getInt(_kLanguage);
      if (langIndex != null && langIndex < AppLanguage.values.length) {
        language = AppLanguage.values[langIndex];
      }
      notifyListeners();
    } catch (_) {
      // Kiosk still boots fine on defaults if local prefs can't be read.
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (mode == themeMode) return;
    themeMode = mode;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kTheme, mode.index);
    } catch (_) {}
  }

  Future<void> setTextSize(TextSizeOption size) async {
    if (size == textSize) return;
    textSize = size;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kTextSize, size.index);
    } catch (_) {}
  }

  Future<void> setLanguage(AppLanguage lang) async {
    if (lang == language) return;
    language = lang;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kLanguage, lang.index);
    } catch (_) {}
  }
}
