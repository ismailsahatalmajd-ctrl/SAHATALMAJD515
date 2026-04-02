import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/disbursement.dart';
import '../models/return_model.dart';

class FirebaseDisbursementService {
  final CollectionReference _issuesCollection = 
      FirebaseFirestore.instance.collection('issues');
  final CollectionReference _returnsCollection = 
      FirebaseFirestore.instance.collection('returns');

  // جلب جميع عمليات الصرف
  Stream<List<Disbursement>> getDisbursements() {
    return _issuesCollection
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Disbursement.fromFirestore(doc))
            .toList());
  }

  // جلب جميع عمليات المرتجع
  Stream<List<ReturnModel>> getReturns() {
    return _returnsCollection
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ReturnModel.fromFirestore(doc))
            .toList());
  }

  // جلب قائمة الفروع من عمليات الصرف
  Future<List<String>> getBranches() async {
    final snapshot = await _issuesCollection.limit(100).get();
    final branches = snapshot.docs
        .map((doc) => (doc.data() as Map<String, dynamic>)['branchName'] as String? ?? '')
        .where((branch) => branch.isNotEmpty)
        .toSet()
        .toList();
    
    branches.sort();
    return branches.isEmpty ? ['الكل'] : ['الكل', ...branches];
  }

  // جلب الإحصائيات (الصرف والمرتجعات والصافي)
  Future<Map<String, dynamic>> getFullStatistics() async {
    final issuesSnapshot = await _issuesCollection.get();
    final returnsSnapshot = await _returnsCollection.get();
    
    final disbursements = issuesSnapshot.docs.map((doc) => Disbursement.fromFirestore(doc)).toList();
    final returns = returnsSnapshot.docs.map((doc) => ReturnModel.fromFirestore(doc)).toList();
    
    final totalIssuesValue = disbursements.fold<double>(0, (sum, d) => sum + d.totalValue);
    final totalReturnsValue = returns.fold<double>(0, (sum, r) => sum + r.totalValue);
    
    return {
      'totalIssuesValue': totalIssuesValue,
      'totalReturnsValue': totalReturnsValue,
      'netValue': totalIssuesValue - totalReturnsValue,
      'issuesCount': disbursements.length,
      'returnsCount': returns.length,
    };
  }

  // تحديث حالة التسليم
  Future<void> updateDisbursementStatus(String id, bool delivered) async {
    await _issuesCollection.doc(id).update({
      'delivered': delivered,
      'deliveredAt': delivered ? FieldValue.serverTimestamp() : null,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // حذف عملية صرف
  Future<void> deleteDisbursement(String id) async {
    await _issuesCollection.doc(id).delete();
  }

  // حذف عملية مرتجع
  Future<void> deleteReturn(String id) async {
    await _returnsCollection.doc(id).delete();
  }
}
