import 'package:cloud_firestore/cloud_firestore.dart';
import 'disbursement.dart';

class ReturnModel {
  final String id;
  final String? returnCode;
  final String branchId;
  final String branchName;
  final List<DisbursementItem> products;
  final double totalValue;
  final String reason;
  final String status;
  final DateTime createdAt;

  ReturnModel({
    required this.id,
    this.returnCode,
    required this.branchId,
    required this.branchName,
    required this.products,
    required this.totalValue,
    required this.reason,
    required this.status,
    required this.createdAt,
  });

  factory ReturnModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ReturnModel(
      id: doc.id,
      returnCode: data['returnCode'] ?? data['returnNumber'] ?? doc.id,
      branchId: data['branchId'] ?? '',
      branchName: data['branchName'] ?? '',
      products: (data['products'] as List?)
          ?.map((item) => DisbursementItem.fromJson(item))
          .toList() ?? [],
      totalValue: (data['totalValue'] ?? 0).toDouble(),
      reason: data['reason'] ?? '',
      status: data['status'] ?? 'pending',
      createdAt: (data['createdAt'] is Timestamp) 
          ? (data['createdAt'] as Timestamp).toDate() 
          : DateTime.tryParse(data['createdAt'] ?? '') ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'returnCode': returnCode,
      'branchId': branchId,
      'branchName': branchName,
      'totalValue': totalValue,
      'reason': reason,
      'status': status,
      'createdAt': Timestamp.fromDate(createdAt),
    };
  }
}
