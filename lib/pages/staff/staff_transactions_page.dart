import 'package:flutter/material.dart';
import '../../staff_service.dart';
import '_staff_scaffold.dart';
import '_transaction_details.dart';
import 'staff_theme.dart';

/// Transaction history with the full paid print configuration and printer
/// result per row — compact by default, tap a row to expand it. No customer
/// personal information exists in this schema, so nothing needs redacting.
class StaffTransactionsPage extends StatefulWidget {
  const StaffTransactionsPage({super.key, required this.onBack});
  final VoidCallback onBack;

  @override
  State<StaffTransactionsPage> createState() => _StaffTransactionsPageState();
}

class _StaffTransactionsPageState extends State<StaffTransactionsPage> {
  List<TransactionRecord>? _entries;
  String? _expandedId;

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
            _TransactionTile(
              entries[i],
              expanded: _expandedId == entries[i].id,
              onToggle: () => setState(() => _expandedId = _expandedId == entries[i].id ? null : entries[i].id),
            ),
            if (i != entries.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile(this.record, {required this.expanded, required this.onToggle});
  final TransactionRecord record;
  final bool expanded;
  final VoidCallback onToggle;

  IconData get _serviceIcon => switch ((record.serviceType ?? '').toLowerCase()) {
        'scanning' => Icons.document_scanner_outlined,
        'photocopying' => Icons.copy_all_outlined,
        _ => Icons.print_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final r = record;
    final (statusColor, statusLabel) = transactionStatusVisual(r.displayStatus);
    final (payColor, payLabel) = paymentStatusVisual(r.paymentStatus);
    final pagesLine = r.pageCount == null
        ? null
        : '${r.pageCount} page(s) × ${r.copies ?? 1} ${(r.copies ?? 1) == 1 ? 'copy' : 'copies'}'
            '${r.paperSize != null ? ' · ${r.paperSize}' : ''}'
            '${r.colorMode != null ? ' · ${r.colorMode == 'color' ? 'Color' : 'B&W'}' : ''}';

    return StaffCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
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
                                r.printJobId == null ? r.id : r.documentLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: StaffColors.textPrimary),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(formatStaffDateTime(r.createdAt), style: const TextStyle(fontSize: 11, color: StaffColors.textMuted)),
                          ],
                        ),
                        if (pagesLine != null) ...[
                          const SizedBox(height: 4),
                          Text(pagesLine, style: const TextStyle(fontSize: 13, color: StaffColors.textSecondary)),
                        ],
                        const SizedBox(height: 2),
                        Text(
                          formatPeso(r.amount),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: StaffColors.textPrimary),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: [
                                  StaffStatusPill(label: payLabel, color: payColor),
                                  StaffStatusPill(label: statusLabel, color: statusColor),
                                ],
                              ),
                            ),
                            Icon(
                              expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                              color: StaffColors.textMuted,
                              semanticLabel: expanded ? 'Hide details' : 'View details',
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            alignment: Alignment.topCenter,
            child: expanded
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                    child: TransactionDetailsView(record: r),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}
