import 'dart:async';
import 'package:flutter/foundation.dart';
import 'staff_service.dart';

/// Staff Mode's authenticated session — same singleton shape as
/// [KioskRuntime]/`AppSettings.instance` (private constructor + static
/// `.instance`, consumed via `AnimatedBuilder`). Unlike KioskRuntime this
/// doesn't poll the backend; it just owns the logged-in staff member and an
/// inactivity timeout, mirroring `_MainAppState`'s idle-timer pattern in
/// main.dart.
class StaffSession extends ChangeNotifier {
  StaffSession._();
  static final StaffSession instance = StaffSession._();

  static const Duration sessionTimeout = Duration(minutes: 10);
  static const Duration expiringWarning = Duration(minutes: 1);

  StaffMember? _staff;
  bool _expiringSoon = false;
  Timer? _timeoutTimer;
  Timer? _warningTimer;

  /// Called once the session has fully timed out (inactivity), so the caller
  /// can navigate back to the customer-facing shell.
  VoidCallback? onTimedOut;

  StaffMember? get currentStaff => _staff;
  bool get isActive => _staff != null;
  bool get expiringSoon => _expiringSoon;

  void login(StaffMember staff) {
    _staff = staff;
    _expiringSoon = false;
    _armTimers();
    notifyListeners();
  }

  /// Reset the inactivity clock — call on any interaction inside Staff Mode.
  void noteActivity() {
    if (!isActive) return;
    if (_expiringSoon) {
      _expiringSoon = false;
      notifyListeners();
    }
    _armTimers();
  }

  void signOut() {
    _staff = null;
    _expiringSoon = false;
    _timeoutTimer?.cancel();
    _warningTimer?.cancel();
    notifyListeners();
  }

  void _armTimers() {
    _timeoutTimer?.cancel();
    _warningTimer?.cancel();
    _warningTimer = Timer(sessionTimeout - expiringWarning, () {
      _expiringSoon = true;
      notifyListeners();
    });
    _timeoutTimer = Timer(sessionTimeout, () {
      final callback = onTimedOut;
      signOut();
      callback?.call();
    });
  }
}
