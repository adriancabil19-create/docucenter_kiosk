import 'package:flutter/material.dart';
import '../../storage_service.dart';
import '_staff_scaffold.dart';

/// Storage browsing + bulk cleanup (rule 21). Reuses [StorageService] rather
/// than duplicating its HTTP calls.
class StaffStorageCleanupPage extends StatefulWidget {
  const StaffStorageCleanupPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffStorageCleanupPage> createState() => _StaffStorageCleanupPageState();
}

class _StaffStorageCleanupPageState extends State<StaffStorageCleanupPage> {
  Map<String, dynamic>? _stats;
  List<StorageDocument>? _documents;
  bool _showDocuments = false;
  bool _cleaning = false;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    final stats = await StorageService.getStorageStats();
    if (mounted) setState(() => _stats = stats);
  }

  Future<void> _toggleDocuments() async {
    if (_showDocuments) {
      setState(() => _showDocuments = false);
      return;
    }
    final docs = await StorageService.getDocuments();
    if (!mounted) return;
    setState(() {
      _documents = docs;
      _showDocuments = true;
    });
  }

  Future<void> _confirmCleanup() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Are you sure?'),
        content: const Text('This will permanently remove temporary customer files.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('CANCEL')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('CLEAN')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _cleaning = true);
    final deleted = await StorageService.cleanupAll();
    if (!mounted) return;
    setState(() {
      _cleaning = false;
      _showDocuments = false;
      _documents = null;
    });
    await _loadStats();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(deleted != null ? 'Removed $deleted temporary file(s).' : 'Cleanup failed.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final files = _stats?['totalFiles'] ?? _stats?['fileCount'] ?? '—';
    final used = _stats?['totalSize'] ?? _stats?['sizeLabel'] ?? '—';

    return StaffScaffold(
      title: 'Storage',
      onBack: widget.onBack,
      children: [
        Row(
          children: [
            Expanded(child: _StatTile('Temporary Files', '$files')),
            const SizedBox(width: 12),
            Expanded(child: _StatTile('Storage Used', '$used')),
          ],
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _toggleDocuments,
            child: Text(_showDocuments ? 'Hide Temporary Storage' : 'View Temporary Storage'),
          ),
        ),
        if (_showDocuments) ...[
          const SizedBox(height: 12),
          if (_documents == null)
            const Center(child: CircularProgressIndicator())
          else if (_documents!.isEmpty)
            const Text('No files in storage.')
          else
            for (final d in _documents!)
              ListTile(
                dense: true,
                leading: const Icon(Icons.insert_drive_file_outlined),
                title: Text(d.originalName.isNotEmpty ? d.originalName : d.name, style: const TextStyle(fontSize: 13)),
                subtitle: Text('${d.format} · ${d.size} · ${d.date}', style: const TextStyle(fontSize: 11)),
              ),
        ],
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.tonal(
            onPressed: _cleaning ? null : _confirmCleanup,
            child: Text(_cleaning ? 'Cleaning…' : 'Clear Temporary Files'),
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.black12), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: Colors.black54)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
