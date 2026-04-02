import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/simple_disbursement.dart';

class SimpleFirebaseService {
  final CollectionReference _disbursementsCollection = 
      FirebaseFirestore.instance.collection('disbursements');

  // جلب جميع عمليات الصرف
  Future<List<SimpleDisbursement>> getDisbursements() async {
    try {
      final snapshot = await _disbursementsCollection
          .orderBy('date', descending: true)
          .get();
      
      return snapshot.docs.map((doc) {
        return SimpleDisbursement.fromFirebase(doc.id, doc.data() as Map<String, dynamic>);
      }).toList();
    } catch (e) {
      print('Error getting disbursements: $e');
      return [];
    }
  }

  // جلب عمليات الصرف حسب الفرع
  Future<List<SimpleDisbursement>> getDisbursementsByBranch(String branch) async {
    try {
      final snapshot = await _disbursementsCollection
          .where('branch', isEqualTo: branch)
          .orderBy('date', descending: true)
          .get();
      
      return snapshot.docs.map((doc) {
        return SimpleDisbursement.fromFirebase(doc.id, doc.data() as Map<String, dynamic>);
      }).toList();
    } catch (e) {
      print('Error getting disbursements by branch: $e');
      return [];
    }
  }

  // جلب قائمة الفروع
  Future<List<String>> getBranches() async {
    try {
      final snapshot = await _disbursementsCollection.get();
      final branches = snapshot.docs
          .map((doc) => doc.get('branch') as String? ?? '')
          .where((branch) => branch.isNotEmpty)
          .toSet()
          .toList();
      
      branches.sort();
      return branches.isEmpty ? ['الكل'] : ['الكل', ...branches];
    } catch (e) {
      print('Error getting branches: $e');
      return ['الكل'];
    }
  }

  // إنشاء بيانات تجريبية
  Future<void> createSampleData() async {
    try {
      final now = DateTime.now();
      final sampleData = [
        {
          'operationNumber': 'FB-2024-001',
          'operationType': 'صرف عادي',
          'branch': 'الفرع الرئيسي',
          'productsCount': 25,
          'totalValue': 1500.50,
          'date': now,
          'status': 'completed',
          'warehouseDelivered': now.toIso8601String(),
          'branchReceived': now.toIso8601String(),
          'notes': 'عملية صرف عادية من الفرع الرئيسي',
          'source': 'Sample Data',
        },
        {
          'operationNumber': 'FB-2024-002',
          'operationType': 'صرف عاجل',
          'branch': 'فرع الرياض',
          'productsCount': 12,
          'totalValue': 850.00,
          'date': now.subtract(const Duration(hours: 2)),
          'status': 'pending',
          'notes': 'طلب عاجل من فرع الرياض',
          'source': 'Sample Data',
        },
        {
          'operationNumber': 'FB-2024-003',
          'operationType': 'صرف دوري',
          'branch': 'فرع جدة',
          'productsCount': 30,
          'totalValue': 2200.75,
          'date': now.subtract(const Duration(days: 1)),
          'status': 'delivered',
          'warehouseDelivered': now.subtract(const Duration(days: 1)).toIso8601String(),
          'notes': 'صرف دوري شهري',
          'source': 'Sample Data',
        },
        {
          'operationNumber': 'FB-2024-004',
          'operationType': 'صرف استبدال',
          'branch': 'فرع الدمام',
          'productsCount': 8,
          'totalValue': 450.25,
          'date': now.subtract(const Duration(days: 2)),
          'status': 'completed',
          'warehouseDelivered': now.subtract(const Duration(days: 2)).toIso8601String(),
          'branchReceived': now.subtract(const Duration(days: 1)).toIso8601String(),
          'notes': 'استبدال منتجات تالفة',
          'source': 'Sample Data',
        },
        {
          'operationNumber': 'FB-2024-005',
          'operationType': 'صرف طارئ',
          'branch': 'الفرع الرئيسي',
          'productsCount': 15,
          'totalValue': 975.00,
          'date': now.subtract(const Duration(hours: 6)),
          'status': 'pending',
          'notes': 'طلب طارئ لعميل مهم',
          'source': 'Sample Data',
        },
      ];

      for (final data in sampleData) {
        await _disbursementsCollection.add(data);
      }
      
      print('Sample data created successfully');
    } catch (e) {
      print('Error creating sample data: $e');
    }
  }

  // التحقق من وجود بيانات
  Future<bool> hasData() async {
    try {
      final snapshot = await _disbursementsCollection.limit(1).get();
      return snapshot.docs.isNotEmpty;
    } catch (e) {
      print('Error checking data: $e');
      return false;
    }
  }

  // حذف جميع البيانات (للاختبار)
  Future<void> clearAllData() async {
    try {
      final snapshot = await _disbursementsCollection.get();
      for (final doc in snapshot.docs) {
        await doc.reference.delete();
      }
      print('All data cleared');
    } catch (e) {
      print('Error clearing data: $e');
    }
  }
}
