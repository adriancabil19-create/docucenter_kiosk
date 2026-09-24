import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../payment_service.dart';
import '../config.dart';
import '../print_service.dart';
import '../kiosk_runtime_service.dart';
import '../receipt_format.dart';

// ============================================================================
// PAYMONGO Payment Page — top-level page shown when user navigates to 'payment'
// ============================================================================

class PAYMONGOPaymentPage extends StatefulWidget {
  final Function(String) onNavigate;

  const PAYMONGOPaymentPage({
    super.key,
    required this.onNavigate,
  });

  @override
  State<PAYMONGOPaymentPage> createState() => PAYMONGOPaymentPageState();
}

class PAYMONGOPaymentPageState extends State<PAYMONGOPaymentPage> {
  // Static cross-page state — set before navigating to 'payment'
  static double pendingAmount = 50.0;
  static String printContent = '';
  static List<dynamic> printFiles =
      []; // Can be List<String> or List<Uint8List>
  static String paperSize = 'A4';
  static String colorMode = 'bw';
  static String quality = 'standard';
  static int copies = 1;
  static bool duplex = false;

  /// IDs of the documents selected for this job — kept alongside the settings
  /// above so the printing page can restore the exact same job (files +
  /// settings) if the customer backs out of the payment/consent screen to
  /// fix a mistake (e.g. wrong paper size) instead of starting over.
  static List<String> selectedDocIds = [];

  /// Receipt content from the requested service that should be displayed
  /// after payment succeeds (e.g., photocopying receipt). Cleared on return.
  static String pendingReceiptContent = '';

  /// Optional async job to run after payment succeeds (e.g., backend scan+print).
  /// Receives the now-paid transaction's id, so the job can link its print
  /// job back to the transaction (needed for Staff Print Recovery).
  static Future<void> Function(String? transactionId)? pendingJob;

  bool _showReceiptScreen = false;
  String _receiptDisplayText = '';
  int _receiptSecondsLeft = 15;
  Timer? _receiptTimer;

  bool _showCancelScreen = false;
  int _cancelSecondsLeft = 5;
  Timer? _cancelTimer;

  /// Data-processing / terms consent must be given before a payment link is
  /// generated. Required under RA 10173 (Data Privacy Act) and RA 7394.
  bool _consentAccepted = false;
  bool _consentChecked = false;

  void _clearPaymentState() {
    PAYMONGOPaymentPageState.printFiles = [];
    PAYMONGOPaymentPageState.paperSize = 'A4';
    PAYMONGOPaymentPageState.colorMode = 'bw';
    PAYMONGOPaymentPageState.quality = 'standard';
    PAYMONGOPaymentPageState.copies = 1;
    PAYMONGOPaymentPageState.duplex = false;
    PAYMONGOPaymentPageState.selectedDocIds = [];
    PAYMONGOPaymentPageState.pendingReceiptContent = '';
    PAYMONGOPaymentPageState.printContent = '';
    PAYMONGOPaymentPageState.pendingJob = null;
  }

  /// Back to the print settings screen to fix a mistake (e.g. wrong paper
  /// size) — unlike [_returnToHome]/Cancel, this deliberately does NOT clear
  /// the static job state above, so Services can restore the same job.
  void _handleBackToSettings() {
    widget.onNavigate('services');
  }

  void _cancelReceiptTimer() {
    _receiptTimer?.cancel();
    _receiptTimer = null;
  }

  void _cancelCancelTimer() {
    _cancelTimer?.cancel();
    _cancelTimer = null;
  }

  void _returnToHome() {
    _cancelReceiptTimer();
    _cancelCancelTimer();
    _clearPaymentState();
    if (mounted) {
      setState(() {
        _showReceiptScreen = false;
        _showCancelScreen = false;
      });
      widget.onNavigate('services');
    }
  }

