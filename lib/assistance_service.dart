import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'config.dart';

/// Status values mirrored from the backend's `assistance_requests.status`.
enum AssistanceStatus { pending, acknowledged, resolved, cancelled, expired }

AssistanceStatus? _parseStatus(String? s) {
  switch (s) {
    case 'PENDING':
      return AssistanceStatus.pending;
    case 'ACKNOWLEDGED':
      return AssistanceStatus.acknowledged;
    case 'RESOLVED':
      return AssistanceStatus.resolved;
    case 'CANCELLED':
      return AssistanceStatus.cancelled;
    case 'EXPIRED':
      return AssistanceStatus.expired;
    default:
      return null;
  }
}

/// Outcome of a create attempt — distinct reasons so the UI can show an
/// honest, specific message instead of a generic failure (rule 28/40).
enum CreateOutcome { success, activeExists, cooldown, rateLimited, networkError }

class CreateResult {
  final CreateOutcome outcome;
  final int? retryAfterSeconds;
  const CreateResult(this.outcome, {this.retryAfterSeconds});
}

/// Live state of this kiosk's own "Ask for Assistance" request, polled from
/// the local backend. A single instance is shared app-wide — same pattern as
/// [KioskRuntime] in kiosk_runtime_service.dart.
class AssistanceState extends ChangeNotifier {
  AssistanceState._();
  static final AssistanceState instance = AssistanceState._();

  Timer? _timer;
  bool _started = false;

  String? _requestId;
  AssistanceStatus? _status;
  DateTime? _lastCreateAttempt;

  String? get requestId => _requestId;
  AssistanceStatus? get status => _status;

  /// True while a request is open and still waiting on/being handled by staff.
  bool get isActive => _status == AssistanceStatus.pending || _status == AssistanceStatus.acknowledged;

  void start() {
    if (_started) return;
    _started = true;
    _poll();
    _timer = Timer.periodic(BackendConfig.assistancePollInterval, (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final res = await http
          .get(Uri.parse('${BackendConfig.assistanceApiUrl}/active'))
          .timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return;
      final data = json.decode(res.body) as Map<String, dynamic>;
      final request = data['request'] as Map<String, dynamic>?;
      final nextId = request?['id'] as String?;
      final nextStatus = _parseStatus(request?['status'] as String?);
      if (nextId != _requestId || nextStatus != _status) {
        _requestId = nextId;
        _status = nextStatus;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('AssistanceState poll failed: $e');
    }
  }

  /// Ask staff for assistance. Server-enforced cooldown/rate-limit/one-active
  /// rule (rules 18/19) — this is a courtesy client-side guard only, not the
  /// source of truth.
  Future<CreateResult> requestAssistance({String? message}) async {
    _lastCreateAttempt = DateTime.now();
    try {
      final res = await http
          .post(
            Uri.parse(BackendConfig.assistanceApiUrl),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({if (message != null && message.trim().isNotEmpty) 'message': message.trim()}),
          )
          .timeout(const Duration(seconds: 8));

      final data = jsonDecodeOrNull(res.body);
      if (res.statusCode == 200 && data?['success'] == true) {
        await _poll();
        return const CreateResult(CreateOutcome.success);
      }
      final error = data?['error'] as String?;
      if (res.statusCode == 409 && error == 'ACTIVE_EXISTS') {
        await _poll();
        return const CreateResult(CreateOutcome.activeExists);
      }
      if (res.statusCode == 429 && error == 'COOLDOWN') {
        final retry = (data?['retryAfterSeconds'] as num?)?.toInt();
        return CreateResult(CreateOutcome.cooldown, retryAfterSeconds: retry);
      }
      if (res.statusCode == 429) {
        return const CreateResult(CreateOutcome.rateLimited);
      }
      return const CreateResult(CreateOutcome.networkError);
    } catch (e) {
      debugPrint('AssistanceState requestAssistance failed: $e');
      return const CreateResult(CreateOutcome.networkError);
    }
  }

  /// Customer backs out of a still-unclaimed (PENDING) request.
  Future<bool> cancel() async {
    final id = _requestId;
    if (id == null) return false;
    try {
      final res = await http
          .post(Uri.parse('${BackendConfig.assistanceApiUrl}/$id/cancel-request'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        await _poll();
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('AssistanceState cancel failed: $e');
      return false;
    }
  }

  DateTime? get lastCreateAttempt => _lastCreateAttempt;
}

Map<String, dynamic>? jsonDecodeOrNull(String body) {
  try {
    return json.decode(body) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }
}
