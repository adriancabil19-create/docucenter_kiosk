import 'package:flutter/material.dart';
import '../../staff_service.dart';
import '_staff_scaffold.dart';

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
      actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      children: [
        if (entries == null)
          const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: CircularProgressIndicator()))
        else if (entries.isEmpty)
          const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: Text('No transactions yet.')))
        else
          for (final e in entries) _TransactionTile(e),
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile(this.entry);
  final StaffTransactionEntry entry;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    entry.serviceType.toUpperCase(),
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),
                Text(entry.createdAt, style: const TextStyle(fontSize: 11, color: Colors.black54)),
              ],
            ),
            const SizedBox(height: 6),
            Text('Pages: ${entry.pageCount} × ${entry.copies} copies'),
            if (entry.amount != null) Text('Amount: ₱${entry.amount!.toStringAsFixed(2)}'),
            Text('Payment: ${entry.paymentStatus ?? '—'}   ·   Printing: ${entry.printingStatus}'),
          ],
        ),
      ),
    );
  }
}
