import 'package:cloud_firestore/cloud_firestore.dart';

class SimpleDisbursement {
  final String id;
  final String operationNumber;
  final String operationType;
  final String branch;
  final int productsCount;
  final double totalValue;
  final DateTime date;
  final String status;
  final String? warehouseDelivered;
  final String? branchReceived;
  final String? notes;
  final String? source;

  SimpleDisbursement({
    required this.id,
    required this.operationNumber,
    required this.operationType,
    required this.branch,
    required this.productsCount,
    required this.totalValue,
    required this.date,
    required this.status,
    this.warehouseDelivered,
    this.branchReceived,
    this.notes,
    this.source,
  });

  // إنشاء من Firebase Document
  factory SimpleDisbursement.fromFirebase(String docId, Map<String, dynamic> data) {
    return SimpleDisbursement(
      id: docId,
      operationNumber: data['operationNumber'] ?? '',
      operationType: data['operationType'] ?? '',
      branch: data['branch'] ?? '',
      productsCount: data['productsCount'] ?? 0,
      totalValue: (data['totalValue'] ?? 0).toDouble(),
      date: _parseDateTime(data['date']),
      status: data['status'] ?? 'waiting',
      warehouseDelivered: _parseTimestamp(data['warehouseDelivered']),
      branchReceived: _parseTimestamp(data['branchReceived']),
      notes: data['notes'],
      source: data['source'] ?? 'Firebase',
    );
  }

  // تحويل DateTime بأمان
  static DateTime _parseDateTime(dynamic value) {
    if (value == null) return DateTime.now();
    
    if (value is DateTime) return value;
    
    if (value is Timestamp) {
      try {
        return value.toDate();
      } catch (e) {
        return DateTime.now();
      }
    }
    
    if (value is String) {
      try {
        return DateTime.parse(value);
      } catch (e) {
        return DateTime.now();
      }
    }
    
    return DateTime.now();
  }

  // تحويل Timestamp إلى String بأمان
  static String? _parseTimestamp(dynamic value) {
    if (value == null) return null;
    
    if (value is String) return value;
    
    if (value is Timestamp) {
      try {
        return value.toDate().toIso8601String();
      } catch (e) {
        return null;
      }
    }
    
    return value.toString();
  }

  // تحويل إلى Map للـ Firebase
  Map<String, dynamic> toFirebaseMap() {
    return {
      'operationNumber': operationNumber,
      'operationType': operationType,
      'branch': branch,
      'productsCount': productsCount,
      'totalValue': totalValue,
      'date': date,
      'status': status,
      'warehouseDelivered': warehouseDelivered,
      'branchReceived': branchReceived,
      'notes': notes,
      'source': source,
    };
  }

  // نسخ مع تعديل
  SimpleDisbursement copyWith({
    String? id,
    String? operationNumber,
    String? operationType,
    String? branch,
    int? productsCount,
    double? totalValue,
    DateTime? date,
    String? status,
    String? warehouseDelivered,
    String? branchReceived,
    String? notes,
    String? source,
  }) {
    return SimpleDisbursement(
      id: id ?? this.id,
      operationNumber: operationNumber ?? this.operationNumber,
      operationType: operationType ?? this.operationType,
      branch: branch ?? this.branch,
      productsCount: productsCount ?? this.productsCount,
      totalValue: totalValue ?? this.totalValue,
      date: date ?? this.date,
      status: status ?? this.status,
      warehouseDelivered: warehouseDelivered ?? this.warehouseDelivered,
      branchReceived: branchReceived ?? this.branchReceived,
      notes: notes ?? this.notes,
      source: source ?? this.source,
    );
  }

  @override
  String toString() {
    return 'SimpleDisbursement(id: $id, operationNumber: $operationNumber, branch: $branch)';
  }
}
