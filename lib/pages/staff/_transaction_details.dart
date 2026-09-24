import 'package:flutter/material.dart';
import '../../transaction_record.dart';
import 'staff_theme.dart';

String formatStaffDateTime(DateTime? d) {
  if (d == null) return '—';
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final ampm = d.hour < 12 ? 'AM' : 'PM';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} $hour:${two(d.minute)} $ampm';
}

String formatPeso(num? v) => v == null ? '—' : '₱${v.toStringAsFixed(2)}';

(Color, String) transactionStatusVisual(String displayStatus) => switch (displayStatus) {
      'COMPLETED' => (StaffColors.success, 'Completed'),
      'RECOVERED' => (StaffColors.success, 'Recovered (staff override)'),
      'PRINTING' => (StaffColors.primary, 'Printing'),
      'PAID' => (StaffColors.primary, 'Paid'),
      'RECOVERY_REQUIRED' => (StaffColors.danger, 'Recovery required'),
      'FAILED' => (StaffColors.danger, 'Failed'),
      'CANCELLED' => (StaffColors.textMuted, 'Cancelled'),
      'PENDING_PAYMENT' => (StaffColors.warning, 'Awaiting payment'),
      _ => (StaffColors.textMuted, displayStatus),
    };

(Color, String) paymentStatusVisual(String paymentStatus) => switch (paymentStatus) {
      'PAID' => (StaffColors.success, 'Paid'),
      'REFUNDED' => (StaffColors.warning, 'Refunded'),
      _ => (StaffColors.textMuted, 'Unpaid'),
    };

String _printStatusLabel(String? s) => switch (s) {
      null => 'No print job recorded',
      'printing' => 'Printing (no result from printer yet)',
      'submitted' => 'Completed according to software',
      'failed' => 'Failed (error detected)',
      _ => s,
    };

String _serviceLabel(String? s) => switch (s) {
      'photocopying' => 'Photocopy',
      'image-print' => 'Image print',
      'scanning' => 'Scan',
      null => '—',
      _ => 'Document print',
    };

/// Full record for one transaction: payment → print job → printer result →
/// recovery events. Nothing here is computed on the kiosk except formatting.
class TransactionDetailsView extends StatelessWidget {
  const TransactionDetailsView({super.key, required this.record});
  final TransactionRecord record;

  @override
  Widget build(BuildContext context) {
    final r = record;
    final (payColor, payLabel) = paymentStatusVisual(r.paymentStatus);
    final (statusColor, statusLabel) = transactionStatusVisual(r.displayStatus);
    final hasJob = r.printJobId != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            StaffStatusPill(label: statusLabel, color: statusColor),
            StaffStatusPill(label: 'Payment: $payLabel', color: payColor),
          ],
        ),
        const SizedBox(height: 12),
        _Section(title: 'Transaction', rows: [
          ('Transaction ID', r.id),
          ('Date & time', formatStaffDateTime(r.createdAt)),
          ('Payment reference', r.referenceNumber.isEmpty ? '—' : r.referenceNumber),
          ('Amount paid', formatPeso(r.amount)),
          ('Service', _serviceLabel(r.serviceType)),
        ]),
        if (hasJob) ...[
          _Section(title: 'Document & print settings', rows: [
            ('Document', r.documentNames.isEmpty ? '—' : r.documentNames.join(', ')),
            ('Document type', r.documentType ?? '—'),
            ('Pages', r.pageCount == null ? '—' : '${r.pageCount} page(s)'),
            ('Copies', r.copies?.toString() ?? '—'),
            ('Total pages', r.totalPages == null ? '—' : '${r.totalPages} page(s)'),
            ('Paper size', r.paperSize ?? '—'),
            ('Color', r.colorMode == null ? '—' : (r.colorMode == 'color' ? 'Color' : 'Black & White')),
            ('Quality', r.quality == null ? '—' : _capitalize(r.quality!)),
            ('Sides', r.duplex == null ? '—' : (r.duplex! ? 'Duplex (2-sided)' : 'Simplex (1-sided)')),
            ('Price per page', formatPeso(r.unitPrice)),
          ]),
          _Section(title: 'Printer result', rows: [
            ('Print job ID', r.printJobId ?? '—'),
            if (r.printerJobId != null) ('Printer job ref', r.printerJobId!),
            ('Printer', r.printerName ?? '—'),
            ('Status', _printStatusLabel(r.printStatus)),
            ('Print started', formatStaffDateTime(r.printStartedAt)),
            ('Print completed', formatStaffDateTime(r.printCompletedAt)),
            if (r.printError != null) ('Error', r.printError!),
          ]),
        ] else
          const _Section(title: 'Print job', rows: [('Status', 'No print job recorded for this transaction')]),
        if (r.recoveries.isNotEmpty)
          _Section(
            title: 'Recovery history',
            rows: [
              for (final e in r.recoveries) ...[
                ('Recovery', '${e.id.substring(0, e.id.length.clamp(0, 8)).toUpperCase()} · ${formatStaffDateTime(e.createdAt)}'),
                ('Staff', e.staffName),
                ('Reason', '${recoveryReasonLabels[e.reason] ?? e.reason}${e.reasonNote != null ? ': ${e.reasonNote}' : ''}'),
                ('Charged', '₱0.00 (payment bypassed)'),
                ('Result', switch (e.result) {
                  'success' => 'Reprint sent to printer',
                  'failed' => 'Reprint failed',
                  _ => 'Reprint in progress',
                }),
              ],
            ],
          ),
      ],
    );
  }

  static String _capitalize(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.rows});
  final String title;
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: StaffColors.background,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: StaffColors.textSecondary)),
          const SizedBox(height: 6),
          for (final (label, value) in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 120,
                    child: Text(label, style: const TextStyle(fontSize: 12.5, color: StaffColors.textSecondary)),
                  ),
                  Expanded(
                    child: SelectableText(
                      value,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: StaffColors.textPrimary),
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

Future<void> showTransactionDetailsSheet(BuildContext context, TransactionRecord record) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Transaction details',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
          const SizedBox(height: 8),
          TransactionDetailsView(record: record),
        ],
      ),
    ),
  );
}
