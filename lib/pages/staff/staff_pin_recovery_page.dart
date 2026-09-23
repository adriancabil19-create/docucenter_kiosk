import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../staff_service.dart';

const _brandBlue = Color(0xFF2563EB);

enum _RecoveryStep { username, waiting, setPin, denied, success }

/// PIN recovery (rule 11): staff submits a request, an Admin (already
/// authenticated in the admin console) approves or denies it, then the staff
/// member sets their own new PIN. No admin credentials ever touch the kiosk.
class StaffPinRecoveryPage extends StatefulWidget {
  const StaffPinRecoveryPage({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<StaffPinRecoveryPage> createState() => _StaffPinRecoveryPageState();
}

class _StaffPinRecoveryPageState extends State<StaffPinRecoveryPage> {
  final _usernameCtrl = TextEditingController();
  final _newPinCtrl = TextEditingController();
  final _confirmPinCtrl = TextEditingController();

  _RecoveryStep _step = _RecoveryStep.username;
  String? _requestId;
  String? _error;
  bool _busy = false;
  Timer? _pollTimer;

  @override
  void dispose() {
    _pollTimer?.cancel();
    _usernameCtrl.dispose();
    _newPinCtrl.dispose();
    _confirmPinCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitUsername() async {
    final username = _usernameCtrl.text.trim();
    if (username.isEmpty) {
      setState(() => _error = 'Enter your staff username.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final id = await StaffService.requestPinReset(username);
    if (!mounted) return;
    if (id == null) {
      setState(() {
        _busy = false;
        _error = 'Staff username not found.';
      });
      return;
    }
    setState(() {
      _busy = false;
      _requestId = id;
      _step = _RecoveryStep.waiting;
    });
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _pollStatus());
  }

  Future<void> _pollStatus() async {
    final id = _requestId;
    if (id == null) return;
    final status = await StaffService.getPinResetRequestStatus(id);
    if (!mounted || status == null) return;
    if (status.status == 'approved') {
      _pollTimer?.cancel();
      setState(() => _step = _RecoveryStep.setPin);
    } else if (status.status == 'denied') {
      _pollTimer?.cancel();
      setState(() => _step = _RecoveryStep.denied);
    }
  }

  Future<void> _submitNewPin() async {
    final id = _requestId;
    if (id == null) return;
    final newPin = _newPinCtrl.text;
    final confirmPin = _confirmPinCtrl.text;
    if (newPin.length != 6) {
      setState(() => _error = 'PIN must be exactly 6 digits.');
      return;
    }
    if (newPin != confirmPin) {
      setState(() => _error = 'PIN confirmation does not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await StaffService.setNewPin(id, newPin, confirmPin);
    if (!mounted) return;
    if (!ok) {
      setState(() {
        _busy = false;
        _error = 'Could not set the new PIN. It may no longer be approved — try again.';
      });
      return;
    }
    setState(() {
      _busy = false;
      _step = _RecoveryStep.success;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: _buildStep(context),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(BuildContext context) {
    switch (_step) {
      case _RecoveryStep.username:
        return _Card(
          title: 'STAFF PIN RECOVERY',
          children: [
            const Text(
              'Enter your Staff Username',
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _usernameCtrl,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white),
              decoration: _fieldDecoration(),
            ),
            if (_error != null) _errorText(),
            const SizedBox(height: 20),
            _primaryButton('CONTINUE', _busy, _submitUsername),
            _cancelButton(),
          ],
        );

      case _RecoveryStep.waiting:
        return _Card(
          title: 'ADMIN VERIFICATION REQUIRED',
          children: [
            const SizedBox(height: 8),
            const CircularProgressIndicator(color: Colors.white70),
            const SizedBox(height: 16),
            const Text(
              'An administrator must verify this request.\nWaiting for approval — you can leave this screen open.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 20),
            _cancelButton(),
          ],
        );

      case _RecoveryStep.denied:
        return _Card(
          title: 'REQUEST DENIED',
          children: [
            const Text(
              'Your PIN recovery request was denied. Please contact an administrator.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 20),
            _primaryButton('BACK TO LOGIN', false, widget.onDone),
          ],
        );

      case _RecoveryStep.setPin:
        return _Card(
          title: 'RESET STAFF PIN',
          children: [
            const Text('New Staff PIN', style: TextStyle(color: Colors.white70, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _newPinCtrl,
              obscureText: true,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              style: const TextStyle(color: Colors.white, fontSize: 20, letterSpacing: 8),
              decoration: _fieldDecoration(),
            ),
            const SizedBox(height: 12),
            const Text('Confirm New PIN', style: TextStyle(color: Colors.white70, fontSize: 13)),
            const SizedBox(height: 6),
            TextField(
              controller: _confirmPinCtrl,
              obscureText: true,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              style: const TextStyle(color: Colors.white, fontSize: 20, letterSpacing: 8),
              decoration: _fieldDecoration(),
            ),
            if (_error != null) _errorText(),
            const SizedBox(height: 20),
            _primaryButton('SAVE NEW PIN', _busy, _submitNewPin),
            _cancelButton(),
          ],
        );

      case _RecoveryStep.success:
        return _Card(
          title: '✓ PIN Reset',
          children: [
            const Text(
              'Staff PIN successfully reset.\nPlease use your new PIN to log in.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 20),
            _primaryButton('BACK TO LOGIN', false, widget.onDone),
          ],
        );
    }
  }

  InputDecoration _fieldDecoration() => InputDecoration(
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.08),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      );

  Widget _errorText() => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13)),
      );

  Widget _primaryButton(String label, bool busy, VoidCallback onPressed) => SizedBox(
        width: double.infinity,
        height: 52,
        child: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _brandBlue),
          onPressed: busy ? null : onPressed,
          child: busy
              ? const SizedBox(
                  width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
      );

  Widget _cancelButton() => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: TextButton(
          onPressed: widget.onDone,
          child: const Text('Cancel', style: TextStyle(color: Colors.white38)),
        ),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 0.8),
        ),
        const SizedBox(height: 24),
        ...children,
      ],
    );
  }
}
