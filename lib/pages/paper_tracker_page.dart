import 'package:flutter/material.dart';
import '../paper_tracker_service.dart';
import '../kiosk_runtime_service.dart';

class PaperTrackerPage extends StatefulWidget {
  final Function(String) onNavigate;

  const PaperTrackerPage({super.key, required this.onNavigate});

  @override
  State<PaperTrackerPage> createState() => _PaperTrackerPageState();
}

// Tray data comes from KioskRuntime — the ONE centralized, event-triggered
// tray-status mechanism shared by the whole app (see kiosk_runtime_service.dart
// pollPaperTraysOnce). This page never fetches independently; it only
// triggers that same shared poll (manual refresh / after a refill) and
// displays whatever it last cached.
class _PaperTrackerPageState extends State<PaperTrackerPage> {
  bool _refreshing = false;

  Future<void> _refresh(String reason) async {
    setState(() => _refreshing = true);
    await KioskRuntime.instance.pollPaperTraysOnce(reason);
    if (mounted) setState(() => _refreshing = false);
  }

  Future<void> _setTrayCapacity(String trayName, int capacity) async {
    final success = await PaperTrackerService.setTrayCapacity(trayName, capacity);
    if (!mounted) return;
    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Updated $trayName capacity to $capacity sheets')),
      );
      // Admin just refilled this tray physically — one event-triggered poll.
      await _refresh('admin_manual_refresh');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to update tray capacity')),
      );
    }
  }

  String _lastCheckedLabel() {
    final at = KioskRuntime.instance.paperTraysCheckedAt;
    if (at == null) return 'Not checked yet';
    String two(int n) => n.toString().padLeft(2, '0');
    return 'Last checked: ${two(at.hour)}:${two(at.minute)}:${two(at.second)}';
  }

  void _showCapacityDialog(String trayName) {
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Set $trayName Capacity'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Enter the number of papers you just added to this tray:'),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Number of sheets',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final capacity = int.tryParse(controller.text);
              if (capacity != null && capacity >= 0) {
                _setTrayCapacity(trayName, capacity);
                Navigator.of(context).pop();
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Please enter a valid number')),
                );
              }
            },
            child: const Text('Set Capacity'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: KioskRuntime.instance,
      builder: (context, _) {
        final trays = KioskRuntime.instance.paperTrays;
        return Scaffold(
          appBar: AppBar(
            title: const Text('Paper Tracker'),
            backgroundColor: const Color(0xFF2563EB),
            foregroundColor: Colors.white,
            actions: [
              IconButton(
                icon: _refreshing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.refresh),
                tooltip: 'Refresh paper tray status',
                onPressed:
                    _refreshing ? null : () => _refresh('admin_manual_refresh'),
              ),
            ],
          ),
          body: trays.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('No paper tray data yet.'),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _refreshing
                            ? null
                            : () => _refresh('admin_manual_refresh'),
                        child: const Text('Refresh'),
                      ),
                    ],
                  ),
                )
              : Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Paper Tray Status',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Monitor paper levels in each tray. Set capacity when you add papers.',
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _lastCheckedLabel(),
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 24),
                      Expanded(
                        child: ListView.builder(
                          itemCount: trays.length,
                          itemBuilder: (context, index) {
                            final tray = trays[index];
                            final isLow = tray.isLow;

                            return Card(
                              margin: const EdgeInsets.only(bottom: 16),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          tray.trayName,
                                          style: const TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        if (isLow)
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: Colors.red,
                                              borderRadius: BorderRadius.circular(12),
                                            ),
                                            child: const Text(
                                              'LOW PAPER',
                                              style: TextStyle(
                                                color: Colors.white,
                                                fontSize: 12,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text('Current: ${tray.currentCount} sheets'),
                                              Text('Capacity: ${tray.maxCapacity} sheets'),
                                              Text('Threshold: ${tray.threshold} sheets'),
                                            ],
                                          ),
                                        ),
                                        ElevatedButton(
                                          onPressed: () => _showCapacityDialog(tray.trayName),
                                          child: const Text('Set Capacity'),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    LinearProgressIndicator(
                                      value: tray.maxCapacity > 0
                                          ? tray.currentCount / tray.maxCapacity
                                          : 0,
                                      backgroundColor: Colors.grey[300],
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        isLow ? Colors.red : Colors.green,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
        );
      },
    );
  }
}