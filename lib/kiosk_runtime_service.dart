import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'config.dart';
import 'paper_tracker_service.dart';

/// Live runtime state for this kiosk, polled from the local backend.
///
/// Drives the offline banner, the maintenance-mode overlay, and the
/// printing-disabled lock. A single instance is shared app-wide; listen to it
/// with [AnimatedBuilder] / [ListenableBuilder].
class KioskRuntime extends ChangeNotifier {
  KioskRuntime._();
  static final KioskRuntime instance = KioskRuntime._();

  Timer? _timer;
  bool _started = false;

  /// True once we have had at least one response, so the UI does not flash the
  /// offline banner during the very first poll on boot.
  bool _primed = false;

  bool _connected = true;
  bool _maintenance = false;
  bool _printingDisabled = false;
  String _printerState = 'OFFLINE';
  int _openIncidents = 0;
  int _consecutiveFailures = 0;

  /// Paper tray levels — event-triggered only (service opened, job
  /// completed, admin refresh, one-time on boot), never on a timer. See
  /// [pollPaperTraysOnce]. Independent of (and never affecting) the
  /// connectivity state above — a stale/unreachable paper-tracker endpoint
  /// should never be mistaken for the kiosk itself going offline.
  List<PaperTray> _trays = [];

  /// Single-flight guard: rapid navigation between screens that each call
  /// [pollPaperTraysOnce] on open must not fire concurrent HTTP requests —
  /// callers arriving while one is in flight get the same pending future.
  Future<void>? _paperTrayPollInFlight;

  /// When the tray levels were last successfully refreshed — shown in the UI
  /// so staff can see how fresh the reading is between event-triggered polls.
  DateTime? _paperTraysCheckedAt;

  /// Per-page prices set by the admin. Defaults match the historical hard-coded
  /// rates so the app is usable before the first poll completes.
  KioskPricing _pricing = KioskPricing.defaults;

  /// Last `reload_at` value seen from the backend. When it changes (after the
  /// first primed poll) the admin has issued a "Restart app" command and the app
  /// should soft-reload — [onReloadRequested] is invoked.
  String? _reloadAt;

  bool get connected => _connected;
  bool get maintenance => _maintenance;
  bool get printingDisabled => _printingDisabled;
  String get printerState => _printerState;
  int get openIncidents => _openIncidents;

  List<PaperTray> get paperTrays => _trays;
  DateTime? get paperTraysCheckedAt => _paperTraysCheckedAt;

  /// True once every tray has reported in and every one of them is at zero —
  /// the point at which a print/copy job can no longer physically go through.
  bool get outOfPaper =>
      _trays.isNotEmpty && _trays.every((t) => t.currentCount <= 0);

  /// True when any tray (but not all) has dropped to/below its low-paper
  /// threshold — a heads-up, not yet a hard block.
  bool get paperRunningLow => !outOfPaper && _trays.any((t) => t.isLow);

  /// Current admin-configured per-page prices. Always non-null (defaults until
  /// the first poll lands).
  KioskPricing get pricing => _pricing;

  /// Set by the app shell. Called when the admin requests a soft reload — the
  /// app should reset to the home screen and re-initialise, without the process
  /// being killed.
  VoidCallback? onReloadRequested;

  /// Show the offline banner only after connectivity has actually been lost
  /// (two misses in a row) and we were primed with a good response before.
  bool get showOffline => _primed && !_connected;

