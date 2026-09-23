import 'package:flutter/material.dart';
import '../../staff_service.dart';
import '_staff_scaffold.dart';
import 'staff_theme.dart';

/// Trimmed transaction list (rule 19) — no customer personal information is
/// stored in this schema, so nothing extra needs to be redacted.
class StaffTransactionsPage extends StatefulWidget {
  const StaffTransactionsPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffTransactionsPage> createState() => _StaffTransactionsPageState();
}

class _StaffTransactionsPageState extends State<StaffTransactionsPage> {
  List<StaffTransactionEntry>? _entries;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _entries = null);
    final entries = await StaffService.getTransactions();
    if (mounted) setState(() => _entries = entries);
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    return StaffScaffold(
      title: 'Transactions',
      onBack: widget.onBack,
      actions: [
        IconButton(
          onPressed: _load,
          icon: const Icon(Icons.refresh_rounded),
          style: IconButton.styleFrom(backgroundColor: StaffColors.background, foregroundColor: StaffColors.textPrimary),
        ),
      ],
      children: [
        if (entries == null)
          const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
        else if (entries.isEmpty)
          const StaffCard(
            child: Column(
              children: [
                Icon(Icons.receipt_long_outlined, color: StaffColors.textMuted, size: 32),
                SizedBox(height: 10),
                Text('No transactions yet.', style: TextStyle(color: StaffColors.textSecondary)),
              ],
            ),
          )
        else
          for (var i = 0; i < entries.length; i++) ...[
            _TransactionTile(entries[i]),
            if (i != entries.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile(this.entry);
  final StaffTransactionEntry entry;

  IconData get _serviceIcon => switch (entry.serviceType.toLowerCase()) {
        'scanning' => Icons.document_scanner_outlined,
        'photocopying' => Icons.copy_all_outlined,
        _ => Icons.print_outlined,
      };

  (Color, String) get _printingStatusVisual => switch (entry.printingStatus.toLowerCase()) {
        'completed' || 'success' => (StaffColors.success, entry.printingStatus),
        'failed' => (StaffColors.danger, entry.printingStatus),
        _ => (StaffColors.textMuted, entry.printingStatus),
      };

  @override
  Widget build(BuildContext context) {
    final (statusColor, statusLabel) = _printingStatusVisual;
    return StaffCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StaffIconBadge(icon: _serviceIcon, color: StaffColors.primary, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        entry.serviceType.toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: StaffColors.textPrimary),
                      ),
                    ),
                    Text(entry.createdAt, style: const TextStyle(fontSize: 11, color: StaffColors.textMuted)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${entry.pageCount} page(s) × ${entry.copies} ${entry.copies == 1 ? 'copy' : 'copies'}',
                  style: const TextStyle(fontSize: 13, color: StaffColors.textSecondary),
                ),
                if (entry.amount != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    '₱${entry.amount!.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: StaffColors.textPrimary),
                  ),
                ],
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    StaffStatusPill(
                      label: 'Pay: ${entry.paymentStatus ?? '—'}',
                      color: (entry.paymentStatus ?? '').toUpperCase() == 'SUCCESS' ? StaffColors.success : StaffColors.textMuted,
                    ),
                    StaffStatusPill(label: statusLabel, color: statusColor),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
