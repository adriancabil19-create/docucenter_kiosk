import 'package:flutter/material.dart';
import '../../storage_service.dart';
import '../../staff_session.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Are you sure?'),
        content: const Text('This will permanently remove temporary customer files.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('CANCEL')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: StaffColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('CLEAN'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _cleaning = true);
    final deleted = await StorageService.cleanupAll(
      actor: StaffSession.instance.currentStaff?.name,
    );
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
            Expanded(child: _StatTile('Temporary Files', '$files', Icons.description_outlined, StaffColors.primary)),
            const SizedBox(width: 12),
            Expanded(child: _StatTile('Storage Used', '$used', Icons.storage_rounded, const Color(0xFF0891B2))),
          ],
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton.icon(
            onPressed: _toggleDocuments,
            icon: Icon(_showDocuments ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
            label: Text(
              _showDocuments ? 'Hide Temporary Storage' : 'View Temporary Storage',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: StaffColors.textPrimary,
              side: const BorderSide(color: StaffColors.border, width: 1.4),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        if (_showDocuments) ...[
          const SizedBox(height: 14),
          if (_documents == null)
            const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Center(child: CircularProgressIndicator()))
          else if (_documents!.isEmpty)
            const StaffCard(
              child: Center(child: Text('No files in storage.', style: TextStyle(color: StaffColors.textSecondary))),
            )
          else
            StaffCard(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Column(
                children: [
                  for (final d in _documents!)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.insert_drive_file_outlined, color: StaffColors.textSecondary),
                      title: Text(
                        d.originalName.isNotEmpty ? d.originalName : d.name,
                        style: const TextStyle(fontSize: 13, color: StaffColors.textPrimary),
                      ),
                      subtitle: Text('${d.format} · ${d.size} · ${d.date}', style: const TextStyle(fontSize: 11, color: StaffColors.textMuted)),
                    ),
                ],
              ),
            ),
        ],
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            onPressed: _cleaning ? null : _confirmCleanup,
            icon: _cleaning
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.delete_sweep_outlined, size: 18),
            style: FilledButton.styleFrom(
              backgroundColor: StaffColors.danger,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            label: Text(_cleaning ? 'Cleaning…' : 'Clear Temporary Files', style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(this.label, this.value, this.icon, this.color);
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return StaffCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StaffIconBadge(icon: icon, color: color, size: 32),
          const SizedBox(height: 10),
          Text(label, style: const TextStyle(fontSize: 11, color: StaffColors.textSecondary, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: StaffColors.textPrimary)),
        ],
      ),
    );
  }
}
