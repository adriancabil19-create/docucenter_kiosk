/// A transaction with its original print job, the printer's reported result,
/// and any staff recovery events, as returned by the backend's detailed
/// transaction query (Staff Transactions and Print Recovery both use it).
class TransactionRecord {
  final String id;
  final String referenceNumber;
  final double amount;
  final String rawStatus;

  /// PAID, UNPAID, or REFUNDED.
  final String paymentStatus;

  /// PENDING_PAYMENT, CANCELLED, FAILED, PAID, PRINTING, COMPLETED,
  /// RECOVERY_REQUIRED, or RECOVERED.
  final String displayStatus;
  final bool needsRecovery;
  final String? serviceType;
  final DateTime? createdAt;
  final String? printJobId;
  final String? printerJobId;
  final List<String> documentNames;
  final String? documentType;
  final String? paperSize;
  final int? copies;
  final int? pageCount;
  final int? totalPages;
  final String? colorMode;
  final String? quality;
  final bool? duplex;
  final double? unitPrice;
  final String? printStatus;
  final String? printerName;
  final DateTime? printStartedAt;
  final DateTime? printCompletedAt;
  final String? printError;
  final List<RecoveryEvent> recoveries;

  const TransactionRecord({
    required this.id,
    required this.referenceNumber,
    required this.amount,
    required this.rawStatus,
    required this.paymentStatus,
    required this.displayStatus,
    required this.needsRecovery,
    required this.serviceType,
    required this.createdAt,
    required this.printJobId,
    required this.printerJobId,
    required this.documentNames,
    required this.documentType,
    required this.paperSize,
    required this.copies,
    required this.pageCount,
    required this.totalPages,
    required this.colorMode,
    required this.quality,
    required this.duplex,
    required this.unitPrice,
    required this.printStatus,
    required this.printerName,
    required this.printStartedAt,
    required this.printCompletedAt,
    required this.printError,
    required this.recoveries,
  });

  /// Photocopy scans aren't kept, so these need the customer's originals re-scanned.
  bool get needsRescan => serviceType == 'photocopying';

  String get documentLabel => documentNames.isEmpty
      ? '—'
      : documentNames.length == 1
          ? documentNames.first
          : '${documentNames.first} +${documentNames.length - 1} more';

  factory TransactionRecord.fromJson(Map<String, dynamic> j) => TransactionRecord(
        id: j['id'] as String? ?? '',
        referenceNumber: j['reference_number'] as String? ?? '',
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        rawStatus: j['status'] as String? ?? '',
        paymentStatus: j['payment_status'] as String? ?? 'UNPAID',
        displayStatus: j['display_status'] as String? ?? 'PAID',
        needsRecovery: j['needs_recovery'] == true,
        serviceType: j['service_type'] as String?,
        createdAt: _date(j['created_at']),
        printJobId: j['print_job_id'] as String?,
        printerJobId: j['printer_job_id'] as String?,
        documentNames: (j['document_names'] as List<dynamic>? ?? []).cast<String>(),
        documentType: j['document_type'] as String?,
        paperSize: j['paper_size'] as String?,
        copies: (j['copies'] as num?)?.toInt(),
        pageCount: (j['page_count'] as num?)?.toInt(),
        totalPages: (j['total_pages'] as num?)?.toInt(),
        colorMode: j['color_mode'] as String?,
        quality: j['quality'] as String?,
        duplex: j['duplex'] as bool?,
        unitPrice: (j['unit_price'] as num?)?.toDouble(),
        printStatus: j['print_status'] as String?,
        printerName: j['printer_name'] as String?,
        printStartedAt: _date(j['print_started_at']),
        printCompletedAt: _date(j['print_completed_at']),
        printError: j['print_error'] as String?,
        recoveries: (j['recoveries'] as List<dynamic>? ?? [])
            .map((e) => RecoveryEvent.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class RecoveryEvent {
  final String id;
  final String staffName;
  final String reason;
  final String? reasonNote;
  final String result;
  final String? recoveryPrintJobId;
  final DateTime? createdAt;

  const RecoveryEvent({
    required this.id,
    required this.staffName,
    required this.reason,
    required this.reasonNote,
    required this.result,
    required this.recoveryPrintJobId,
    required this.createdAt,
  });

  factory RecoveryEvent.fromJson(Map<String, dynamic> j) => RecoveryEvent(
        id: j['id'] as String? ?? '',
        staffName: j['staff_name'] as String? ?? '',
        reason: j['reason'] as String? ?? 'other',
        reasonNote: j['reason_note'] as String?,
        result: j['result'] as String? ?? 'pending',
        recoveryPrintJobId: j['recovery_print_job_id'] as String?,
        createdAt: _date(j['created_at']),
      );
}

/// Labels for every reason the backend accepts; [offeredRecoveryReasons] is
/// the subset staff can pick today.
const recoveryReasonLabels = <String, String>{
  'paper_jam': 'Printer paper jam',
  'printer_error': 'Printer hardware error',
  'printer_failed_to_print': 'Printer failed to print',
  'printer_no_error_reported': 'Printer did not report error',
  'incorrect_output': 'Incorrect/partial print',
  'power_interruption': 'Power interruption',
  'printer_offline': 'Printer offline',
  'other': 'Other',
};

const offeredRecoveryReasons = <String>[
  'paper_jam',
  'printer_error',
  'printer_failed_to_print',
  'printer_no_error_reported',
  'incorrect_output',
  'other',
];

DateTime? _date(dynamic v) => v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;
