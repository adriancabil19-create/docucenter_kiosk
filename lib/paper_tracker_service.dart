import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'config.dart';

class PaperTray {
  final String trayName;
  final int currentCount;
  final int maxCapacity;
  final int threshold;
  final String updatedAt;
  final String paperSize;

  PaperTray({
    required this.trayName,
    required this.currentCount,
    required this.maxCapacity,
    required this.threshold,
    required this.updatedAt,
    this.paperSize = 'A4',
  });

  factory PaperTray.fromJson(Map<String, dynamic> json) {
    return PaperTray(
      trayName: json['tray_name'] as String? ?? '',
      currentCount: json['current_count'] as int? ?? 0,
      maxCapacity: json['max_capacity'] as int? ?? 0,
      threshold: json['threshold'] as int? ?? 20,
      updatedAt: json['updated_at'] as String? ?? '',
      paperSize: json['paper_size'] as String? ?? 'A4',
    );
  }

  Map<String, dynamic> toJson() => {
    'tray_name': trayName,
    'current_count': currentCount,
    'max_capacity': maxCapacity,
    'threshold': threshold,
    'updated_at': updatedAt,
    'paper_size': paperSize,
  };

  bool get isLow => currentCount <= threshold;
}

class PaperTrackerService {
  static const String _baseUrl = BackendConfig.serverUrl;

  /// Get all paper tray statuses
  static Future<List<PaperTray>> getTrays() async {
    try {
      final response = await http.get(Uri.parse('$_baseUrl/api/paper-tracker/paper-trays'));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          final trays = data['data'] as List;
          return trays.map((t) => PaperTray.fromJson(t)).toList();
        }
      }
      debugPrint('Failed to get paper trays: ${response.statusCode}');
      return [];
    } catch (e) {
      debugPrint('Error getting paper trays: $e');
      return [];
    }
  }

  /// Refill a tray: the operator enters how many sheets they just loaded.
  /// The backend's handler for `maxCapacity` sets both the tray's current
  /// count and its capacity to this value (see
  /// backend/src/services/paperTracker.service.ts `setTrayCapacity`), which
  /// is what actually clears an "out of paper" state.
  ///
  /// Body fields here are camelCase to match what the PUT route destructures
  /// (backend/src/routes/paperTracker.ts) — the backend's snake_case
  /// convention (`current_count` / `max_capacity`) only applies to the GET
  /// response and to the unrelated `/api/sync/paper-tray` endpoint.
  static Future<bool> setTrayCapacity(String trayName, int maxCapacity) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/api/paper-tracker/paper-trays/$trayName'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'maxCapacity': maxCapacity}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      debugPrint('Failed to set tray capacity: ${response.statusCode}');
      return false;
    } catch (e) {
      debugPrint('Error setting tray capacity: $e');
      return false;
    }
  }

  /// Get low paper alerts for admin
  static Future<List<Map<String, dynamic>>> getLowPaperAlerts() async {
    try {
      final response = await http.get(Uri.parse('$_baseUrl/api/paper-tracker/paper-trays/alerts'));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          return List<Map<String, dynamic>>.from(data['data']);
        }
      }
      debugPrint('Failed to get low paper alerts: ${response.statusCode}');
      return [];
    } catch (e) {
      debugPrint('Error getting low paper alerts: $e');
      return [];
    }
  }

  /// Decrement paper count (to be called when printing)
  static Future<bool> usePaper(String trayName, int sheets) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/paper-tracker/paper-trays/$trayName/use'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'sheets': sheets}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      debugPrint('Failed to use paper: ${response.statusCode}');
      return false;
    } catch (e) {
      debugPrint('Error using paper: $e');
      return false;
    }
  }

  /// Check if a tray has enough paper
  static Future<bool> hasEnoughPaper(String trayName, int requiredSheets) async {
    try {
      final trays = await getTrays();
      final tray = trays.firstWhere(
        (t) => t.trayName == trayName,
        orElse: () => PaperTray(
          trayName: trayName,
          currentCount: 0,
          maxCapacity: 0,
          threshold: 20,
          updatedAt: '',
        ),
      );
      return tray.currentCount >= requiredSheets;
    } catch (e) {
      debugPrint('Error checking paper availability: $e');
      return false;
    }
  }
}