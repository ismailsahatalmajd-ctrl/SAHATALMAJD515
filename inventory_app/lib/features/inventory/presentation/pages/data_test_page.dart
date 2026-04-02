import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:inventory_app/core/services/data_test_service.dart';

class DataTestPage extends StatefulWidget {
  const DataTestPage({super.key});

  @override
  State<DataTestPage> createState() => _DataTestPageState();
}

class _DataTestPageState extends State<DataTestPage> {
  Map<String, dynamic> _testResults = {};
  bool _isRunning = false;

  @override
  void initState() {
    super.initState();
    _runTests();
  }

  Future<void> _runTests() async {
    setState(() {
      _isRunning = true;
      _testResults = {};
    });

    try {
      final results = await DataTestService.runAllTests();
      setState(() {
        _testResults = results;
        _isRunning = false;
      });
    } catch (e) {
      setState(() {
        _isRunning = false;
      });
      _showSnackBar('Error running tests: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: Text(
          'اختبار استيراد البيانات',
          style: GoogleFonts.cairo(
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        backgroundColor: const Color(0xFF4F46E5),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            onPressed: _runTests,
            icon: const Icon(Icons.refresh),
            tooltip: 'إعادة الاختبار',
          ),
        ],
      ),
      body: _isRunning
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSectionTitle('اختبار Web Scraping'),
                  _buildWebScrapingResults(),
                  const SizedBox(height: 24),
                  _buildSectionTitle('اختبار Firebase'),
                  _buildFirebaseResults(),
                  const SizedBox(height: 24),
                  _buildSectionTitle('بيانات تجريبية'),
                  _buildTestDataResults(),
                ],
              ),
            ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: GoogleFonts.cairo(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: const Color(0xFF1F2937),
        ),
      ),
    );
  }

  Widget _buildWebScrapingResults() {
    final results = _testResults['webScraping'] as Map<String, dynamic>? ?? {};
    final success = results['success'] as bool? ?? false;
    final message = results['message'] as String? ?? '';
    final data = results['data'];
    
    // التعامل مع البيانات بشكل آمن
    Map<String, dynamic> dataMap = {};
    if (data is Map) {
      dataMap = Map<String, dynamic>.from(data);
    } else if (data is List) {
      // إذا كانت البيانات قائمة، نحولها إلى خريطة
      dataMap = {'items': data};
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: success ? Colors.green : Colors.red),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                success ? Icons.check_circle : Icons.error,
                color: success ? Colors.green : Colors.red,
              ),
              const SizedBox(width: 8),
              Text(
                success ? 'نجح' : 'فشل',
                style: GoogleFonts.cairo(
                  fontWeight: FontWeight.bold,
                  color: success ? Colors.green : Colors.red,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: GoogleFonts.cairo(color: Colors.grey[700]),
          ),
          if (dataMap.isNotEmpty) ...[
            const SizedBox(height: 12),
            _buildDataCard(dataMap),
          ],
        ],
      ),
    );
  }

  Widget _buildFirebaseResults() {
    final results = _testResults['firebase'] as Map<String, dynamic>? ?? {};
    final success = results['success'] as bool? ?? false;
    final message = results['message'] as String? ?? '';
    final data = results['data'] as List? ?? [];
    final collections = results['collections'] as List? ?? [];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: success ? Colors.green : Colors.red),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                success ? Icons.check_circle : Icons.error,
                color: success ? Colors.green : Colors.red,
              ),
              const SizedBox(width: 8),
              Text(
                success ? 'نجح' : 'فشل',
                style: GoogleFonts.cairo(
                  fontWeight: FontWeight.bold,
                  color: success ? Colors.green : Colors.red,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: GoogleFonts.cairo(color: Colors.grey[700]),
          ),
          if (data.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'البيانات الموجودة (${data.length})',
              style: GoogleFonts.cairo(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ...data.take(3).map((item) => _buildFirebaseItem(item as Map<String, dynamic>)),
          ],
          if (collections.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'المجموعات الأخرى',
              style: GoogleFonts.cairo(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ...collections.map((item) => _buildCollectionItem(item as Map<String, dynamic>)),
          ],
        ],
      ),
    );
  }

  Widget _buildTestDataResults() {
    final results = _testResults['testData'] as Map<String, dynamic>? ?? {};
    if (results.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey),
        ),
        child: Text(
          'لم يتم إنشاء بيانات تجريبية (البيانات موجودة مسبقاً)',
          style: GoogleFonts.cairo(color: Colors.grey[700]),
        ),
      );
    }

    final success = results['success'] as bool? ?? false;
    final message = results['message'] as String? ?? '';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: success ? Colors.green : Colors.red),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                success ? Icons.check_circle : Icons.error,
                color: success ? Colors.green : Colors.red,
              ),
              const SizedBox(width: 8),
              Text(
                success ? 'تم الإنشاء' : 'فشل',
                style: GoogleFonts.cairo(
                  fontWeight: FontWeight.bold,
                  color: success ? Colors.green : Colors.red,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: GoogleFonts.cairo(color: Colors.grey[700]),
          ),
        ],
      ),
    );
  }

  Widget _buildDataCard(Map<String, dynamic> data) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (data['tablesCount'] != null)
            _buildInfoRow('عدد الجداول', '${data['tablesCount']}'),
          if (data['keywords'] != null)
            _buildInfoRow('كلمات مفتاحية', '${(data['keywords'] as List).join(', ')}'),
        ],
      ),
    );
  }

  Widget _buildFirebaseItem(Map<String, dynamic> item) {
    final data = item['data'] as Map<String, dynamic>? ?? {};
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ID: ${item['id']}',
            style: GoogleFonts.cairo(fontWeight: FontWeight.bold, fontSize: 12),
          ),
          if (data['operationNumber'] != null)
            _buildInfoRow('رقم العملية', data['operationNumber']),
          if (data['branch'] != null)
            _buildInfoRow('الفرع', data['branch']),
          if (data['status'] != null)
            _buildInfoRow('الحالة', data['status']),
        ],
      ),
    );
  }

  Widget _buildCollectionItem(Map<String, dynamic> item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item['name'],
            style: GoogleFonts.cairo(fontWeight: FontWeight.bold, fontSize: 12),
          ),
          _buildInfoRow('عدد السجلات', '${item['count']}'),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Text(
            '$label: ',
            style: GoogleFonts.cairo(fontWeight: FontWeight.bold, fontSize: 11),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.cairo(fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: GoogleFonts.cairo()),
        backgroundColor: const Color(0xFF4F46E5),
      ),
    );
  }
}
