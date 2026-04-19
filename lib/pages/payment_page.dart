import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../payment_service.dart';
import '../config.dart';

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

  /// Receipt content from the requested service that should be displayed
  /// after payment succeeds (e.g., photocopying receipt). Cleared on return.
  static String pendingReceiptContent = '';

  bool _showReceiptScreen = false;
  String _receiptDisplayText = '';
  int _receiptSecondsLeft = 15;
  Timer? _receiptTimer;

  void _clearPaymentState() {
    PAYMONGOPaymentPageState.printFiles = [];
    PAYMONGOPaymentPageState.paperSize = 'A4';
    PAYMONGOPaymentPageState.colorMode = 'bw';
    PAYMONGOPaymentPageState.quality = 'standard';
    PAYMONGOPaymentPageState.pendingReceiptContent = '';
    PAYMONGOPaymentPageState.printContent = '';
  }

  void _cancelReceiptTimer() {
    _receiptTimer?.cancel();
    _receiptTimer = null;
  }

  void _returnToHome() {
    _cancelReceiptTimer();
    _clearPaymentState();
    if (mounted) {
      setState(() {
        _showReceiptScreen = false;
      });
      widget.onNavigate('services');
    }
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
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
          ),
          child: Row(
            children: [
              ElevatedButton.icon(
                onPressed: () => widget.onNavigate('services'),
                icon: const Icon(Icons.arrow_back),
                label: const Text('Back to Services'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey[300],
                  foregroundColor: Colors.black,
                ),
              ),
              const SizedBox(width: 16),
              Text(
                'PAYMONGO Payment',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: const Color(0xFF003D99),
                      fontWeight: FontWeight.bold,
                    ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _showReceiptScreen
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
                              child: SingleChildScrollView(
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(24),
                                    border: Border.all(color: Colors.grey[300]!),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.04),
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
                                      Container(
                                        width: double.infinity,
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 24, horizontal: 20),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF0F172A).withOpacity(0.03),
                                          borderRadius: BorderRadius.circular(18),
                                          border: Border.all(
                                            color: const Color(0xFF2563EB).withOpacity(0.12),
                                          ),
                                        ),
                                        child: Text(
                                          _receiptDisplayText,
                                          textAlign: TextAlign.center,
                                          style: const TextStyle(
                                            fontFamily: 'Courier',
                                            fontSize: 14,
                                            height: 1.65,
                                            letterSpacing: 0.4,
                                            color: Color(0xFF0F172A),
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
              : SingleChildScrollView(
                  child: PaymentInterface(
                    amount: pendingAmount,
                    onPaymentComplete: (success, receiptText) async {
                      if (success) {
                        if (printFiles.isNotEmpty) {
                          try {
                            bool printSuccess;
                            if (printFiles.first is Uint8List) {
                              printSuccess = await PrintService.printScannedImages(
                                List<Uint8List>.from(printFiles),
                                paperSize: paperSize,
                                colorMode: colorMode,
                                quality: quality,
                              );
                            } else {
                              printSuccess = await PrintService.printFromStorage(
                                List<String>.from(printFiles),
                                paperSize: paperSize,
                                colorMode: colorMode,
                                quality: quality,
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
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Payment failed. Please try again.'),
                            backgroundColor: Colors.red,
                          ),
                        );
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
  final Future<void> Function(bool success, String? receiptText) onPaymentComplete;
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
        amount: widget.amount,
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
    if (mounted) await widget.onPaymentComplete(true, receiptText);
  }

  String _buildReceiptDisplayText() {
    final paymentReceipt = '''
========================================
         PAYMENT RECEIPT
   ${DateTime.now().toString().split('.')[0]}
========================================

Transaction ID: ${_transaction?.transactionId ?? 'N/A'}
Reference #: ${_transaction?.referenceNumber ?? 'N/A'}

Amount: PHP ${widget.amount.toStringAsFixed(2)}
Status: [PAID]

----------------------------------------
${PAYMONGOPaymentPageState.printContent.isNotEmpty ? PAYMONGOPaymentPageState.printContent : 'Standard Receipt'}
''';

    final pending = PAYMONGOPaymentPageState.pendingReceiptContent;
    return pending.isNotEmpty
        ? '''$paymentReceipt
----------------------------------------
$pending'''
        : paymentReceipt;
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
      if (mounted) widget.onPaymentComplete(false, null);
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
      widget.onPaymentComplete(false, null);
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
    final match =
        RegExp(r'data:image/[a-zA-Z]+;base64,(.+)').firstMatch(qrCode);
    if (match == null) return null;

    try {
      return base64Decode(match.group(1)!);
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
        final cancelReceipt = '''
========================================
         PAYMENT CANCELLED
   ${DateTime.now().toString().split('.')[0]}
========================================

Transaction ID: ${_transaction!.transactionId}
Reference #: ${_transaction!.referenceNumber}

Status: [FAILED / CANCELLED]
Reason: Simulated failure

----------------------------------------
No files will be printed.
Date: ${DateTime.now().toString().split('.')[0]}
''';
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
                        color: const Color(0xFF003D99),
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
                                                Colors.black.withOpacity(0.12),
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
                        color: Colors.grey[100],
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
                                  ?.copyWith(color: Colors.grey[600]),
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
