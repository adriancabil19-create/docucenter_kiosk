import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'config.dart';

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
  String _printerState = 'UNKNOWN';
  int _openIncidents = 0;
  int _consecutiveFailures = 0;

  bool get connected => _connected;
  bool get maintenance => _maintenance;
  bool get printingDisabled => _printingDisabled;
  String get printerState => _printerState;
  int get openIncidents => _openIncidents;

  /// Show the offline banner only after connectivity has actually been lost
  /// (two misses in a row) and we were primed with a good response before.
  bool get showOffline => _primed && !_connected;

  void start() {
    if (_started) return;
    _started = true;
    _poll();
    _timer = Timer.periodic(BackendConfig.kioskRuntimePollInterval, (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Force an immediate refresh (e.g. after the user taps "Retry").
  Future<void> refresh() => _poll();

  Future<void> _poll() async {
    try {
      final res = await http
          .get(Uri.parse(BackendConfig.kioskSelfUrl))
          .timeout(const Duration(seconds: 6));

      if (res.statusCode != 200) {
        _registerFailure();
        return;
      }

      final data = json.decode(res.body) as Map<String, dynamic>;
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
      set((data['printer_state'] ?? 'UNKNOWN').toString(), _printerState,
          () => _printerState = (data['printer_state'] ?? 'UNKNOWN').toString());
      set((data['openIncidents'] as num?)?.toInt() ?? 0, _openIncidents,
          () => _openIncidents = (data['openIncidents'] as num?)?.toInt() ?? 0);

      if (changed) notifyListeners();
    } catch (e) {
      debugPrint('KioskRuntime poll failed: $e');
      _registerFailure();
    }
  }

  void _registerFailure() {
    _consecutiveFailures++;
    // Two consecutive misses (~20s) before we call it offline — tolerates a
    // single dropped request without alarming the user.
    if (_consecutiveFailures >= 2 && _connected) {
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
