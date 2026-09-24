import 'package:flutter/material.dart';
import '../../print_service.dart';
import '../../staff_session.dart';
import '_staff_scaffold.dart';
import '_transaction_details.dart';
import 'staff_theme.dart';

/// Staff Print Recovery / Payment Bypass — reprint a paid transaction at no
/// additional charge. Lists every recent PAID print, not only ones the
/// software saw fail, because a jam the printer never reported still looks
/// "completed" here. Each recovery needs a signed-in staff account, a reason,
/// and a confirmation, and is logged and pushed to the admin.
class StaffPrintRecoveryPage extends StatefulWidget {
  const StaffPrintRecoveryPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffPrintRecoveryPage> createState() => _StaffPrintRecoveryPageState();
}

class _StaffPrintRecoveryPageState extends State<StaffPrintRecoveryPage> {
  final _searchController = TextEditingController();
  List<TransactionRecord> _items = [];
  bool _loading = true;
  String? _actingOnTransactionId;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    final items = await PrintingService.getRecoverableTransactions(search: _searchController.text);
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  Future<void> _startRecovery(TransactionRecord item) async {
    final staff = StaffSession.instance.currentStaff;
    if (staff == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to Staff Mode again to recover a print.'), backgroundColor: Colors.red),
      );
      return;
    }

    if (item.needsRescan) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.document_scanner_outlined, color: StaffColors.warning),
          title: const Text('Needs a re-scan'),
          content: const Text(
            'Photocopy jobs are not kept on file — the scanned pages are deleted right after '
            'printing. To recover this job, ask the customer to bring their original documents '
            'back to the ADF, then use the Photocopying service again with the same settings.',
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Got it')),
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
    if (picked == null || !mounted) return;
    final (reason, reasonNote) = picked;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: StaffColors.warning),
        title: const Text('Authorize payment bypass?'),
        content: Text(
          'Transaction ${item.id}\n'
          '${item.documentLabel}: ${item.totalPages ?? 0} page(s)\n\n'
          'The customer already paid ${formatPeso(item.amount)}. This reprint will be charged ₱0.00.\n\n'
          'Reason: ${recoveryReasonLabels[reason] ?? reason}${reasonNote != null ? ' — $reasonNote' : ''}\n'
          'Recorded under your account (${staff.name}) and reported to the admin.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: StaffColors.warning),
            child: const Text('Recover Print'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _actingOnTransactionId = item.id);
    final result = await PrintingService.recoverPrint(
      item.id,
      reason: reason,
      reasonNote: reasonNote,
      staffId: staff.id,
    );
    if (!mounted) return;
    setState(() => _actingOnTransactionId = null);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result.success ? 'Recovery print sent to the printer.' : (result.error ?? 'Recovery print failed. Try again.'),
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
          text: 'Paid prints from the last 7 days, including ones the software reported as completed, '
              'for when the printer physically failed. Reprinting charges ₱0, keeps the original '
              'payment, and is logged and reported to the admin.',
          color: StaffColors.primary,
          icon: Icons.info_outline_rounded,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _searchController,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => _refresh(),
          decoration: InputDecoration(
            hintText: 'Transaction ID, payment ref, document, or date (2026-09-25)',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.clear),
              onPressed: () {
                _searchController.clear();
                _refresh();
              },
            ),
            filled: true,
            fillColor: StaffColors.surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 16),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_items.isEmpty)
          StaffCard(
            child: Column(
              children: [
                const Icon(Icons.check_circle_outline_rounded, size: 40, color: StaffColors.success),
                const SizedBox(height: 12),
                Text(
                  _searchController.text.trim().isEmpty
                      ? 'No paid prints are available for recovery.'
                      : 'No recoverable transaction matches that search.',
                  style: const TextStyle(color: StaffColors.textSecondary),
                ),
              ],
            ),
          )
        else
          for (var i = 0; i < _items.length; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == _items.length - 1 ? 0 : 10),
              child: _RecoveryCard(
                item: _items[i],
                busy: _actingOnTransactionId == _items[i].id,
                onDetails: () => showTransactionDetailsSheet(context, _items[i]),
                onRecover: () => _startRecovery(_items[i]),
              ),
            ),
      ],
    );
  }
}

