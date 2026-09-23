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
    if (item.printJob.needsRescan) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.document_scanner_outlined, color: StaffColors.warning),
          title: const Text('Needs a re-scan'),
          content: const Text(
            'Photocopy jobs are not kept on file — the scanned pages are deleted right after '
            'printing. To recover this job, ask the customer to bring their original documents '
            'back to the ADF, then use the Photocopying service again with the same settings. '
            'This does not require another payment; note the reason under Print Recovery once done.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Got it'),
            ),
          ],
        ),
      );
      return;
    }

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
    final job = item.printJob;
    final needsRescan = job.needsRescan;
    final docLabel = job.filenames.isEmpty
        ? '—'
        : job.filenames.length == 1
            ? job.filenames.first
            : '${job.filenames.first} +${job.filenames.length - 1} more';

    return StaffCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StaffIconBadge(
            icon: needsRescan ? Icons.document_scanner_outlined : Icons.restart_alt_rounded,
            color: StaffColors.warning,
            size: 40,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.referenceNumber, style: const TextStyle(fontWeight: FontWeight.w800, color: StaffColors.textPrimary)),
                const SizedBox(height: 4),
                Text(
                  docLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: StaffColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  '₱${item.amount.toStringAsFixed(2)} · ${job.pageCount}p × ${job.copies} · '
                  '${job.paperSize} · ${job.colorMode == 'color' ? 'Color' : 'B&W'}'
                  '${job.duplex ? ' · Duplex' : ''} · ${job.serviceType}',
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
                        : Icon(needsRescan ? Icons.document_scanner_outlined : Icons.print_rounded, size: 18),
                    style: FilledButton.styleFrom(
                      backgroundColor: StaffColors.warning,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    label: Text(
                      busy ? 'Working…' : (needsRescan ? 'Needs Re-scan' : 'Recover Print'),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
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
          Text('Confirm original job', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(widget.item.referenceNumber, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
          const SizedBox(height: 12),
          _OriginalJobSummary(item: widget.item),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: StaffColors.success.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: StaffColors.success.withValues(alpha: 0.3)),
            ),
            child: Text(
              'This customer has already paid ₱${widget.item.amount.toStringAsFixed(2)} for this '
              'transaction. Reprinting will NOT charge them again.',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: StaffColors.textPrimary),
            ),
          ),
          const SizedBox(height: 16),
          Text('Why did printing fail?', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
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

/// The complete original job configuration, shown before staff confirms a
/// recovery reprint — document, pages, copies, paper size, color mode,
/// duplex, and total pages, so what's about to be reprinted is unambiguous.
class _OriginalJobSummary extends StatelessWidget {
  const _OriginalJobSummary({required this.item});
  final RecoverableTransaction item;

  @override
  Widget build(BuildContext context) {
    final job = item.printJob;
    final docLabel = job.filenames.isEmpty ? '—' : job.filenames.join(', ');
    final totalPages = job.pageCount * job.copies;

    Widget row(String label, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 96,
                child: Text(label, style: TextStyle(fontSize: 12.5, color: Colors.grey[600])),
              ),
              Expanded(
                child: Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          row('Document', docLabel),
          row('Pages', '${job.pageCount} page(s) × ${job.copies} = $totalPages page(s)'),
          row('Paper', job.paperSize),
          row('Color', job.colorMode == 'color' ? 'Color' : 'Black & White'),
          row('Duplex', job.duplex ? 'Yes (2-sided)' : 'No (1-sided)'),
          row('Amount Paid', '₱${item.amount.toStringAsFixed(2)}'),
        ],
      ),
    );
  }
}
