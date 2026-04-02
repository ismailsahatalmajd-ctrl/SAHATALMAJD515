import 'package:http/http.dart' as http;
import 'package:html/parser.dart' as parser;
import 'package:cloud_firestore/cloud_firestore.dart';

class DataTestService {
  static const String baseUrl = 'https://sahatalmajd.com';
  
  // اختبار استيراد البيانات من الموقع
  static Future<Map<String, dynamic>> testWebScraping() async {
    final result = <String, dynamic>{
      'success': false,
      'message': '',
      'data': [],
      'pageContent': '',
    };
    
    try {
      print('Testing web scraping for: $baseUrl/disbursement');
      
      // اختبار الصفحة الرئيسية أولاً
      final mainResponse = await http.get(
        Uri.parse(baseUrl),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );
      
      print('Main site status: ${mainResponse.statusCode}');
      result['pageContent'] = 'Main site accessible: ${mainResponse.statusCode == 200}';
      
      if (mainResponse.statusCode != 200) {
        result['message'] = 'Main site not accessible: ${mainResponse.statusCode}';
        return result;
      }
      
      // اختبار صفحة الصرف
      final disbursementResponse = await http.get(
        Uri.parse('$baseUrl/disbursement'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );
      
      print('Disbursement page status: ${disbursementResponse.statusCode}');
      
      if (disbursementResponse.statusCode == 200) {
        final document = parser.parse(disbursementResponse.body);
        
        // البحث عن أي جدول في الصفحة
        final tables = document.querySelectorAll('table');
        print('Found ${tables.length} tables');
        
        // البحث عن أي بيانات تشبه عمليات الصرف
        final allText = document.body?.text ?? '';
        print('Page text length: ${allText.length}');
        
        // البحث عن كلمات مفتاحية
        final keywords = ['صرف', 'عملية', 'طلب', 'فرع', 'تسليم'];
        final foundKeywords = keywords.where((keyword) => allText.contains(keyword)).toList();
        print('Found keywords: $foundKeywords');
        
        result['success'] = true;
        result['message'] = 'Page accessible, found ${tables.length} tables';
        result['data'] = {
          'tablesCount': tables.length,
          'keywords': foundKeywords,
          'pageContent': disbursementResponse.body.substring(0, 1000), // أول 1000 حرف
        };
      } else {
        result['message'] = 'Disbursement page not accessible: ${disbursementResponse.statusCode}';
      }
      
    } catch (e) {
      print('Web scraping error: $e');
      result['message'] = 'Error: $e';
    }
    
    return result;
  }
  
  // اختبار استيراد البيانات من Firebase
  static Future<Map<String, dynamic>> testFirebase() async {
    final result = <String, dynamic>{
      'success': false,
      'message': '',
      'data': [],
      'collections': [],
    };
    
    try {
      print('Testing Firebase connection...');
      
      // اختبار الاتصال بـ Firebase
      final testDoc = await FirebaseFirestore.instance.collection('test').doc('connection').get();
      print('Firebase connection test completed');
      
      // البحث عن مجموعة disbursements
      final disbursementSnapshot = await FirebaseFirestore.instance.collection('disbursements').get();
      print('Found ${disbursementSnapshot.docs.length} documents in disbursements collection');
      
      result['success'] = true;
      result['message'] = 'Firebase connected, found ${disbursementSnapshot.docs.length} documents';
      result['data'] = disbursementSnapshot.docs.map((doc) => {
        'id': doc.id,
        'data': doc.data(),
      }).toList();
      
      // البحث عن مجموعات أخرى قد تحتوي على بيانات الصرف
      final collections = [
        'disbursements',
        'requests',
        'branch_requests',
        'operations',
        'orders',
        'inventory_requests'
      ];
      
      for (final collectionName in collections) {
        try {
          final snapshot = await FirebaseFirestore.instance.collection(collectionName).limit(1).get();
          if (snapshot.docs.isNotEmpty) {
            result['collections'].add({
              'name': collectionName,
              'count': snapshot.docs.length,
              'sample': snapshot.docs.first.data(),
            });
          }
        } catch (e) {
          print('Error checking collection $collectionName: $e');
        }
      }
      
    } catch (e) {
      print('Firebase error: $e');
      result['message'] = 'Firebase error: $e';
    }
    
    return result;
  }
  
  // إنشاء بيانات تجريبية في Firebase
  static Future<Map<String, dynamic>> createTestData() async {
    final result = <String, dynamic>{
      'success': false,
      'message': '',
    };
    
    try {
      final testData = [
        {
          'operationNumber': 'WEB-2024-001',
          'operationType': 'صرف عادي',
          'branch': 'الفرع الرئيسي',
          'productsCount': 25,
          'totalValue': 1500.50,
          'date': Timestamp.now(),
          'status': 'completed',
          'warehouseDelivered': Timestamp.now(),
          'branchReceived': Timestamp.now(),
          'notes': 'بيانات تجريبية من الموقع',
          'source': 'Web Test',
        },
        {
          'operationNumber': 'FB-2024-001',
          'operationType': 'صرف عاجل',
          'branch': 'فرع الرياض',
          'productsCount': 12,
          'totalValue': 850.00,
          'date': Timestamp.now(),
          'status': 'pending',
          'notes': 'بيانات تجريبية من Firebase',
          'source': 'Firebase Test',
        },
      ];
      
      for (final data in testData) {
        await FirebaseFirestore.instance.collection('disbursements').add(data);
      }
      
      result['success'] = true;
      result['message'] = 'Created ${testData.length} test records';
      
    } catch (e) {
      print('Error creating test data: $e');
      result['message'] = 'Error: $e';
    }
    
    return result;
  }
  
  // تشغيل جميع الاختبارات
  static Future<Map<String, dynamic>> runAllTests() async {
    final results = <String, dynamic>{};
    
    print('=== Running Data Import Tests ===');
    
    // اختبار Web Scraping
    print('1. Testing Web Scraping...');
    results['webScraping'] = await testWebScraping();
    
    // اختبار Firebase
    print('2. Testing Firebase...');
    results['firebase'] = await testFirebase();
    
    // إنشاء بيانات تجريبية إذا لزم الأمر
    if (!(results['firebase']['success'] as bool) || 
        (results['firebase']['data'] as List).isEmpty) {
      print('3. Creating test data...');
      results['testData'] = await createTestData();
    }
    
    print('=== Tests Complete ===');
    return results;
  }
}