  void start() {
    if (_started) return;
    _started = true;
    _poll();
    _timer = Timer.periodic(BackendConfig.kioskRuntimePollInterval, (_) => _poll());
    // One-time paper-tray reading so the home screen's out-of-paper banner
    // and service lock aren't blank/wrong from launch until a service is
    // opened — NOT a loop; every refresh after this is event-triggered (see
    // pollPaperTraysOnce).
    pollPaperTraysOnce('kiosk_boot');
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Force an immediate refresh (e.g. after the user taps "Retry").
  Future<void> refresh() => _poll();

  Future<void> _poll() async {
    // Paper trays are event-triggered only (see pollPaperTraysOnce) and are
    // deliberately NOT polled here — this loop is for connectivity,
    // maintenance, pricing, and the reload signal only.
    try {
      final res = await http
          .get(Uri.parse(BackendConfig.kioskSelfUrl))
          .timeout(const Duration(seconds: 6));

      if (res.statusCode != 200) {
        _registerFailure();
        return;
      }

      final data = json.decode(res.body) as Map<String, dynamic>;
      final wasPrimed = _primed;
      _consecutiveFailures = 0;
      _primed = true;

      var changed = false;
      void set<T>(T next, T current, void Function() apply) {
        if (next != current) {
          apply();
          changed = true;
        }
      }

      set(true, _connected, () => _connected = true);
      set(data['maintenance'] == true, _maintenance,
          () => _maintenance = data['maintenance'] == true);
      set(data['printing_disabled'] == true, _printingDisabled,
          () => _printingDisabled = data['printing_disabled'] == true);
      final printer = (data['printer_state'] ?? 'OFFLINE').toString().toUpperCase();
      set(printer == 'ONLINE' ? 'ONLINE' : 'OFFLINE', _printerState,
          () => _printerState = printer == 'ONLINE' ? 'ONLINE' : 'OFFLINE');
      set((data['openIncidents'] as num?)?.toInt() ?? 0, _openIncidents,
          () => _openIncidents = (data['openIncidents'] as num?)?.toInt() ?? 0);

      final nextPricing = KioskPricing.fromJson(data['pricing']);
      if (nextPricing.signature != _pricing.signature) {
        _pricing = nextPricing;
        changed = true;
      }

      // "Restart app" downlink: a changed reload_at after the first primed poll
      // means the operator asked for a soft reload.
      final reloadAt = data['reload_at']?.toString();
      if (wasPrimed && reloadAt != null && reloadAt != _reloadAt) {
        _reloadAt = reloadAt;
        debugPrint('KioskRuntime: soft-reload requested (reload_at=$reloadAt)');
        onReloadRequested?.call();
      } else {
        _reloadAt = reloadAt;
      }

      if (changed) notifyListeners();
    } catch (e) {
      debugPrint('KioskRuntime poll failed: $e');
      _registerFailure();
    }
  }

  /// The ONE centralized entry point for refreshing paper tray levels.
  /// Event-triggered only — call this from a specific, meaningful moment
  /// (a service opening, a job completing, an admin refresh), never from a
  /// timer or a widget's build/render path. [reason] identifies that moment
  /// for the backend's [TRAY] logs.
  ///
  /// Single-flight: a poll already in progress is reused rather than firing
  /// a second concurrent request — safe to call from multiple places (e.g.
  /// rapid navigation) without ever overlapping requests.
  Future<void> pollPaperTraysOnce(String reason) {
    final inFlight = _paperTrayPollInFlight;
    if (inFlight != null) return inFlight;
    final future = _doPollPaperTraysOnce(reason);
    _paperTrayPollInFlight = future;
    future.whenComplete(() => _paperTrayPollInFlight = null);
    return future;
  }

  Future<void> _doPollPaperTraysOnce(String reason) async {
    // PaperTrackerService already catches its own errors and returns [] on
    // failure. One bounded retry for a transient hiccup (per spec: never
    // retry indefinitely) — then accept it and keep the last known-good
    // levels rather than flapping outOfPaper on/off.
    var trays = await PaperTrackerService.getTrays(reason: reason);
    if (trays.isEmpty) {
      await Future.delayed(const Duration(milliseconds: 500));
      trays = await PaperTrackerService.getTrays(reason: '$reason (retry)');
    }
    if (trays.isEmpty) return;

    _paperTraysCheckedAt = DateTime.now();
    if (_traysChanged(trays)) _trays = trays;
    notifyListeners();
  }

  bool _traysChanged(List<PaperTray> next) {
    if (next.length != _trays.length) return true;
    for (var i = 0; i < next.length; i++) {
      final a = next[i];
      final b = _trays[i];
      if (a.trayName != b.trayName ||
          a.currentCount != b.currentCount ||
          a.maxCapacity != b.maxCapacity ||
          a.threshold != b.threshold) {
        return true;
      }
    }
    return false;
  }

  void _registerFailure() {
    _consecutiveFailures++;
    // Three consecutive misses (~9s at the 3s poll) before we call it offline —
    // tolerates a couple of dropped requests without alarming the user.
    if (_consecutiveFailures >= 3 && _connected) {
      _connected = false;
      notifyListeners();
    }
  }

  /// Report a structured device/error incident to the backend, which forwards
  /// it to the cloud dashboard. Fire-and-forget; never throws.
  static Future<void> reportIncident({
    required String device,
    required String errorCode,
    required String message,
    String severity = 'warning',
    Map<String, dynamic>? metadata,
  }) async {
    try {
      await http
          .post(
            Uri.parse(BackendConfig.kioskIncidentUrl),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({
              'device': device,
              'error_code': errorCode,
              'severity': severity,
              'message': message,
              if (metadata != null) 'metadata': metadata,
            }),
          )
          .timeout(const Duration(seconds: 6));
    } catch (e) {
      debugPrint('reportIncident failed: $e');
    }
  }
}

/// Per-page price for one colour mode (pesos).
class PagePrice {
  final double bw;
  final double color;
  const PagePrice(this.bw, this.color);