  void _startCancelTimer() {
    _cancelCancelTimer();
    setState(() {
      _cancelSecondsLeft = 5;
    });
    _cancelTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _cancelSecondsLeft--;
      });
      if (_cancelSecondsLeft <= 0) {
        timer.cancel();
        _returnToHome();
      }
    });
  }

  void _startReceiptTimer() {
    _cancelReceiptTimer();
    setState(() {
      _receiptSecondsLeft = 15;
    });
    _receiptTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _receiptSecondsLeft--;
      });
      if (_receiptSecondsLeft <= 0) {
        timer.cancel();
        _returnToHome();
      }
    });
  }

  @override
  void dispose() {
    _cancelReceiptTimer();
    _cancelCancelTimer();
    super.dispose();
  }

  /// Consent screen shown before any PayMongo payment link is generated.
  /// The user cannot proceed to payment until the checkbox is ticked.
  Widget _buildConsentGate(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Tooltip(
                  message: 'Back to settings — fix paper size, copies, etc.',
                  child: IconButton(
                    onPressed: _handleBackToSettings,
                    icon: const Icon(Icons.arrow_back),
                    style: IconButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Semantics(
                header: true,
                child: Text(
                  'Before you pay',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                ),
                child: Text(
                  'To do this job the kiosk briefly processes the file(s) you '
                  'provide or scan. Files are used only to complete your job and '
                  'are deleted afterwards (within 24 hours at the latest). We keep '
                  'a payment record — reference number, amount, status, time — '
                  'not your name and not your document’s contents.\n\n'
                  'Payment is handled by PayMongo on its own secure page; we never '
                  'see your card or e-wallet details. We use no tracking and no '
                  'analytics.\n\n'
                  'You are responsible for having the right to copy the '
                  'document(s) you are submitting. Do not scan or copy private '
                  'images of another person without their consent.',
                  style: TextStyle(fontSize: 14, height: 1.55, color: Theme.of(context).colorScheme.onSurface),
                ),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => widget.onNavigate('legal'),
                  icon: const Icon(Icons.description_outlined, size: 18),
                  label: const Text('Read the Terms, Privacy & Refund policies'),
                ),
              ),
              const SizedBox(height: 4),
              CheckboxListTile(
                value: _consentChecked,
                onChanged: (v) => setState(() => _consentChecked = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  'I have read and agree to the Terms & Conditions, Privacy '
                  'Policy, and Refund Policy, and I am allowed to copy the '
                  'document(s) I am submitting.',
                  style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurface),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => widget.onNavigate('services'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _consentChecked
                          ? () => setState(() => _consentAccepted = true)
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        minimumSize: const Size(0, 48),
                      ),
                      child: Text('Continue to payment '
                          '(₱${pendingAmount.toStringAsFixed(2)})'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: _showCancelScreen
              ? GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _returnToHome,
                  child: Container(
                    color: const Color(0xFFFFF7F7),
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 560),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 96,
                              height: 96,
                              decoration: BoxDecoration(
                                color: Colors.red[50],
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.cancel_outlined,
                                  size: 56, color: Colors.red),
                            ),
                            const SizedBox(height: 24),
                            Text(
                              'Payment Cancelled',
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineSmall
                                  ?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.red[700],
                                  ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'Your payment was not completed.',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium
                                  ?.copyWith(color: Colors.grey[600]),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 32),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.red[50],
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.red[200]!),
                              ),
                              child: Column(
                                children: [
                                  Text(
                                    'Returning to services in $_cancelSecondsLeft seconds...',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyLarge
                                        ?.copyWith(
                                          fontWeight: FontWeight.w600,
                                          color: Colors.red[700],
                                        ),
                                    textAlign: TextAlign.center,
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Tap anywhere to return now',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(color: Colors.grey[600]),
                                    textAlign: TextAlign.center,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                )
              : _showReceiptScreen
              ? GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _returnToHome,
                  child: Container(
                    color: const Color(0xFFF8FAFC),
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 760),
                        child: Column(
                          mainAxisSize: MainAxisSize.max,
                          children: [
                            Expanded(
                              child: Container(
                                width: double.infinity,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(24),
                                  border: Border.all(color: Colors.grey[300]!),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.04),
                                      blurRadius: 24,
                                      offset: const Offset(0, 12),
                                    ),
                                  ],
                                ),
                                padding: const EdgeInsets.all(28),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.center,
                                  children: [
                                    Container(
                                      width: 72,
                                      height: 5,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF2563EB),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                    ),
                                    const SizedBox(height: 18),
                                    Text(
                                      'Receipt',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .headlineMedium
                                          ?.copyWith(
                                            fontWeight: FontWeight.bold,
                                            color: const Color(0xFF0F172A),
                                          ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Digital proof of payment',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(
                                            color: Colors.grey[600],
                                            letterSpacing: 0.2,
                                          ),
                                    ),
                                    const SizedBox(height: 28),
                                    // Fills the remaining card height and picks the
                                    // largest font size that fits it — job details
                                    // (esp. photocopying) can be long enough to
                                    // overflow a fixed size, and this screen must
                                    // never scroll. receiptFontSize() picks a
                                    // font size sized to the real content so it
                                    // doesn't look stranded in empty space, and
                                    // the FittedBox is a safety net: on a very
                                    // short viewport (or if the size estimate is
                                    // slightly off — Courier's real glyph width
                                    // isn't known ahead of layout) it shrinks
                                    // further rather than ever letting the text
                                    // overflow into the footer/countdown below.
                                    Expanded(
                                      child: Container(
                                        width: double.infinity,
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 24, horizontal: 20),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                                          borderRadius: BorderRadius.circular(18),
                                          border: Border.all(
                                            color: const Color(0xFF2563EB).withValues(alpha: 0.12),
                                          ),
                                        ),
                                        child: LayoutBuilder(
                                          builder: (context, constraints) => Center(
                                            child: FittedBox(
                                              fit: BoxFit.scaleDown,
                                              child: Text(
                                                _receiptDisplayText,
                                                textAlign: TextAlign.center,
                                                style: TextStyle(
                                                  fontFamily: 'Courier',
                                                  fontSize: receiptFontSize(
                                                    _receiptDisplayText,
                                                    constraints.maxWidth,
                                                    constraints.maxHeight,
                                                  ),
                                                  height: 1.65,
                                                  letterSpacing: 0.4,
                                                  color: const Color(0xFF0F172A),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 28),
                                    Text(
                                      'Tap anywhere to return to the home screen.',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: Colors.grey[600],
                                            fontWeight: FontWeight.w500,
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE0F2FE),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Text(
                                'Returning to home in $_receiptSecondsLeft seconds...',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyLarge
                                    ?.copyWith(fontWeight: FontWeight.w600),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                )
              : !_consentAccepted
              ? SingleChildScrollView(child: _buildConsentGate(context))
              : SingleChildScrollView(
                  child: PaymentInterface(
                    amount: pendingAmount,
                    onPaymentComplete: (success, receiptText, transactionId) async {
                      if (success) {
                        // Fire any pending backend job (e.g. photocopy scan+print) async
                        if (pendingJob != null) {
                          final messenger = ScaffoldMessenger.of(context);
                          pendingJob!(transactionId).then((_) {
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Job completed successfully!'),
                                backgroundColor: Colors.green,
                              ),
                            );
                          }).catchError((e) {
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text('Job error: $e'),
                                backgroundColor: Colors.red,
                              ),
                            );
                          });
                        }
                        if (printFiles.isNotEmpty) {
                          try {
                            bool printSuccess;
                            if (printFiles.first is Uint8List) {
                              printSuccess = await PrintingService.printScannedImages(
                                List<Uint8List>.from(printFiles),
                                paperSize: paperSize,
                                colorMode: colorMode,
                                quality: quality,
                                duplex: duplex,
                                transactionId: transactionId,
                              );
                            } else {
                              printSuccess = await PrintingService.printFromStorage(
                                List<String>.from(printFiles),
                                paperSize: paperSize,
                                colorMode: colorMode,
                                quality: quality,
                                duplex: duplex,
                                transactionId: transactionId,
                                customerCopies: copies,
                              );
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(printSuccess
                                    ? 'Payment successful! Printing started...'
                                    : 'Payment successful but printing failed'),
                                backgroundColor:
                                    printSuccess ? Colors.green : Colors.orange,
                              ),
                            );
                          } catch (e) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Payment successful but printing error: $e'),
                                backgroundColor: Colors.orange,
                              ),
                            );
                          } finally {
                            // Print job finished (success or failure) — paper
                            // may have been consumed either way. One
                            // event-triggered poll, not a timer.
                            KioskRuntime.instance.pollPaperTraysOnce('print_completed');
                          }
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Payment successful!'),
                              backgroundColor: Colors.green,
                            ),
                          );
                        }

                        setState(() {
                          _receiptDisplayText = receiptText ??
                              'Payment successful. Thank you for using our service.';
                          _showReceiptScreen = true;
                        });
                        _startReceiptTimer();
                      } else {
                        _clearPaymentState();
                        setState(() => _showCancelScreen = true);
                        _startCancelTimer();
                      }
                    },
                    onTimeout: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Payment timeout. Returning to services...'),
                          backgroundColor: Colors.orange,
                        ),
                      );
                      Future.delayed(const Duration(seconds: 2), () {
                        if (mounted) widget.onNavigate('services');
                      });
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

