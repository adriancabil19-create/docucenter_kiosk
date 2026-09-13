import 'settings_service.dart';

/// Lightweight EN/Filipino string table for the kiosk shell — the header,
/// home hero, footer, idle screen, service picker, and settings panel.
///
/// Deeper task screens (printing/scanning/photocopying/payment forms, About
/// and Legal content) are English-only for now: translating that much
/// technical/legal text accurately is out of scope for this pass, so it
/// isn't included here to avoid a half-translated page mixing languages.
class Strings {
  const Strings._();

  static const Map<String, Map<AppLanguage, String>> _t = {
    // Header
    'nav.home': {AppLanguage.en: 'Home', AppLanguage.fil: 'Home'},
    'nav.services': {AppLanguage.en: 'Services', AppLanguage.fil: 'Serbisyo'},
    'nav.about': {AppLanguage.en: 'About', AppLanguage.fil: 'Tungkol'},
    'nav.legal': {AppLanguage.en: 'Legal', AppLanguage.fil: 'Legal'},
    'header.settings': {AppLanguage.en: 'Settings', AppLanguage.fil: 'Mga Setting'},
    'header.openMenu': {AppLanguage.en: 'Open navigation menu', AppLanguage.fil: 'Buksan ang menu'},
    'header.closeMenu': {AppLanguage.en: 'Close navigation menu', AppLanguage.fil: 'Isara ang menu'},

    // Home hero
    'home.title': {AppLanguage.en: 'DOCUCENTER Kiosk', AppLanguage.fil: 'DOCUCENTER Kiosk'},
    'home.subtitle': {
      AppLanguage.en: 'Self-Service Document Processing Station',
      AppLanguage.fil: 'Self-Service na Istasyon ng Dokumento',
    },
    'home.description': {
      AppLanguage.en:
          'Print, scan, and photocopy documents at the kiosk, with staff-side device monitoring and cashless payment',
      AppLanguage.fil:
          'Mag-print, mag-scan, at magpa-photocopy ng mga dokumento sa kiosk, na may cashless na bayad',
    },
    'home.cta': {AppLanguage.en: 'Try Our Services', AppLanguage.fil: 'Subukan ang Serbisyo'},
    'home.badge.printing': {AppLanguage.en: 'Printing', AppLanguage.fil: 'Pag-print'},
    'home.badge.scanning': {AppLanguage.en: 'Scanning', AppLanguage.fil: 'Pag-scan'},
    'home.badge.photocopying': {AppLanguage.en: 'Photocopying', AppLanguage.fil: 'Photocopy'},

    // Footer
    'footer.kiosk.title': {AppLanguage.en: 'DOCUCENTER Kiosk', AppLanguage.fil: 'DOCUCENTER Kiosk'},
    'footer.university.title': {AppLanguage.en: 'University', AppLanguage.fil: 'Unibersidad'},
    'footer.project.title': {AppLanguage.en: 'Project Information', AppLanguage.fil: 'Impormasyon ng Proyekto'},
    'footer.operator.title': {AppLanguage.en: 'Operator', AppLanguage.fil: 'Operator'},
    'footer.privacy': {AppLanguage.en: 'Privacy Policy', AppLanguage.fil: 'Patakaran sa Privacy'},
    'footer.terms': {AppLanguage.en: 'Terms & Conditions', AppLanguage.fil: 'Tuntunin at Kundisyon'},
    'footer.cookies': {AppLanguage.en: 'Cookie Policy', AppLanguage.fil: 'Patakaran sa Cookie'},
    'footer.refund': {AppLanguage.en: 'Refund Policy', AppLanguage.fil: 'Patakaran sa Refund'},

    // Idle screen
    'idle.subtitle': {
      AppLanguage.en: 'Self-Service Document Processing Station',
      AppLanguage.fil: 'Self-Service na Istasyon ng Dokumento',
    },
    'idle.tap': {AppLanguage.en: 'Touch the Screen to Continue', AppLanguage.fil: 'Pindutin ang Screen para Magpatuloy'},
    'idle.print': {AppLanguage.en: 'Print', AppLanguage.fil: 'I-print'},
    'idle.scan': {AppLanguage.en: 'Scan', AppLanguage.fil: 'I-scan'},
    'idle.copy': {AppLanguage.en: 'Copy', AppLanguage.fil: 'Kopyahin'},

    // Services picker
    'services.heading': {
      AppLanguage.en: 'Document Processing Services',
      AppLanguage.fil: 'Mga Serbisyo sa Dokumento',
    },
    'services.subheading': {
      AppLanguage.en: 'Choose a service to get started',
      AppLanguage.fil: 'Pumili ng serbisyo para magsimula',
    },
    'services.printing.title': {AppLanguage.en: 'Printing', AppLanguage.fil: 'Pag-print'},
    'services.printing.subtitle': {
      AppLanguage.en: 'Print documents & images',
      AppLanguage.fil: 'Mag-print ng dokumento at larawan',
    },
    'services.scanning.title': {AppLanguage.en: 'Scanning', AppLanguage.fil: 'Pag-scan'},
    'services.scanning.subtitle': {
      AppLanguage.en: 'Digitize physical documents',
      AppLanguage.fil: 'I-digitize ang mga dokumento',
    },
    'services.photocopying.title': {AppLanguage.en: 'Photocopying', AppLanguage.fil: 'Photocopy'},
    'services.photocopying.subtitle': {
      AppLanguage.en: 'Make copies of documents',
      AppLanguage.fil: 'Gumawa ng kopya ng dokumento',
    },
    'services.storage.title': {AppLanguage.en: 'Storage', AppLanguage.fil: 'Imbakan'},
    'services.storage.subtitle': {
      AppLanguage.en: 'View saved documents',
      AppLanguage.fil: 'Tingnan ang naka-save na dokumento',
    },
    'services.backToServices': {AppLanguage.en: 'Back to Services', AppLanguage.fil: 'Bumalik sa Serbisyo'},

    // Settings panel
    'settings.title': {AppLanguage.en: 'Settings', AppLanguage.fil: 'Mga Setting'},
    'settings.language': {AppLanguage.en: 'Language', AppLanguage.fil: 'Wika'},
    'settings.language.en': {AppLanguage.en: 'English', AppLanguage.fil: 'Ingles'},
    'settings.language.fil': {AppLanguage.en: 'Filipino', AppLanguage.fil: 'Filipino'},
    'settings.theme': {AppLanguage.en: 'Appearance', AppLanguage.fil: 'Anyo'},
    'settings.theme.light': {AppLanguage.en: 'Light', AppLanguage.fil: 'Maliwanag'},
    'settings.theme.dark': {AppLanguage.en: 'Dark', AppLanguage.fil: 'Madilim'},
    'settings.theme.system': {AppLanguage.en: 'System', AppLanguage.fil: 'Sistema'},
    'settings.textSize': {AppLanguage.en: 'Text & Button Size', AppLanguage.fil: 'Laki ng Teksto at Buton'},
    'settings.textSize.normal': {AppLanguage.en: 'Normal', AppLanguage.fil: 'Normal'},
    'settings.textSize.large': {AppLanguage.en: 'Large', AppLanguage.fil: 'Malaki'},
    'settings.textSize.extraLarge': {AppLanguage.en: 'Extra Large', AppLanguage.fil: 'Sobrang Laki'},
    'settings.close': {AppLanguage.en: 'Done', AppLanguage.fil: 'Tapos'},
  };

  static String t(String key) {
    final entry = _t[key];
    if (entry == null) return key;
    return entry[AppSettings.instance.language] ?? entry[AppLanguage.en] ?? key;
  }
}
