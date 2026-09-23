import 'package:flutter/material.dart';
import '../../print_service.dart';
import '../../staff_session.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

const _reasons = <String, String>{
  'paper_jam': '🔧 Paper Jam',
  'printer_error': '🖨️ Printer Error',
  'incorrect_output': '📄 Incorrect Output',
  'power_interruption': '⚡ Power Interruption',
  'printer_offline': '🔌 Printer Offline',
  'other': '⚠️ Other',
};

/// Staff Print Recovery — reprint a paid transaction whose print failed, at
/// no additional charge. Deliberately not a generic "Free Print": only
/// transactions the backend confirms are actually eligible (paid, print
/// failed, within the recovery window, not already recovered) are shown.
class StaffPrintRecoveryPage extends StatefulWidget {
  const StaffPrintRecoveryPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffPrintRecoveryPage> createState() => _StaffPrintRecoveryPageState();
}

class _StaffPrintRecoveryPageState extends State<StaffPrintRecoveryPage> {
  List<RecoverableTransaction> _items = [];
  bool _loading = true;
  String? _actingOnTransactionId;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    final items = await PrintingService.getRecoverableTransactions();
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  Future<void> _startRecovery(RecoverableTransaction item) async {
    final picked = await showModalBottomSheet<(String, String?)>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => _ReasonSheet(item: item),
    );
    if (picked == null) return;
    final (reason, reasonNote) = picked;

    setState(() => _actingOnTransactionId = item.transactionId);
    final result = await PrintingService.recoverPrint(
      item.transactionId,
      reason: reason,
      reasonNote: reasonNote,
      actor: StaffSession.instance.currentStaff?.name ?? 'Staff',
      staffId: StaffSession.instance.currentStaff?.id,
    );
    if (!mounted) return;
    setState(() => _actingOnTransactionId = null);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result.success
              ? 'Recovery print sent to the printer.'
              : (result.error ?? 'Recovery print failed. Try again.'),
        ),
        backgroundColor: result.success ? Colors.green : Colors.red,
      ),
    );
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return StaffScaffold(
      title: 'Print Recovery',
      onBack: widget.onBack,
      actions: [
        IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh), tooltip: 'Refresh'),
      ],
      children: [
        const StaffBanner(
          text: 'Paid transactions whose printing failed, any time — no time limit. Reprinting here '
              'does not charge the customer again, and is logged for the admin.',
          color: StaffColors.primary,
          icon: Icons.info_outline_rounded,
        ),
        const SizedBox(height: 16),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_items.isEmpty)
          const StaffCard(
            child: Column(
              children: [
                Icon(Icons.check_circle_outline_rounded, size: 40, color: StaffColors.success),
                SizedBox(height: 12),
                Text('No transactions currently need recovery.', style: TextStyle(color: StaffColors.textSecondary)),
              ],
            ),
          )
        else
          for (var i = 0; i < _items.length; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == _items.length - 1 ? 0 : 10),
              child: _RecoveryCard(
                item: _items[i],
                busy: _actingOnTransactionId == _items[i].transactionId,
                onRecover: () => _startRecovery(_items[i]),
              ),
            ),
      ],
    );
  }
}

class _RecoveryCard extends StatelessWidget {
  const _RecoveryCard({required this.item, required this.busy, required this.onRecover});
  final RecoverableTransaction item;
  final bool busy;
  final VoidCallback onRecover;

  @override
  Widget build(BuildContext context) {
    return StaffCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const StaffIconBadge(icon: Icons.restart_alt_rounded, color: StaffColors.warning, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.referenceNumber, style: const TextStyle(fontWeight: FontWeight.w800, color: StaffColors.textPrimary)),
                const SizedBox(height: 4),
                Text(
                  '₱${item.amount.toStringAsFixed(2)} · ${item.printJob.pageCount}p × ${item.printJob.copies} · ${item.printJob.serviceType}',
                  style: const TextStyle(color: StaffColors.textSecondary, fontSize: 13),
                ),
                Text(item.createdAt, style: const TextStyle(color: StaffColors.textMuted, fontSize: 11)),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: FilledButton.icon(
                    onPressed: busy ? null : onRecover,
                    icon: busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.print_rounded, size: 18),
                    style: FilledButton.styleFrom(
                      backgroundColor: StaffColors.warning,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    label: Text(busy ? 'Working…' : 'Recover Print', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({required this.item});
  final RecoverableTransaction item;

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  String? _reason;
  final _noteController = TextEditingController();

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  bool get _canConfirm => _reason != null && (_reason != 'other' || _noteController.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Why did printing fail?', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(widget.item.referenceNumber, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          const SizedBox(height: 12),
          for (final entry in _reasons.entries)
            RadioListTile<String>(
              contentPadding: EdgeInsets.zero,
              value: entry.key,
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              title: Text(entry.value),
            ),
          if (_reason == 'other') ...[
            const SizedBox(height: 4),
            TextField(
              controller: _noteController,
              decoration: const InputDecoration(labelText: 'Briefly explain what happened', border: OutlineInputBorder()),
              maxLines: 2,
              onChanged: (_) => setState(() {}),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              onPressed: _canConfirm
                  ? () => Navigator.pop(context, (_reason!, _noteController.text.trim().isEmpty ? null : _noteController.text.trim()))
                  : null,
              style: FilledButton.styleFrom(
                backgroundColor: StaffColors.warning,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: const Text('Confirm Recovery Print', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}
