import 'package:cloud_firestore/cloud_firestore.dart';

class Disbursement {
  final String? id;
  final String operationNumber;
  final String operationType;
  final String branch;
  final int productsCount;
  final double totalValue;
  final DateTime date;
  final bool branchReceived;
  final bool warehouseDelivered;
  final String status;
  final String? notes;
  final String? source;
  final DateTime? updatedAt;
  final List<DisbursementItem> items;

  Disbursement({
    this.id,
    required this.operationNumber,
    required this.operationType,
    required this.branch,
    required this.productsCount,
    required this.totalValue,
    required this.date,
    this.branchReceived = false,
    this.warehouseDelivered = false,
    required this.status,
    this.notes,
    this.source,
    this.updatedAt,
    this.items = const [],
  });

  factory Disbursement.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final DateTime createdAt = (data['createdAt'] is Timestamp) 
        ? (data['createdAt'] as Timestamp).toDate() 
        : DateTime.tryParse(data['createdAt'] ?? '') ?? DateTime.now();

    // Matching web app logic: invoiceCode || orderCode || OR-OLD-numeric
    String opNum = data['invoiceCode'] ?? data['orderCode'] ?? '';
    if (opNum.isEmpty) {
      final String onlyDigits = doc.id.replaceAll(RegExp(r'\D'), '');
      final String ts = createdAt.millisecondsSinceEpoch.toString();
      final String legacy = (onlyDigits + ts).substring((onlyDigits + ts).length >= 6 ? (onlyDigits + ts).length - 6 : 0);
      opNum = 'OR-OLD-$legacy';
    }

    String opType = data['invoiceCode'] != null ? 'صرف (Issue)' : 'طلب (Order)';
    
    return Disbursement(
      id: doc.id,
      operationNumber: opNum,
      operationType: opType,
      branch: data['branchName'] ?? '',
      productsCount: (data['products'] as List?)?.length ?? 0,
      totalValue: (data['totalValue'] ?? 0).toDouble(),
      date: createdAt,
      branchReceived: data['branchReceived'] ?? false,
      warehouseDelivered: data['delivered'] ?? false,
      status: data['status'] ?? 'pending',
      notes: data['notes'],
      source: data['source'] ?? 'Firebase',
      updatedAt: (data['updatedAt'] is Timestamp) ? (data['updatedAt'] as Timestamp).toDate() : null,
      items: (data['products'] as List?)
          ?.map((item) => DisbursementItem.fromJson(item))
          .toList() ?? [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'operationNumber': operationNumber,
      'operationType': operationType,
      'branch': branch,
      'productsCount': productsCount,
      'totalValue': totalValue,
      'date': date.toIso8601String(),
      'branchReceived': branchReceived,
      'warehouseDelivered': warehouseDelivered,
      'status': status,
      'notes': notes,
      'source': source,
      'updatedAt': updatedAt?.toIso8601String(),
      'items': items.map((item) => item.toJson()).toList(),
    };
  }
}

class DisbursementItem {
  final String productId;
  final String productName;
  final String productCode;
  final String unit;
  final String? imageUrl;
  final double quantity;
  final double unitPrice;
  final double totalPrice;

  DisbursementItem({
    required this.productId,
    required this.productName,
    required this.productCode,
    required this.unit,
    this.imageUrl,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
  });

  factory DisbursementItem.fromJson(Map<String, dynamic> json) {
    return DisbursementItem(
      productId: json['productId'] ?? '',
      productName: json['productName'] ?? '',
      productCode: json['productCode'] ?? '',
      unit: json['unit'] ?? 'قطع',
      imageUrl: json['image'] ?? json['imageUrl'],
      quantity: (json['quantity'] ?? 0).toDouble(),
      unitPrice: (json['unitPrice'] ?? 0).toDouble(),
      totalPrice: (json['totalPrice'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'productId': productId,
      'productName': productName,
      'productCode': productCode,
      'unit': unit,
      'image': imageUrl,
      'quantity': quantity,
      'unitPrice': unitPrice,
      'totalPrice': totalPrice,
    };
  }
}
