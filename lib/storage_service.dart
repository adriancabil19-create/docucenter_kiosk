import 'package:http/http.dart' as http;
import 'package:http/http.dart' show MediaType;
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'config.dart';

class StorageDocument {
  final String id;
  final String name;
  final String originalName;
  final String format;
  final int pages;
  final String size;
  final String date;
  final String mimeType;

  StorageDocument({
    required this.id,
    required this.name,
    required this.originalName,
    required this.format,
    required this.pages,
    required this.size,
    required this.date,
    required this.mimeType,
  });

  factory StorageDocument.fromJson(Map<String, dynamic> json) {
    return StorageDocument(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      originalName: json['originalName'] as String? ?? '',
      format: json['format'] as String? ?? 'UNKNOWN',
      pages: json['pages'] as int? ?? 1,
      size: json['size'] as String? ?? '0 B',
      date: json['date'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? 'application/octet-stream',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'originalName': originalName,
    'format': format,
    'pages': pages,
    'size': size,
    'date': date,
    'mimeType': mimeType,
  };
}

class StorageService {
  static String get _baseUrl => BackendConfig.storageApiUrl;

  /// Get MIME type based on file extension
  static String getMimeType(String fileName) {
    final extension = fileName.split('.').last.toLowerCase();
    
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'bmp': 'image/bmp',
      'gif': 'image/gif',
    };
    
    return mimeTypes[extension] ?? 'application/octet-stream';
  }

  /// Upload a file to storage
  /// Returns the uploaded document if successful
  static Future<StorageDocument?> uploadFile(
    String filePath,
    List<int> fileBytes,
    String fileName,
    String mimeType,
  ) async {
    try {
      var request = http.MultipartRequest('POST', Uri.parse('$_baseUrl/upload'));
      
      request.files.add(
        http.MultipartFile.fromBytes(
          'file',
          fileBytes,
          filename: fileName,
          contentType: MediaType.parse(mimeType),
        ),
      );

      var response = await request.send();
      final responseBody = await response.stream.bytesToString();
      
      if (response.statusCode == 200) {
        final json = jsonDecode(responseBody);
        if (json['success'] == true && json['document'] != null) {
          return StorageDocument.fromJson(json['document']);
        }
      }
      
      debugPrint('Upload failed: ${response.statusCode} - $responseBody');
      return null;
    } catch (e) {
      debugPrint('Error uploading file: $e');
      return null;
    }
  }

  /// Get all stored documents
  static Future<List<StorageDocument>> getDocuments() async {
    try {
      final response = await http.get(Uri.parse('$_baseUrl/documents'));
      
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        if (json['success'] == true && json['documents'] != null) {
          final List<dynamic> documentsJson = json['documents'];
          return documentsJson
              .map((doc) => StorageDocument.fromJson(doc as Map<String, dynamic>))
              .toList();
        }
      }
      
      debugPrint('Get documents failed: ${response.statusCode}');
      return [];
    } catch (e) {
      debugPrint('Error getting documents: $e');
      return [];
    }
  }

  /// Get a specific document by filename
  static Future<StorageDocument?> getDocument(String filename) async {
    try {
      final response = await http.get(Uri.parse('$_baseUrl/documents/$filename'));
      
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        if (json['success'] == true && json['document'] != null) {
          return StorageDocument.fromJson(json['document']);
        }
      }
      
      debugPrint('Get document failed: ${response.statusCode}');
      return null;
    } catch (e) {
      debugPrint('Error getting document: $e');
      return null;
    }
  }

  /// Download a file from storage
  static Future<List<int>?> downloadFile(String filename) async {
    try {
      final response = await http.get(Uri.parse('$_baseUrl/download/$filename'));
      
      if (response.statusCode == 200) {
        return response.bodyBytes;
      }
      
      debugPrint('Download failed: ${response.statusCode}');
      return null;
    } catch (e) {
      debugPrint('Error downloading file: $e');
      return null;
    }
  }

  /// Delete a document from storage
  static Future<bool> deleteDocument(String filename) async {
    try {
      final response = await http.delete(Uri.parse('$_baseUrl/documents/$filename'));
      
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        return json['success'] == true;
      }
      
      debugPrint('Delete failed: ${response.statusCode}');
      return false;
    } catch (e) {
      debugPrint('Error deleting document: $e');
      return false;
    }
  }

  /// Get storage statistics
  static Future<Map<String, dynamic>?> getStorageStats() async {
    try {
      final response = await http.get(Uri.parse('$_baseUrl/stats'));
      
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body);
        if (json['success'] == true && json['stats'] != null) {
          return json['stats'];
        }
      }
      
      debugPrint('Get stats failed: ${response.statusCode}');
      return null;
    } catch (e) {
      debugPrint('Error getting storage stats: $e');
      return null;
    }
  }
}