  /// Price for the given mode string ('color' → colour, anything else → B&W).
  double forMode(String colorMode) => colorMode == 'color' ? color : bw;

  factory PagePrice.fromJson(dynamic j, PagePrice fallback) {
    if (j is! Map) return fallback;
    double pick(String k, double f) {
      final v = j[k];
      return v is num && v >= 0 ? v.toDouble() : f;
    }

    return PagePrice(pick('bw', fallback.bw), pick('color', fallback.color));
  }
}

/// The three quality tiers, each priced per colour mode.
class QualityTierPrices {
  final PagePrice draft;
  final PagePrice standard;
  final PagePrice high;

  const QualityTierPrices({required this.draft, required this.standard, required this.high});

  /// Price for a quality tier ('draft'|'standard'|'high').
  PagePrice tier(String quality) =>
      quality == 'high' ? high : quality == 'draft' ? draft : standard;

  factory QualityTierPrices.fromJson(dynamic j, QualityTierPrices fallback) {
    if (j is! Map) return fallback;
    return QualityTierPrices(
      draft: PagePrice.fromJson(j['draft'], fallback.draft),
      standard: PagePrice.fromJson(j['standard'], fallback.standard),
      high: PagePrice.fromJson(j['high'], fallback.high),
    );
  }

  String get signature =>
      '${draft.bw}/${draft.color}|${standard.bw}/${standard.color}|${high.bw}/${high.color}';
}

/// Paper sizes the kiosk offers for printing — mirrors the picker in
/// printing_page.dart and PAPER_SIZES in backend/src/database.ts.
const List<String> kPrintPaperSizes = ['A4', 'Folio', 'Letter'];

/// The kiosk price list, mirrored from the admin. Scanning is free and absent.
///
/// Printing is priced per paper size (each with its own three quality
/// tiers); photocopying is not size-dependent and keeps one set of tiers.
class KioskPricing {
  final Map<String, QualityTierPrices> print;
  final QualityTierPrices photocopy;

  const KioskPricing({required this.print, required this.photocopy});

  /// Historical hard-coded rates — used until the first poll and as field
  /// fallbacks for anything the backend omits.
  static const QualityTierPrices _defaultPrintTiers =
      QualityTierPrices(draft: PagePrice(1.5, 2), standard: PagePrice(2, 3), high: PagePrice(2.5, 4));

  static const KioskPricing defaults = KioskPricing(
    print: {'A4': _defaultPrintTiers, 'Folio': _defaultPrintTiers, 'Letter': _defaultPrintTiers},
    photocopy: QualityTierPrices(draft: PagePrice(1, 3), standard: PagePrice(2, 4), high: PagePrice(3, 5)),
  );

  /// Per-page price for printing at a quality tier, for the given paper
  /// size. Falls back to A4 pricing if the size is unrecognized.
  PagePrice printTier(String quality, String paperSize) =>
      (print[paperSize] ?? print['A4'] ?? _defaultPrintTiers).tier(quality);

  /// Per-page price for photocopying at a quality tier ('high'|'standard'|'draft').
  PagePrice copyTier(String quality) => photocopy.tier(quality);

  factory KioskPricing.fromJson(dynamic j) {
    if (j is! Map) return defaults;
    final p = j['print'];
    final c = j['photocopy'];
    Map? m(dynamic x) => x is Map ? x : null;
    final printMap = <String, QualityTierPrices>{
      for (final size in kPrintPaperSizes)
        size: QualityTierPrices.fromJson(m(p)?[size], defaults.print[size]!),
    };
    return KioskPricing(
      print: printMap,
      photocopy: QualityTierPrices.fromJson(m(c), defaults.photocopy),
    );
  }

  /// Compact value key for cheap change detection.
  String get signature =>
      '${kPrintPaperSizes.map((s) => print[s]?.signature).join('|')}|${photocopy.signature}';
}
