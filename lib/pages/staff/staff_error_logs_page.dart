import 'package:flutter/material.dart';
import '../../staff_service.dart';
import '_staff_scaffold.dart';

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
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      children: [
        if (logs == null)
          const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: CircularProgressIndicator()))
        else if (logs.isEmpty)
          const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: Text('No warnings or errors logged.')))
        else
          for (final l in logs) _LogTile(l),
      ],
    );
  }
}

class _LogTile extends StatelessWidget {
  const _LogTile(this.log);
  final StaffLogEntry log;

  @override
  Widget build(BuildContext context) {
    final color = log.level == 'error' ? Colors.red : Colors.orange;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(log.level == 'error' ? Icons.error_outline : Icons.warning_amber, color: color),
        title: Text(log.message, style: const TextStyle(fontSize: 13)),
        subtitle: Text('${log.category} · ${log.createdAt}', style: const TextStyle(fontSize: 11)),
      ),
    );
  }
}
