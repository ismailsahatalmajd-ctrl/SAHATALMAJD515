import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/disbursement.dart';

class ApiService {
  static const String baseUrl = 'https://sahatalmajd.com/api'; // رابط موقعك الفعلي
  
  // جلب جميع عمليات الصرف
  Future<List<Disbursement>> getDisbursements() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursements'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      );

      print('Response status: ${response.statusCode}');
      print('Response body: ${response.body}');

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((item) => Disbursement.fromJson(item)).toList();
      } else {
        throw Exception('Failed to load disbursements: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('Error fetching disbursements: $e');
      // إعادة طرح الخطأ بدلاً من إرجاع بيانات وهمية
      throw Exception('Failed to connect to API: $e');
    }
  }

  // جلب عمليات الصرف حسب الفرع
  Future<List<Disbursement>> getDisbursementsByBranch(String branch) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursements?branch=$branch'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      );

      print('Branch filter response status: ${response.statusCode}');
      print('Branch filter response body: ${response.body}');

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((item) => Disbursement.fromJson(item)).toList();
      } else {
        throw Exception('Failed to load disbursements by branch: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('Error fetching disbursements by branch: $e');
      throw Exception('Failed to connect to API: $e');
    }
  }

  // جلب عمليات الصرف حسب نطاق التاريخ
  Future<List<Disbursement>> getDisbursementsByDateRange(DateTime start, DateTime end) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursements?start_date=${start.toIso8601String()}&end_date=${end.toIso8601String()}'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((item) => Disbursement.fromJson(item)).toList();
      } else {
        throw Exception('Failed to load disbursements by date range: ${response.statusCode}');
      }
    } catch (e) {
      print('Error fetching disbursements by date range: $e');
      return _getMockDisbursements().where((d) => 
        d.date.isAfter(start.subtract(const Duration(days: 1))) && 
        d.date.isBefore(end.add(const Duration(days: 1)))
      ).toList();
    }
  }

  // جلب قائمة الفروع
  Future<List<String>> getBranches() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/branches'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      );

      print('Branches response status: ${response.statusCode}');
      print('Branches response body: ${response.body}');

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((item) => item.toString()).toList();
      } else {
        throw Exception('Failed to load branches: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('Error fetching branches: $e');
      throw Exception('Failed to connect to API: $e');
    }
  }

  // جلب الإحصائيات
  Future<Map<String, dynamic>> getStatistics() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursements/statistics'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      );

      print('Statistics response status: ${response.statusCode}');
      print('Statistics response body: ${response.body}');

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        throw Exception('Failed to load statistics: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('Error fetching statistics: $e');
      throw Exception('Failed to connect to API: $e');
    }
  }

  // تنفيذ إجراء على عملية الصرف
  Future<bool> executeAction(String disbursementId, String action) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/disbursements/$disbursementId/actions'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: json.encode({'action': action}),
      );

      if (response.statusCode == 200) {
        return true;
      } else {
        throw Exception('Failed to execute action: ${response.statusCode}');
      }
    } catch (e) {
      print('Error executing action: $e');
      return false;
    }
  }

  // حذف عملية الصرف
  Future<bool> deleteDisbursement(String disbursementId) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/disbursements/$disbursementId'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      );

      if (response.statusCode == 200) {
        return true;
      } else {
        throw Exception('Failed to delete disbursement: ${response.statusCode}');
      }
    } catch (e) {
      print('Error deleting disbursement: $e');
      return false;
    }
  }

  // بيانات وهمية للعرض عند عدم وجود اتصال
  List<Disbursement> _getMockDisbursements() {
    return [
      Disbursement(
        id: '1',
        operationNumber: 'DIS-2024-001',
        operationType: 'صرف عادي',
        branch: 'الفرع الرئيسي',
        productsCount: 25,
        totalValue: 1500.50,
        date: DateTime.now().subtract(const Duration(days: 1)),
        status: 'completed',
        warehouseDelivered: DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
        branchReceived: DateTime.now().subtract(const Duration(hours: 12)).toIso8601String(),
        notes: 'تم التسليم بنجاح',
        source: 'المستودع الرئيسي',
        items: [
          DisbursementItem(
            productId: 'PRD001',
            productName: 'أكياس بلاستيك كبيرة',
            productCode: 'BAG-LRG-001',
            quantity: 15,
            unitPrice: 25.0,
            totalPrice: 375.0,
          ),
          DisbursementItem(
            productId: 'PRD002',
            productName: 'علب كرتون متوسطة',
            productCode: 'BOX-MED-002',
            quantity: 10,
            unitPrice: 112.55,
            totalPrice: 1125.5,
          ),
        ],
      ),
      Disbursement(
        id: '2',
        operationNumber: 'DIS-2024-002',
        operationType: 'صرف عاجل',
        branch: 'فرع الرياض',
        productsCount: 12,
        totalValue: 850.00,
        date: DateTime.now().subtract(const Duration(days: 2)),
        status: 'pending',
        notes: 'في انتظار الموافقة',
        source: 'المستودع الفرعي',
        items: [
          DisbursementItem(
            productId: 'PRD003',
            productName: 'مواد تغليف',
            productCode: 'PKG-003',
            quantity: 12,
            unitPrice: 70.83,
            totalPrice: 850.0,
          ),
        ],
      ),
      Disbursement(
        id: '3',
        operationNumber: 'DIS-2024-003',
        operationType: 'صرف دوري',
        branch: 'فرع جدة',
        productsCount: 30,
        totalValue: 2200.75,
        date: DateTime.now().subtract(const Duration(days: 3)),
        status: 'delivered',
        warehouseDelivered: DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
        notes: 'تم التسليم للمستودع',
        source: 'المستودع الرئيسي',
        items: [
          DisbursementItem(
            productId: 'PRD004',
            productName: 'شريط لاصق',
            productCode: 'TAP-004',
            quantity: 30,
            unitPrice: 73.36,
            totalPrice: 2200.75,
          ),
        ],
      ),
    ];
  }

  Map<String, dynamic> _getMockStatistics() {
    return {
      'totalValue': 8866608.15,
      'todayValue': 1078.80,
      'totalCount': 156,
      'averageValue': 56824.41,
      'completedCount': 120,
      'pendingCount': 36,
    };
  }
}
