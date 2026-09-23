import 'package:flutter/material.dart';
import '../../staff_service.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

/// Error/warning log viewer (rule 20).
class StaffErrorLogsPage extends StatefulWidget {
  const StaffErrorLogsPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffErrorLogsPage> createState() => _StaffErrorLogsPageState();
}

class _StaffErrorLogsPageState extends State<StaffErrorLogsPage> {
  List<StaffLogEntry>? _logs;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _logs = null);
    final logs = await StaffService.getErrorLogs();
    if (mounted) setState(() => _logs = logs);
  }

  @override
  Widget build(BuildContext context) {
    final logs = _logs;
    return StaffScaffold(
      title: 'Error Logs',
      onBack: widget.onBack,
      actions: [
        IconButton(
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
          style: IconButton.styleFrom(backgroundColor: StaffColors.background, foregroundColor: StaffColors.textPrimary),
        ),
      ],
      children: [
        if (logs == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (logs.isEmpty)
          const StaffCard(
            child: Column(
              children: [
                Icon(Icons.check_circle_outline_rounded, color: StaffColors.success, size: 32),
                SizedBox(height: 10),
                Text('No warnings or errors logged.', style: TextStyle(color: StaffColors.textSecondary)),
              ],
            ),
          )
        else
          for (var i = 0; i < logs.length; i++) ...[
            _LogTile(logs[i]),
            if (i != logs.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _LogTile extends StatelessWidget {
  const _LogTile(this.log);
  final StaffLogEntry log;

  @override
  Widget build(BuildContext context) {
    final isError = log.level == 'error';
    final color = isError ? StaffColors.danger : StaffColors.warning;
    return StaffCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StaffIconBadge(icon: isError ? Icons.error_outline_rounded : Icons.warning_amber_rounded, color: color, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(log.message, style: const TextStyle(fontSize: 13.5, color: StaffColors.textPrimary, height: 1.35)),
                const SizedBox(height: 5),
                Text(
                  '${log.category} · ${log.createdAt}',
                  style: const TextStyle(fontSize: 11, color: StaffColors.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
