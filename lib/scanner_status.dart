import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

enum ScannerAvailability { checking, unavailable, connected, adfReady }

class ScannerStatusSnapshot {
  final ScannerAvailability availability;
  final String message;

  const ScannerStatusSnapshot({
    required this.availability,
    required this.message,
  });

  const ScannerStatusSnapshot.checking()
      : availability = ScannerAvailability.checking,
        message = 'Checking scanner and ADF...';

  bool get canScan => availability == ScannerAvailability.adfReady;
}

class ScannerStatusService {
  const ScannerStatusService();

  Future<ScannerStatusSnapshot> check() async {
    try {
      final response = await http
          .get(Uri.parse('${BackendConfig.serverUrl}/api/scan/adf-status'))
          .timeout(const Duration(seconds: 8));
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final connected = body['scannerConnected'] == true;
      final loaded = body['adfLoaded'] == true;
      final message = body['status'] as String?;

      if (loaded) {
        return ScannerStatusSnapshot(
          availability: ScannerAvailability.adfReady,
          message: message ?? 'Scanner connected and document detected in ADF.',
        );
      }
      return ScannerStatusSnapshot(
        availability: connected
            ? ScannerAvailability.connected
            : ScannerAvailability.unavailable,
        message: message ??
            (connected
                ? 'Scanner connected. Place a document in the ADF.'
                : 'Scanner unavailable. Check the scanner and local backend.'),
      );
    } catch (_) {
      return const ScannerStatusSnapshot(
        availability: ScannerAvailability.unavailable,
        message: 'Scanner service unavailable. Start the local backend, then retry.',
      );
    }
  }
}

class ScannerStatusPanel extends StatelessWidget {
  final ScannerStatusSnapshot snapshot;
  final VoidCallback onRetry;

  const ScannerStatusPanel({
    super.key,
    required this.snapshot,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final ready = snapshot.availability == ScannerAvailability.adfReady;
    final checking = snapshot.availability == ScannerAvailability.checking;
    final color = ready ? Colors.green : checking ? Colors.blue : Colors.orange;
    final icon = ready
        ? Icons.check_circle
        : checking
            ? Icons.sync
            : Icons.warning_amber;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: color[50],
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              snapshot.message,
              style: const TextStyle(fontSize: 12, color: Colors.black87),
            ),
          ),
          if (!ready && !checking)
            TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class AdfSafetyNotice extends StatelessWidget {
  const AdfSafetyNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.amber[50],
        border: Border.all(color: Colors.amber[700]!),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber, color: Colors.orange, size: 22),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'ADF safety: Remove staples, paper clips, pins, and other hard components. Do not place torn, folded, wet, or damaged documents in the ADF. For damaged documents, take a clear picture and use Storage > Receive from Phone instead.',
              style: TextStyle(fontSize: 12, color: Colors.black87),
            ),
          ),
        ],
      ),
    );
  }
}