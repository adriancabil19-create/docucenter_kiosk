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
    'nav.howItWorks': {AppLanguage.en: 'How It Works', AppLanguage.fil: 'Paano Gumagana'},
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
    'services.imagePrint.title': {AppLanguage.en: 'Print Photos', AppLanguage.fil: 'I-print ang Larawan'},
    'services.backToServices': {AppLanguage.en: 'Back to Services', AppLanguage.fil: 'Bumalik sa Serbisyo'},
    'services.backToPrinting': {AppLanguage.en: 'Back to Printing', AppLanguage.fil: 'Bumalik sa Pag-print'},
    'services.backToImagePrint': {AppLanguage.en: 'Back to Image Print', AppLanguage.fil: 'Bumalik sa Pag-print ng Larawan'},

    // How It Works — idle-screen showcase + interactive tutorial tab
    'tutorial.heading': {AppLanguage.en: 'How Does This Work?', AppLanguage.fil: 'Paano Ito Gumagana?'},
    'tutorial.subheading': {
      AppLanguage.en: '3 simple steps to get started with each service',
      AppLanguage.fil: '3 simpleng hakbang para makapagsimula sa bawat serbisyo',
    },
    'tutorial.stepLabel': {AppLanguage.en: 'Step', AppLanguage.fil: 'Hakbang'},
    'tutorial.tryService': {AppLanguage.en: 'Try This Service', AppLanguage.fil: 'Subukan ang Serbisyong Ito'},
    'tutorial.resetsIn': {AppLanguage.en: 'Next step in', AppLanguage.fil: 'Susunod na hakbang sa'},

    'tutorial.printing.step1.title': {AppLanguage.en: 'Choose your file', AppLanguage.fil: 'Pumili ng file'},
    'tutorial.printing.step1.desc': {
      AppLanguage.en: 'Pick a document from Storage or plug in a USB drive.',
      AppLanguage.fil: 'Pumili ng dokumento mula sa Storage o mag-plug ng USB drive.',
    },
    'tutorial.printing.step2.title': {AppLanguage.en: 'Set your options', AppLanguage.fil: 'I-set ang mga option'},
    'tutorial.printing.step2.desc': {
      AppLanguage.en: 'Pick paper size, color mode, quality, and number of copies.',
      AppLanguage.fil: 'Pumili ng paper size, kulay, kalidad, at bilang ng kopya.',
    },
    'tutorial.printing.step3.title': {AppLanguage.en: 'Pay & print', AppLanguage.fil: 'Magbayad at i-print'},
    'tutorial.printing.step3.desc': {
      AppLanguage.en: 'Confirm the cost, pay cashless, and collect your printout.',
      AppLanguage.fil: 'Kumpirmahin ang bayad, mag-cashless, at kunin ang iyong printout.',
    },

    'tutorial.scanning.step1.title': {AppLanguage.en: 'Load your document', AppLanguage.fil: 'Ilagay ang dokumento'},
    'tutorial.scanning.step1.desc': {
      AppLanguage.en: 'Place your paper document in the feeder or on the glass.',
      AppLanguage.fil: 'Ilagay ang iyong papel sa feeder o sa salamin.',
    },
    'tutorial.scanning.step2.title': {AppLanguage.en: 'Scan your pages', AppLanguage.fil: 'I-scan ang mga pahina'},
    'tutorial.scanning.step2.desc': {
      AppLanguage.en: 'Tap Start Scanning and add more pages if you need to.',
      AppLanguage.fil: 'Pindutin ang Start Scanning at magdagdag pa ng pahina kung kailangan.',
    },
    'tutorial.scanning.step3.title': {AppLanguage.en: 'Save your file', AppLanguage.fil: 'I-save ang file'},
    'tutorial.scanning.step3.desc': {
      AppLanguage.en: 'Save the scanned pages as a PDF to Storage — scanning is free.',
      AppLanguage.fil: 'I-save ang na-scan bilang PDF sa Storage — libre ang pag-scan.',
    },

    'tutorial.photocopying.step1.title': {AppLanguage.en: 'Load your document', AppLanguage.fil: 'Ilagay ang dokumento'},
    'tutorial.photocopying.step1.desc': {
      AppLanguage.en: 'Place your paper document in the feeder or on the glass.',
      AppLanguage.fil: 'Ilagay ang iyong papel sa feeder o sa salamin.',
    },
    'tutorial.photocopying.step2.title': {AppLanguage.en: 'Set your options', AppLanguage.fil: 'I-set ang mga option'},
    'tutorial.photocopying.step2.desc': {
      AppLanguage.en: 'Pick quality, color mode, and number of copies.',
      AppLanguage.fil: 'Pumili ng kalidad, kulay, at bilang ng kopya.',
    },
    'tutorial.photocopying.step3.title': {AppLanguage.en: 'Pay & copy', AppLanguage.fil: 'Magbayad at kopyahin'},
    'tutorial.photocopying.step3.desc': {
      AppLanguage.en: 'Confirm the cost, pay cashless, and collect your copies.',
      AppLanguage.fil: 'Kumpirmahin ang bayad, mag-cashless, at kunin ang iyong mga kopya.',
    },

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

    // Printing page
    'printing.heading': {AppLanguage.en: 'Printing Service', AppLanguage.fil: 'Serbisyo ng Pag-print'},
    'printing.subheading': {
      AppLanguage.en: 'Configure your print settings and choose documents from storage',
      AppLanguage.fil: 'I-set up ang iyong print settings at pumili ng dokumento mula sa storage',
    },
    'printing.documents': {AppLanguage.en: 'Documents', AppLanguage.fil: 'Mga Dokumento'},
    'printing.browseStorage': {AppLanguage.en: 'Browse Storage', AppLanguage.fil: 'Tingnan ang Storage'},
    'printing.noDocsSelected': {AppLanguage.en: 'No documents selected yet', AppLanguage.fil: 'Wala pang napiling dokumento'},
    'printing.docsSelected': {
      AppLanguage.en: 'document(s) selected from storage',
      AppLanguage.fil: 'dokumentong napili mula sa storage',
    },
    'printing.storageHint': {
      AppLanguage.en:
          'Add documents from the Storage tab (scan or receive from your phone via QR), then pick them here.',
      AppLanguage.fil:
          'Magdagdag ng dokumento sa Storage tab (i-scan o tanggapin mula sa telepono gamit ang QR), tapos piliin dito.',
    },
    'printing.disclaimer': {
      AppLanguage.en:
          'You are responsible for having the right to copy these files. Files are used only for this job and are deleted afterwards (within 24 hours).',
      AppLanguage.fil:
          'Ikaw ang responsable na may karapatan kang kopyahin ang mga file na ito. Gagamitin lamang ito para sa job na ito at bubura pagkatapos (sa loob ng 24 oras).',
    },
    'printing.estimatedCost': {AppLanguage.en: 'Estimated Cost:', AppLanguage.fil: 'Tinatayang Halaga:'},
    'printing.printSettings': {AppLanguage.en: 'Print Settings', AppLanguage.fil: 'Mga Setting ng Pag-print'},
    'printing.paperSize': {AppLanguage.en: 'Paper Size', AppLanguage.fil: 'Sukat ng Papel'},
    'printing.colorMode': {AppLanguage.en: 'Color Mode', AppLanguage.fil: 'Mode ng Kulay'},
    'printing.quality': {AppLanguage.en: 'Print Quality', AppLanguage.fil: 'Kalidad ng Print'},
    'printing.bw': {AppLanguage.en: 'Black & White', AppLanguage.fil: 'Itim at Puti'},
    'printing.color': {AppLanguage.en: 'Color', AppLanguage.fil: 'Makulay'},
    'printing.copies': {AppLanguage.en: 'Number of Copies:', AppLanguage.fil: 'Bilang ng Kopya:'},
    'printing.preview': {AppLanguage.en: 'Preview Pages', AppLanguage.fil: 'I-preview ang mga Pahina'},
    'printing.start': {AppLanguage.en: 'Start Printing', AppLanguage.fil: 'Simulan ang Pag-print'},
    'printing.copy': {AppLanguage.en: 'copy', AppLanguage.fil: 'kopya'},
    'printing.copiesShort': {AppLanguage.en: 'copies', AppLanguage.fil: 'kopya'},
    'printing.pages': {AppLanguage.en: 'pages', AppLanguage.fil: 'pahina'},
  };

  static String t(String key) {
    final entry = _t[key];
    if (entry == null) return key;
    return entry[AppSettings.instance.language] ?? entry[AppLanguage.en] ?? key;
  }
}
