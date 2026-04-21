import 'package:flutter/material.dart';
import '../paper_tracker_service.dart';

class PaperTrackerPage extends StatefulWidget {
  final Function(String) onNavigate;

  const PaperTrackerPage({super.key, required this.onNavigate});

  @override
  State<PaperTrackerPage> createState() => _PaperTrackerPageState();
}

class _PaperTrackerPageState extends State<PaperTrackerPage> {
  List<PaperTray> _trays = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadTrays();
  }

  Future<void> _loadTrays() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final trays = await PaperTrackerService.getTrays();
      setState(() {
        _trays = trays;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to load paper trays: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _setTrayCapacity(String trayName, int capacity) async {
    final success = await PaperTrackerService.setTrayCapacity(trayName, capacity);
    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Updated $trayName capacity to $capacity sheets')),
      );
      _loadTrays(); // Refresh data
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to update tray capacity')),
      );
    }
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Paper Tracker'),
        backgroundColor: const Color(0xFF2563EB),
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadTrays,
                        child: const Text('Retry'),
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
                      const Text(
                        'Monitor paper levels in each tray. Set capacity when you add papers.',
                        style: TextStyle(color: Colors.grey),
                      ),
                      const SizedBox(height: 24),
                      Expanded(
                        child: ListView.builder(
                          itemCount: _trays.length,
                          itemBuilder: (context, index) {
                            final tray = _trays[index];
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
  }
}