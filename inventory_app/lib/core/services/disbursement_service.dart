import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/disbursement.dart';

class DisbursementService {
  final CollectionReference _disbursementsCollection = 
      FirebaseFirestore.instance.collection('disbursements');

  Stream<List<Disbursement>> getDisbursements() {
    return _disbursementsCollection
        .orderBy('date', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Disbursement.fromJson(doc.data() as Map<String, dynamic>)
              .copyWith(id: doc.id))
            .toList());
  }

  Stream<List<Disbursement>> getDisbursementsByBranch(String branch) {
    return _disbursementsCollection
        .where('branch', isEqualTo: branch)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Disbursement.fromJson(doc.data() as Map<String, dynamic>)
              .copyWith(id: doc.id))
            .toList());
  }

  Stream<List<Disbursement>> getDisbursementsByDateRange(DateTime start, DateTime end) {
    return _disbursementsCollection
        .where('date', isGreaterThanOrEqualTo: start)
        .where('date', isLessThanOrEqualTo: end)
        .orderBy('date', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Disbursement.fromJson(doc.data() as Map<String, dynamic>)
              .copyWith(id: doc.id))
            .toList());
  }

  Future<Disbursement?> getDisbursementById(String id) async {
    final doc = await _disbursementsCollection.doc(id).get();
    if (doc.exists) {
      return Disbursement.fromJson(doc.data() as Map<String, dynamic>)?.copyWith(id: doc.id);
    }
    return null;
  }

  Future<String> createDisbursement(Disbursement disbursement) async {
    final docRef = await _disbursementsCollection.add(disbursement.toJson());
    return docRef.id;
  }

  Future<void> updateDisbursement(String id, Disbursement disbursement) async {
    await _disbursementsCollection.doc(id).update(disbursement.toJson());
  }

  Future<void> deleteDisbursement(String id) async {
    await _disbursementsCollection.doc(id).delete();
  }

  Future<void> updateDisbursementStatus(String id, String status) async {
    await _disbursementsCollection.doc(id).update({'status': status});
  }

  Future<List<String>> getBranches() async {
    final snapshot = await _disbursementsCollection.get();
    final branches = snapshot.docs
        .map((doc) => doc.get('branch') as String)
        .toSet()
        .toList();
    return branches..sort();
  }

  Future<double> getTotalDisbursementValue() async {
    final snapshot = await _disbursementsCollection.get();
    double total = 0.0;
    for (var doc in snapshot.docs) {
      total += (doc.get('totalValue') as num).toDouble();
    }
    return total;
  }

  Future<double> getTodayDisbursementValue() async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = today.add(const Duration(days: 1));

    final snapshot = await _disbursementsCollection
        .where('date', isGreaterThanOrEqualTo: today)
        .where('date', isLessThan: tomorrow)
        .get();

    double total = 0.0;
    for (var doc in snapshot.docs) {
      total += (doc.get('totalValue') as num).toDouble();
    }
    return total;
  }

  Future<int> getDisbursementCount() async {
    final snapshot = await _disbursementsCollection.get();
    return snapshot.size;
  }

  Future<double> getAverageDisbursementValue() async {
    final total = await getTotalDisbursementValue();
    final count = await getDisbursementCount();
    return count > 0 ? total / count : 0.0;
  }

  // Execute actions on disbursement
  Future<void> assembleDisbursement(String id) async {
    await _disbursementsCollection.doc(id).update({
      'status': 'assembling',
      'notes': 'جاري تجميع الطلب',
    });
  }

  Future<void> verifyDisbursement(String id) async {
    await _disbursementsCollection.doc(id).update({
      'status': 'verified',
      'notes': 'تم التحقق من الطلب',
    });
  }

  Future<void> markAsDelivered(String id) async {
    await _disbursementsCollection.doc(id).update({
      'status': 'delivered',
      'warehouseDelivered': DateTime.now().toIso8601String(),
      'notes': 'تم التسليم',
    });
  }

  Future<void> markAsBranchReceived(String id, String branchName) async {
    await _disbursementsCollection.doc(id).update({
      'status': 'completed',
      'branchReceived': DateTime.now().toIso8601String(),
      'notes': 'تم الاستلام في الفرع: $branchName',
    });
  }
}
