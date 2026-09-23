import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../assistance_service.dart';
import '../../config.dart';
import '../../staff_service.dart';
import '../../staff_session.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

class _ActiveRequest {
  final String id;
  final AssistanceStatus? status;
  final String? message;
  final String requestedAt;
  final String? acknowledgedBy;

  const _ActiveRequest({
    required this.id,
    required this.status,
    required this.message,
    required this.requestedAt,
    required this.acknowledgedBy,
  });

  factory _ActiveRequest.fromJson(Map<String, dynamic> j) => _ActiveRequest(
        id: j['id'] as String? ?? '',
        status: parseAssistanceStatus(j['status'] as String?),
        message: j['message'] as String?,
        requestedAt: j['requested_at'] as String? ?? '',
        acknowledgedBy: j['acknowledged_by'] as String?,
      );
}

/// This kiosk's own customer assistance request, handled right here instead
/// of needing the web console — the staff member reading this screen is
/// standing next to the customer who asked for help.
class StaffAssistancePage extends StatefulWidget {
  const StaffAssistancePage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffAssistancePage> createState() => _StaffAssistancePageState();
}

class _StaffAssistancePageState extends State<StaffAssistancePage> {
  Timer? _timer;
  _ActiveRequest? _request;
  bool _loading = true;
  bool _acting = false;

  @override
  void initState() {
    super.initState();
    _poll();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _poll());
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
      if (!mounted || res.statusCode != 200) return;
      final data = json.decode(res.body) as Map<String, dynamic>;
      final requestJson = data['request'] as Map<String, dynamic>?;
      setState(() {
        _request = requestJson == null ? null : _ActiveRequest.fromJson(requestJson);
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _acknowledge() async {
    final request = _request;
    if (request == null) return;
    setState(() => _acting = true);
    final ok = await StaffService.acknowledgeAssistanceRequest(
      request.id,
      actor: StaffSession.instance.currentStaff?.name,
    );
    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not acknowledge — it may already be handled.')),
      );
    }
    await _poll();
    if (mounted) setState(() => _acting = false);
  }

  Future<void> _resolve() async {
    final request = _request;
    if (request == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Mark Resolved'),
        content: const Text('Mark this assistance request as resolved?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: StaffColors.success),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Resolved'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _acting = true);
    final ok = await StaffService.resolveAssistanceRequest(
      request.id,
      actor: StaffSession.instance.currentStaff?.name,
    );
    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not mark resolved. Try again.')),
      );
    }
    await _poll();
    if (mounted) setState(() => _acting = false);
  }

  @override
  Widget build(BuildContext context) {
    return StaffScaffold(
      title: 'Assistance',
      onBack: widget.onBack,
      actions: [
        IconButton(
          onPressed: _poll,
          icon: const Icon(Icons.refresh_rounded),
          tooltip: 'Refresh',
          style: IconButton.styleFrom(backgroundColor: StaffColors.background, foregroundColor: StaffColors.textPrimary),
        ),
      ],
      children: [
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_request == null)
          const _EmptyState()
        else
          _RequestCard(
            request: _request!,
            busy: _acting,
            onAcknowledge: _acknowledge,
            onResolve: _resolve,
          ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const StaffCard(
      padding: EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      child: Column(
        children: [
          Icon(Icons.check_circle_outline_rounded, size: 44, color: StaffColors.success),
          SizedBox(height: 12),
          Text(
            'No customer is currently waiting for assistance at this kiosk.',
            textAlign: TextAlign.center,
            style: TextStyle(color: StaffColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.request,
    required this.busy,
    required this.onAcknowledge,
    required this.onResolve,
  });

  final _ActiveRequest request;
  final bool busy;
  final VoidCallback onAcknowledge;
  final VoidCallback onResolve;

  @override
  Widget build(BuildContext context) {
    final isPending = request.status == AssistanceStatus.pending;
    final isAcknowledged = request.status == AssistanceStatus.acknowledged;
    final (label, color) = switch (request.status) {
      AssistanceStatus.pending => ('Waiting for staff', const Color(0xFFB45309)),
      AssistanceStatus.acknowledged => ('In progress', const Color(0xFF1D4ED8)),
      AssistanceStatus.resolved => ('Resolved', const Color(0xFF15803D)),
      _ => ('—', Colors.grey),
    };

    return StaffCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StaffStatusPill(label: label, color: color),
              const Spacer(),
              const StaffIconBadge(icon: Icons.support_agent_rounded, color: StaffColors.primary, size: 36),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'A customer is requesting assistance.',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: StaffColors.textPrimary),
          ),
          if (request.message != null && request.message!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '"${request.message}"',
              style: const TextStyle(fontStyle: FontStyle.italic, color: StaffColors.textSecondary),
            ),
          ],
          const SizedBox(height: 10),
          Text('Requested: ${request.requestedAt}', style: const TextStyle(color: StaffColors.textMuted, fontSize: 12)),
          if (request.acknowledgedBy != null)
            Text('Assigned to: ${request.acknowledgedBy}', style: const TextStyle(color: StaffColors.textMuted, fontSize: 12)),
          const SizedBox(height: 16),
          if (isPending)
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: StaffColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: busy ? null : onAcknowledge,
                child: Text(busy ? 'Working…' : 'Acknowledge', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          if (isAcknowledged)
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: StaffColors.success,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: busy ? null : onResolve,
                child: Text(busy ? 'Working…' : 'Mark Resolved', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
        ],
      ),
    );
  }
}