// ============================================================================
// PaymentInterface widget — handles payment flow and status display
// ============================================================================

class PaymentInterface extends StatefulWidget {
  final double amount;
  final Future<void> Function(bool success, String? receiptText, String? transactionId) onPaymentComplete;
  final Function() onTimeout;

  const PaymentInterface({
    super.key,
    required this.amount,
    required this.onPaymentComplete,
    required this.onTimeout,
  });

  @override
  State<PaymentInterface> createState() => _PaymentInterfaceState();
}

class _PaymentInterfaceState extends State<PaymentInterface> {
  PaymentTransaction? _transaction;
  String _paymentStatus = 'pending';
  late int _timeLeft;
  String? _errorMessage;
  bool _isLoading = true;
  late bool _showDevTools;

  final PAYMONGOPaymentService _paymentService = PAYMONGOPaymentService();
  Timer? _pollingTimer;
  Timer? _countdownTimer;
  PaymentPollingManager? _pollingManager;

  // Cache the decoded QR bytes by source string so the once-a-second
  // countdown rebuild reuses the same Uint8List instance instead of
  // re-decoding — Image.memory keys its cache on object identity, so a fresh
  // Uint8List every rebuild made it flicker even though the content never
  // changed for the lifetime of a given transaction's QR code.
  String? _cachedQrCodeSource;
  Uint8List? _cachedQrCodeBytes;