class _RecoveryCard extends StatelessWidget {
  const _RecoveryCard({required this.item, required this.busy, required this.onDetails, required this.onRecover});
  final TransactionRecord item;
  final bool busy;
  final VoidCallback onDetails;
  final VoidCallback onRecover;

  @override
  Widget build(BuildContext context) {
    final (headerColor, headerLabel) = item.needsRecovery
        ? (StaffColors.danger, 'PAID — RECOVERY REQUIRED')
        : item.displayStatus == 'PRINTING'
            ? (StaffColors.primary, 'PAID — PRINTING')
            : (StaffColors.success, 'PAID — COMPLETED PER SOFTWARE');
    final settings = [
      item.paperSize ?? '—',
      item.colorMode == 'color' ? 'Color' : 'B&W',
      if (item.quality != null) '${item.quality![0].toUpperCase()}${item.quality!.substring(1)}',
      if (item.duplex == true) 'Duplex',
    ].join(' • ');

    return StaffCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StaffStatusPill(label: headerLabel, color: headerColor),
          const SizedBox(height: 10),
          Text(
            item.documentLabel,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800, color: StaffColors.textPrimary),
          ),
          const SizedBox(height: 4),
          Text(
            '${item.pageCount ?? 0} page(s) × ${item.copies ?? 1} ${(item.copies ?? 1) == 1 ? 'copy' : 'copies'}'
            ' = ${item.totalPages ?? 0} page(s)',
            style: const TextStyle(color: StaffColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
          ),
          Text(settings, style: const TextStyle(color: StaffColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 6),
          Text('Paid: ${formatPeso(item.amount)}',
              style: const TextStyle(color: StaffColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w700)),
          Text('Transaction: ${item.id}', style: const TextStyle(color: StaffColors.textSecondary, fontSize: 12)),
          Text(formatStaffDateTime(item.createdAt), style: const TextStyle(color: StaffColors.textMuted, fontSize: 11)),
          if (item.printError != null) ...[
            const SizedBox(height: 6),
            Text('Printer error: ${item.printError}', style: const TextStyle(color: StaffColors.danger, fontSize: 12)),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 46,
                  child: OutlinedButton.icon(
                    onPressed: onDetails,
                    icon: const Icon(Icons.receipt_long_outlined, size: 18),
                    style: OutlinedButton.styleFrom(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    label: const Text('View Details', style: TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 46,
                  child: FilledButton.icon(
                    onPressed: busy ? null : onRecover,
                    icon: busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Icon(item.needsRescan ? Icons.document_scanner_outlined : Icons.print_rounded, size: 18),
                    style: FilledButton.styleFrom(
                      backgroundColor: StaffColors.warning,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    label: Text(
                      busy ? 'Working…' : (item.needsRescan ? 'Needs Re-scan' : 'Recover Print'),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({required this.item});
  final TransactionRecord item;

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

  bool get _canContinue => _reason != null && (_reason != 'other' || _noteController.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Print Recovery / Payment Bypass',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            TransactionDetailsView(record: widget.item),
            const SizedBox(height: 6),
            Text('Why is a reprint needed?',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                children: [
                  for (final key in offeredRecoveryReasons)
                    RadioListTile<String>(
                      contentPadding: EdgeInsets.zero,
                      value: key,
                      title: Text(recoveryReasonLabels[key]!),
                    ),
                ],
              ),
            ),
            if (_reason == 'other') ...[
              const SizedBox(height: 4),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(
                  labelText: 'Explain what happened (required)',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
                onChanged: (_) => setState(() {}),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: _canContinue
                    ? () => Navigator.pop(
                          context,
                          (_reason!, _noteController.text.trim().isEmpty ? null : _noteController.text.trim()),
                        )
                    : null,
                style: FilledButton.styleFrom(
                  backgroundColor: StaffColors.warning,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('Continue', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
