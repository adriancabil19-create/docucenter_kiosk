import 'package:flutter/material.dart';
import '../../staff_service.dart';
import '_staff_scaffold.dart';

/// Payment gateway connectivity test (rule 18). Never creates a real charge —
/// it hits the backend's PayMongo health check only.
class StaffPaymentTestPage extends StatefulWidget {
  const StaffPaymentTestPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffPaymentTestPage> createState() => _StaffPaymentTestPageState();
}

class _StaffPaymentTestPageState extends State<StaffPaymentTestPage> {
  bool _checking = true;
  bool? _connected;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    setState(() => _checking = true);
    final result = await StaffService.checkPaymentGateway();
    if (mounted) {
      setState(() {
        _checking = false;
        _connected = result;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _checking ? Colors.grey : (_connected == true ? Colors.green : Colors.red);
    final label = _checking ? 'Checking…' : (_connected == true ? 'Connected' : 'Unreachable');

    return StaffScaffold(
      title: 'Payment System',
      onBack: widget.onBack,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(border: Border.all(color: color), borderRadius: BorderRadius.circular(12)),
          child: Row(
            children: [
              Container(width: 14, height: 14, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 12),
              Text('Gateway Status: $label', style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton(onPressed: _checking ? null : _check, child: const Text('Test Connection')),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.amber[50], borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.amber)),
          child: const Text(
            'IMPORTANT: This test never creates a real payment or charge.',
            style: TextStyle(fontSize: 13),
          ),
        ),
      ],
    );
  }
}