  @override
  void initState() {
    super.initState();
    _showDevTools = UiConfig.showDevelopmentTools;
    _transaction = null;
    _timeLeft = 300;
    _initializePayment();
  }

  Future<void> _initializePayment() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      final transaction = await _paymentService.createPayment(
        amount: PAYMONGOPaymentPageState.pendingAmount,
        serviceType: 'document_service',
        documentCount: 1,
      );

      if (!mounted) return;

      setState(() {
        _transaction = transaction;
        _isLoading = false;
        _paymentStatus = 'pending';
        _timeLeft = transaction.expiresIn;
      });

      _startCountdownTimer();
      _startPolling();
    } catch (e) {
      if (!mounted) return;

      final demoTransaction = PaymentTransaction(
        transactionId: 'DEMO-${DateTime.now().millisecondsSinceEpoch}',
        referenceNumber:
            'REF-${DateTime.now().millisecondsSinceEpoch.toString().substring(0, 8)}',
        qrCode: 'code_8T7GbSP9ztU2tQUJ5WQyJ5Cn',
        expiresIn: 300,
        amount: widget.amount,
        status: 'PENDING',
      );

      setState(() {
        _isLoading = false;
        _transaction = demoTransaction;
        _paymentStatus = 'pending';
        _timeLeft = 300;
        _errorMessage = 'Running in Demo Mode (Backend not available)';
      });

      _startCountdownTimer();
    }
  }

  void _startCountdownTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _timeLeft--;
        if (_timeLeft <= 0) {
          timer.cancel();
          if (_paymentStatus == 'pending') _handleTimeout();
        }
      });
    });
  }

  void _startPolling() {
    if (_transaction == null) return;

    _pollingManager = PaymentPollingManager(
      transactionId: _transaction!.transactionId,
      onStatusUpdate: (PaymentStatus status) {
        if (!mounted) return;
        setState(() => _paymentStatus = status.status.toLowerCase());
        if (status.isSuccessful) {
          _handlePaymentSuccess();
        } else if (status.isFailed) {
          _handlePaymentFailure(
            status.status == 'EXPIRED' ? 'Payment expired' : 'Payment failed',
          );
        }
      },
      onError: (error) {
        if (!mounted) return;
        setState(() => _errorMessage = error);
      },
    );

    _pollingManager!.startPolling();
  }

  Future<void> _handlePaymentSuccess() async {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    if (mounted) setState(() => _paymentStatus = 'success');

    final receiptText = _buildReceiptDisplayText();

    await Future.delayed(const Duration(milliseconds: 200));
    if (mounted) await widget.onPaymentComplete(true, receiptText, _transaction?.transactionId);
  }

  String _buildReceiptDisplayText() {
    final jobDetails = PAYMONGOPaymentPageState.printContent;
    final lines = <String>[
      kReceiptDivider,
      centerReceiptLine('DOCUCENTER KIOSK'),
      centerReceiptLine('Official Payment Receipt'),
      kReceiptDivider,
      '',
      receiptRow('Date', formatReceiptDate(DateTime.now())),
      receiptRow('Transaction ID', _transaction?.transactionId ?? 'N/A'),
      receiptRow('Reference No.', _transaction?.referenceNumber ?? 'N/A'),
      kReceiptSubDivider,
      jobDetails.isNotEmpty ? jobDetails : 'Standard Receipt',
      kReceiptSubDivider,
      receiptRow('Amount Paid', 'PHP ${widget.amount.toStringAsFixed(2)}'),
      receiptRow('Status', 'PAID'),
      kReceiptDivider,
      '',
      centerReceiptLine('Thank you for choosing DocuCenter!'),
      centerReceiptLine('Please keep this receipt for your records.'),
    ];
    return lines.join('\n');
  }

  void _handlePaymentFailure(String reason) {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    if (mounted) {
      setState(() {
        _paymentStatus = 'failed';
        _errorMessage = reason;
      });
    }
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) widget.onPaymentComplete(false, null, null);
    });
  }

  void _handleTimeout() {
    if (_transaction != null && _paymentStatus != 'success') {
      _paymentService.cancelPayment(_transaction!.transactionId,
          reason: 'Payment timeout');
    }
    setState(() {
      _paymentStatus = 'expired';
      _errorMessage = 'Payment link expired. Please try again.';
    });
    widget.onTimeout();
  }

  Future<void> _cancelPayment() async {
    if (_transaction == null) return;
    try {
      _countdownTimer?.cancel();
      _pollingTimer?.cancel();
      await _paymentService.cancelPayment(_transaction!.transactionId,
          reason: 'User cancelled');
      setState(() => _paymentStatus = 'cancelled');
      widget.onPaymentComplete(false, null, null);
    } catch (e) {
      setState(() => _errorMessage = 'Failed to cancel payment: $e');
    }
  }

  String _formatTime(int seconds) {
    final mins = seconds ~/ 60;
    final secs = seconds % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  Uint8List? _decodeQRCodeImage(String qrCode) {
    if (_cachedQrCodeSource == qrCode) return _cachedQrCodeBytes;

    final match =
        RegExp(r'data:image/[a-zA-Z]+;base64,(.+)').firstMatch(qrCode);
    final bytes = match == null ? null : _tryDecodeBase64(match.group(1)!);

    _cachedQrCodeSource = qrCode;
    _cachedQrCodeBytes = bytes;
    return bytes;
  }

  Uint8List? _tryDecodeBase64(String data) {
    try {
      return base64Decode(data);
    } catch (_) {
      return null;
    }
  }

  Future<void> _simulateSuccess() async {
    if (_transaction == null) return;
    // Stop polling FIRST to prevent double-trigger from the polling loop
    _pollingManager?.stopPolling();
    _countdownTimer?.cancel();

    // Notify backend (best-effort — silently ignored if backend is unavailable)
    // Do NOT send filenames here; all printing is handled by _handlePaymentSuccess
    _paymentService
        .simulatePaymentSuccess(_transaction!.transactionId)
        .ignore();

    // Trigger the full success flow locally
    await _handlePaymentSuccess();
  }

  Future<void> _simulateFailure() async {
    if (_transaction == null) return;
    try {
      await _paymentService.simulatePaymentFailure(_transaction!.transactionId);
      if (!mounted) return;
      try {
        final cancelReceipt = <String>[
          kReceiptDivider,
          centerReceiptLine('DOCUCENTER KIOSK'),
          centerReceiptLine('Payment Cancelled'),
          kReceiptDivider,
          '',
          receiptRow('Date', formatReceiptDate(DateTime.now())),
          receiptRow('Transaction ID', _transaction!.transactionId),
          receiptRow('Reference No.', _transaction!.referenceNumber),
          kReceiptSubDivider,
          receiptRow('Status', 'CANCELLED'),
          receiptRow('Reason', 'Simulated failure'),
          kReceiptDivider,
          '',
          centerReceiptLine('No files were printed.'),
        ].join('\n');
        final printed = await PrintService.printReceipt(cancelReceipt);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(printed
                ? 'Cancellation receipt printed.'
                : 'Print unavailable (demo mode)'),
            backgroundColor: printed ? Colors.green : Colors.orange,
            duration: const Duration(seconds: 3),
          ),
        );
      } catch (e) {
        debugPrint('Error printing cancellation receipt: $e');
      }
    } catch (e) {
      debugPrint('Simulate failure error: $e');
    }
  }

  Future<void> _testPrintDirect() async {
    try {
      final paperSize = PAYMONGOPaymentPageState.paperSize;
      final success = await PrintService.printTestPage(paperSize: paperSize);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success
              ? 'Test page sent to printer ($paperSize)'
              : 'Print unavailable — check PrintSimulation/ folder'),
          backgroundColor: success ? Colors.green : Colors.orange,
          duration: const Duration(seconds: 3),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Print test error: $e'), backgroundColor: Colors.red),
      );
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    _pollingManager?.stopPolling();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.credit_card, size: 32, color: Color(0xFF2563EB)),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PAYMONGO Payment',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const Text(
                    'Scan the QR code with your PAYMONGO app to complete payment'),
              ],
            ),
          ],
        ),
        const SizedBox(height: 32),
        if (_isLoading)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(
                      width: 50,
                      height: 50,
                      child: CircularProgressIndicator(
                        strokeWidth: 4,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text('Generating payment link...',
                        style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ),
            ),
          )
        else if (_paymentStatus == 'failed' || _paymentStatus == 'cancelled')
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline,
                        size: 80, color: Colors.red),
                    const SizedBox(height: 16),
                    Text(
                      _paymentStatus == 'cancelled'
                          ? 'Payment Cancelled'
                          : 'Payment Failed',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: Colors.red,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _errorMessage ?? 'An error occurred',
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          )
        else if (_paymentStatus == 'success')
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                          color: Colors.green[100], shape: BoxShape.circle),
                      child: const Icon(Icons.check,
                          size: 50, color: Colors.green),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Payment Successful!',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: Colors.green,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text('Your service is being processed',
                        style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ),
            ),
          )
        else if (_transaction != null)
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Timer
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: _timeLeft < 60
                            ? Colors.red[50]
                            : const Color(0xFFF0F9FF),
                        border: Border.all(
                          color: _timeLeft < 60
                              ? Colors.red
                              : const Color(0xFF60A5FA),
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          Text('Time Remaining',
                              style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 8),
                          Text(
                            _formatTime(_timeLeft),
                            style: Theme.of(context)
                                .textTheme
                                .headlineLarge
                                ?.copyWith(
                                  color: _timeLeft < 60
                                      ? Colors.red
                                      : const Color(0xFF2563EB),
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Amount
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0F9FF),
                        border: Border.all(color: const Color(0xFF60A5FA)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          Text('Amount to Pay',
                              style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 8),
                          Text(
                            '₱${_transaction!.amount.toStringAsFixed(2)}',
                            style: Theme.of(context)
                                .textTheme
                                .headlineMedium
                                ?.copyWith(
                                  color: const Color(0xFF2563EB),
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // QR Code — rendered from backend payload
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(
                            color: const Color(0xFFD5D7E0), width: 2),
                        borderRadius: BorderRadius.circular(8),
                        color: Colors.white,
                      ),
                      child: Column(
                        children: [
                          Text('Scan with PAYMONGO',
                              style: Theme.of(context).textTheme.labelMedium),
                          const SizedBox(height: 12),
                          Container(
                            width: 280,
                            height: 280,
                            color: Colors.white,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                Builder(builder: (context) {
                                  final qrCode = _transaction!.qrCode;
                                  final qrImageBytes =
                                      _decodeQRCodeImage(qrCode);

                                  if (qrImageBytes != null) {
                                    return Image.memory(
                                      qrImageBytes,
                                      width: 280,
                                      height: 280,
                                      fit: BoxFit.contain,
                                      errorBuilder:
                                          (context, error, stackTrace) =>
                                              const Center(
                                        child: Text('Invalid QR image',
                                            textAlign: TextAlign.center),
                                      ),
                                    );
                                  }

                                  return QrImageView(
                                    data: qrCode,
                                    version: QrVersions.auto,
                                    size: 280,
                                    backgroundColor: Colors.white,
                                    errorCorrectionLevel: QrErrorCorrectLevel.M,
                                    errorStateBuilder: (ctx2, _) =>
                                        const Center(
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.qr_code_2,
                                              size: 80, color: Colors.black54),
                                          SizedBox(height: 8),
                                          Text('QR unavailable',
                                              textAlign: TextAlign.center),
                                        ],
                                      ),
                                    ),
                                  );
                                }),
                                Builder(builder: (context) {
                                  final qrCode = _transaction!.qrCode;
                                  final qrImageBytes =
                                      _decodeQRCodeImage(qrCode);

                                  if (qrImageBytes == null) {
                                    return Container(
                                      width: 72,
                                      height: 72,
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        shape: BoxShape.circle,
                                        boxShadow: [
                                          BoxShadow(
                                            color:
                                                Colors.black.withValues(alpha: 0.12),
                                            blurRadius: 6,
                                            offset: const Offset(0, 2),
                                          ),
                                        ],
                                      ),
                                      child: const Center(
                                        child: Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Text(
                                              'QR',
                                              style: TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.bold,
                                                color: Color(0xFF003D99),
                                              ),
                                            ),
                                            SizedBox(height: 2),
                                            Text(
                                              'Ph',
                                              style: TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.bold,
                                                color: Color(0xFFEE2B2B),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    );
                                  }

                                  return const SizedBox.shrink();
                                }),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Reference Number
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Reference Number',
                              style: Theme.of(context).textTheme.labelSmall),
                          const SizedBox(height: 4),
                          Text(
                            _transaction!.referenceNumber,
                            style:
                                Theme.of(context).textTheme.bodySmall?.copyWith(
                                      fontFamily: 'monospace',
                                      fontWeight: FontWeight.w500,
                                    ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Demo Mode notice
                    if (_errorMessage != null &&
                        _errorMessage!.contains('Demo Mode'))
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.orange[50],
                          border: Border.all(color: Colors.orange),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.info,
                                color: Colors.orange[700], size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _errorMessage!,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: Colors.orange[900]),
                              ),
                            ),
                          ],
                        ),
                      ),

                    // Instructions
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.blue[50],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'How to Pay:',
                            style: Theme.of(context)
                                .textTheme
                                .labelMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 12),
                          _buildStep('1', 'Open your PAYMONGO app', context),
                          const SizedBox(height: 8),
                          _buildStep(
                              '2', 'Tap the scan/camera button', context),
                          const SizedBox(height: 8),
                          _buildStep(
                              '3', 'Point at the QR code above', context),
                          const SizedBox(height: 8),
                          _buildStep(
                              '4', 'Enter your MPIN to confirm', context),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Status badge
                    if (_paymentStatus != 'pending')
                      Container(
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.amber[50],
                          border: Border.all(color: Colors.amber),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.info,
                                color: Colors.amber[700], size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Status: ${_paymentStatus.toUpperCase()}',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: Colors.amber[900]),
                              ),
                            ),
                          ],
                        ),
                      ),

                    // Cancel
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: _cancelPayment,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.grey[300],
                              foregroundColor: Colors.black,
                            ),
                            child: const Text('Cancel Payment'),
                          ),
                        ),
                      ],
                    ),

                    // Dev tools
                    if (_showDevTools)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Column(
                          children: [
                            Divider(color: Colors.grey[300]),
                            const SizedBox(height: 12),
                            Text(
                              'Development Testing',
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall
                                  ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: _simulateSuccess,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.green[400],
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text('Simulate Success',
                                        style: TextStyle(fontSize: 12)),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: _simulateFailure,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.red[400],
                                      foregroundColor: Colors.white,
                                    ),
                                    child: const Text('Simulate Failure',
                                        style: TextStyle(fontSize: 12)),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            ElevatedButton.icon(
                              onPressed: _testPrintDirect,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.blue[600],
                                foregroundColor: Colors.white,
                              ),
                              icon: const Icon(Icons.print, size: 16),
                              label: const Text('Test Printer',
                                  style: TextStyle(fontSize: 12)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildStep(String number, String text, BuildContext ctx) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
              color: Color(0xFF2563EB), shape: BoxShape.circle),
          child: Center(
            child: Text(
              number,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 12),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(text, style: Theme.of(ctx).textTheme.bodySmall)),
      ],
    );
  }
}
