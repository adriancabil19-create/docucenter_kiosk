import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../staff_service.dart';
import '../../staff_session.dart';

const _brandBlue = Color(0xFF2563EB);

/// Staff PIN login (rule 2). Reached via the 5-tap logo gesture. Supports
/// both an on-screen keypad and a physical keyboard through the same
/// [TextEditingController], so neither input path duplicates state.
class StaffLoginPage extends StatefulWidget {
  const StaffLoginPage({
    super.key,
    required this.onLoggedIn,
    required this.onForgotPin,
    required this.onCancel,
  });

  final VoidCallback onLoggedIn;
  final VoidCallback onForgotPin;
  final VoidCallback onCancel;

  @override
  State<StaffLoginPage> createState() => _StaffLoginPageState();
}

class _StaffLoginPageState extends State<StaffLoginPage> {
  final _usernameCtrl = TextEditingController();
  final _pinCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _pinCtrl.dispose();
    super.dispose();
  }

  void _appendDigit(String d) {
    if (_pinCtrl.text.length >= 6) return;
    _pinCtrl.text += d;
    setState(() {});
  }

  void _backspace() {
    if (_pinCtrl.text.isEmpty) return;
    _pinCtrl.text = _pinCtrl.text.substring(0, _pinCtrl.text.length - 1);
    setState(() {});
  }

  Future<void> _unlock() async {
    final username = _usernameCtrl.text.trim();
    final pin = _pinCtrl.text;
    if (username.isEmpty || pin.length != 6) {
      setState(() => _error = 'Enter your username and a 6-digit PIN.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    final result = await StaffService.login(username, pin);

    if (!mounted) return;
    if (result.success && result.staff != null) {
      StaffSession.instance.login(result.staff!);
      widget.onLoggedIn();
      return;
    }

    // Never reveal which part of the check failed (rule 2).
    String message;
    switch (result.errorCode) {
      case 'ACCOUNT_DISABLED':
        message = 'Account disabled. Please contact an administrator.';
        break;
      case 'ACCOUNT_LOCKED':
        message = 'Too many attempts. Please wait a couple of minutes and try again.';
        break;
      default:
        message = 'Invalid username or PIN.';
    }
    setState(() {
      _submitting = false;
      _error = message;
      _pinCtrl.clear();
    });
    // Brief delay after a failed attempt so rapid re-guessing isn't free —
    // the backend's own lockout (5 attempts) is the real limit.
    await Future.delayed(const Duration(milliseconds: 500));
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF0F172A),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.badge_outlined, color: Colors.white, size: 40),
                  const SizedBox(height: 12),
                  const Text(
                    'STAFF ACCESS',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _usernameCtrl,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 16),
                    decoration: InputDecoration(
                      hintText: 'Staff ID / Username',
                      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                      filled: true,
                      fillColor: Colors.white.withValues(alpha: 0.08),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _pinCtrl,
                    textAlign: TextAlign.center,
                    obscureText: true,
                    obscuringCharacter: '•',
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    style: const TextStyle(color: Colors.white, fontSize: 26, letterSpacing: 10),
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: 'Staff PIN',
                      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 16),
                      filled: true,
                      fillColor: Colors.white.withValues(alpha: 0.08),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _Keypad(onDigit: _appendDigit, onBackspace: _backspace),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13)),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: _brandBlue),
                      onPressed: _submitting ? null : _unlock,
                      child: _submitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('UNLOCK', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: widget.onForgotPin,
                    child: const Text('Forgot PIN?', style: TextStyle(color: Colors.white70)),
                  ),
                  TextButton(
                    onPressed: widget.onCancel,
                    child: const Text('Cancel', style: TextStyle(color: Colors.white38)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onDigit, required this.onBackspace});
  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;

  @override
  Widget build(BuildContext context) {
    const rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['', '0', '⌫'],
    ];
    return Column(
      children: rows
          .map(
            (row) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: row.map((key) {
                  if (key.isEmpty) return const SizedBox(width: 64, height: 52);
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: SizedBox(
                      width: 64,
                      height: 52,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () => key == '⌫' ? onBackspace() : onDigit(key),
                        child: Text(
                          key,
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          )
          .toList(),
    );
  }
}
