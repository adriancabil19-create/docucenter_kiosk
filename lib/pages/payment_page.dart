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

  /// Receipt content that should be printed after payment succeeds
  /// (e.g., photocopying receipt). Cleared after printing.
  static String pendingReceiptContent = '';

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
          child: SingleChildScrollView(
            child: PaymentInterface(
              amount: pendingAmount,
              onPaymentComplete: (success) async {
                if (success) {
                  // Attempt to print the files
                  if (printFiles.isNotEmpty) {
                    try {
                      bool printSuccess;
                      if (printFiles.first is Uint8List) {
                        // Scanned images
                        printSuccess = await PrintService.printScannedImages(
                          List<Uint8List>.from(printFiles),
                          paperSize: paperSize,
                          colorMode: colorMode,
                          quality: quality,
                        );
                      } else {
                        // Stored files
                        printSuccess = await PrintService.printFromStorage(
                          List<String>.from(printFiles),
                          paperSize: paperSize,
                          colorMode: colorMode,
                          quality: quality,
                        );
                      }
                      if (printSuccess) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content:
                                Text('Payment successful! Printing started...'),
                            backgroundColor: Colors.green,
                          ),
                        );
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content:
                                Text('Payment successful but printing failed'),
                            backgroundColor: Colors.orange,
                          ),
                        );
                      }
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content:
                              Text('Payment successful but printing error: $e'),
                          backgroundColor: Colors.orange,
                        ),
                      );
                    }
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                            'Payment successful! Returning to services...'),
                        backgroundColor: Colors.green,
                      ),
                    );
                  }
                  Future.delayed(const Duration(seconds: 2), () {
                    if (mounted) {
                      // Clear the static state
                      printFiles = [];
                      paperSize = 'A4';
                      colorMode = 'bw';
                      quality = 'standard';
                      pendingReceiptContent = '';
                      widget.onNavigate('services');
                    }
                  });
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
  final Function(bool) onPaymentComplete;
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

    // 1. Print payment receipt
    await _printReceipt();

    // 2. Print any pending service receipt (e.g., photocopying) AFTER payment
    final pending = PAYMONGOPaymentPageState.pendingReceiptContent;
    if (pending.isNotEmpty) {
      try {
        await PrintService.printReceipt(
          pending,
          paperSize: PAYMONGOPaymentPageState.paperSize,
        );
      } catch (e) {
        debugPrint('Error printing pending receipt: $e');
      } finally {
        PAYMONGOPaymentPageState.pendingReceiptContent = '';
      }
    }

    // 3. Print files from storage if selected (handled in onPaymentComplete)
    // bool printSuccess = true;
    // bool hadFiles = false;
    // try {
    //   final filenames = PAYMONGOPaymentPageState.printFiles;
    //   hadFiles = filenames.isNotEmpty;
    //   if (hadFiles) {
    //     printSuccess = await PrintService.printFromStorage(
    //       filenames,
    //       paperSize: PAYMONGOPaymentPageState.paperSize,
    //       colorMode: PAYMONGOPaymentPageState.colorMode,
    //       quality: PAYMONGOPaymentPageState.quality,
    //     );
    //   }
    // } catch (e) {
    //   debugPrint('Error printing files from storage: $e');
    //   printSuccess = false;
    // } finally {
    //   // Clear static state so the next job starts clean
    //   PAYMONGOPaymentPageState.printFiles = [];
    // }

    // Notify user of print outcome (handled in onPaymentComplete)
    // if (hadFiles && messenger != null) {
    //   messenger.showSnackBar(
    //     SnackBar(
    //       content: Text(
    //         printSuccess
    //             ? 'Files sent to printer successfully.'
    //             : 'Payment received, but printing failed. Check PrintSimulation/ folder or printer connection.',
    //       ),
    //       backgroundColor: printSuccess ? Colors.green : Colors.orange,
    //       duration: const Duration(seconds: 4),
    //     ),
    //   );
    // }

    // 4. Navigate back — await all prints first, then delay
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) widget.onPaymentComplete(true);
  }

  Future<void> _printReceipt() async {
    try {
      if (_transaction == null) return;

      final receiptContent = '''
========================================
         PAYMENT RECEIPT
   ${DateTime.now().toString().split('.')[0]}
========================================

Transaction ID: ${_transaction!.transactionId}
Reference #: ${_transaction!.referenceNumber}

Amount: PHP ${widget.amount.toStringAsFixed(2)}
Status: [PAID]

----------------------------------------
${PAYMONGOPaymentPageState.printContent.isNotEmpty ? PAYMONGOPaymentPageState.printContent : 'Standard Receipt'}

----------------------------------------
Thank you for using our service!
Date: ${DateTime.now().toString().split('.')[0]}
''';

      await PrintService.printReceipt(
        receiptContent,
        paperSize: PAYMONGOPaymentPageState.paperSize,
      );
    } catch (e) {
      debugPrint('Print receipt error: $e');
    }
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
      if (mounted) widget.onPaymentComplete(false);
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
      widget.onPaymentComplete(false);
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
