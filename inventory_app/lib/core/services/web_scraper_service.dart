import 'package:http/http.dart' as http;
import 'package:html/parser.dart' as parser;
import 'package:html/dom.dart';
import '../models/disbursement.dart';

class WebScraperService {
  static const String baseUrl = 'https://sahatalmajd.com';
  
  // جلب صفحة الصرف واستخراج البيانات
  Future<List<Disbursement>> scrapeDisbursementPage() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursement'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );

      print('Page status: ${response.statusCode}');
      
      if (response.statusCode == 200) {
        final document = parser.parse(response.body);
        return _extractDisbursementsFromHtml(document);
      } else {
        throw Exception('Failed to load page: ${response.statusCode}');
      }
    } catch (e) {
      print('Error scraping page: $e');
      throw Exception('Failed to scrape data: $e');
    }
  }

  // استخراج بيانات الصرف من HTML
  List<Disbursement> _extractDisbursementsFromHtml(Document document) {
    final List<Disbursement> disbursements = [];
    
    // البحث عن جدول الصرف
    final table = document.querySelector('.disbursement-table, table[data-table="disbursement"]');
    if (table != null) {
      final rows = table.querySelectorAll('tbody tr');
      
      for (final row in rows) {
        final cells = row.querySelectorAll('td');
        if (cells.length >= 8) {
          final disbursement = Disbursement(
            id: _extractText(cells[0]), // رقم العملية
            operationNumber: _extractText(cells[0]),
            operationType: _extractText(cells[1]), // نوع العملية
            branch: _extractText(cells[2]), // الفرع
            productsCount: _extractNumber(_extractText(cells[3])), // عدد المنتجات
            totalValue: _extractDouble(_extractText(cells[4])), // القيمة الإجمالية
            date: _extractDate(_extractText(cells[5])), // التاريخ
            status: _extractStatus(cells[6]), // الحالة
            warehouseDelivered: _parseBool(cells[7]), // تسليم المستودع
            branchReceived: _parseBool(cells[8]), // استلام الفرع
            notes: _extractText(cells.length > 9 ? cells[9] : null), // ملاحظات
            source: 'الموقع الرئيسي',
            items: [], // يمكن استخراجها لاحقاً
          );
          disbursements.add(disbursement);
        }
      }
    }
    
    // إذا لم يتم العثور على جدول، حاول استخراج البيانات من عناصر أخرى
    if (disbursements.isEmpty) {
      return _extractFromAlternativeElements(document);
    }
    
    return disbursements;
  }

  // استخراج النص النظيف
  String _extractText(Element? element) {
    if (element == null) return '';
    return element.text?.trim() ?? '';
  }

  // استخراج الأرقام
  int _extractNumber(String text) {
    final match = RegExp(r'\d+').firstMatch(text);
    return match != null ? int.parse(match.group(0)!) : 0;
  }

  // استخراج الأرقام العشرية
  double _extractDouble(String text) {
    final match = RegExp(r'[\d,]+\.?\d*').firstMatch(text.replaceAll(',', ''));
    return match != null ? double.parse(match.group(0)!) : 0.0;
  }

  // استخراج التاريخ
  DateTime _extractDate(String text) {
    try {
      // محاولة تحليل التاريخ بتنسيقات مختلفة
      final formats = [
        'dd/MM/yyyy',
        'yyyy-MM-dd',
        'MM/dd/yyyy',
        'dd-MM-yyyy',
      ];
      
      for (final format in formats) {
        try {
          // استخدام DateTime.tryParse للتنسيق القياسي
          final date = DateTime.tryParse(text);
          if (date != null) return date;
        } catch (e) {
          continue;
        }
      }
      
      return DateTime.now();
    } catch (e) {
      return DateTime.now();
    }
  }

  // تحويل الحالة إلى bool
  bool _parseBool(dynamic input) {
    if (input == null) return false;
    final text = (input is Element ? _extractText(input) : input.toString()).toLowerCase();
    if (text.isEmpty || text.contains('انتظار') || text.contains('pending') || text.contains('waiting')) {
      return false;
    }
    if (text.contains('تم') || text.contains('مسلم') || text.contains('استلام') || 
        text.contains('done') || text.contains('delivered') || text.contains('received') || 
        text.contains('completed')) {
      return true;
    }
    return text.isNotEmpty; // إذا كان هناك نص غير "انتظار" نعتبره تم (مثل التاريخ أو اسم)
  }

  // استخراج الحالة
  String _extractStatus(Element element) {
    final text = _extractText(element).toLowerCase();
    if (text.contains('مكتمل') || text.contains('completed')) return 'completed';
    if (text.contains('انتظار') || text.contains('pending')) return 'pending';
    if (text.contains('مسلم') || text.contains('delivered')) return 'delivered';
    if (text.contains('ملغي') || text.contains('cancelled')) return 'cancelled';
    return 'waiting';
  }

  // استخراج البيانات من عناصر بديلة
  List<Disbursement> _extractFromAlternativeElements(Document document) {
    final List<Disbursement> disbursements = [];
    
    // البحث عن بطاقات أو عناصر قائمة
    final cards = document.querySelectorAll('.disbursement-card, .disbursement-item, .card');
    
    for (final card in cards) {
      final disbursement = Disbursement(
        id: card.attributes['data-id'] ?? DateTime.now().millisecondsSinceEpoch.toString(),
        operationNumber: _extractText(card.querySelector('.operation-number, .number')),
        operationType: _extractText(card.querySelector('.operation-type, .type')),
        branch: _extractText(card.querySelector('.branch')),
        productsCount: _extractNumber(_extractText(card.querySelector('.products-count, .count'))),
        totalValue: _extractDouble(_extractText(card.querySelector('.total-value, .value, .amount'))),
        date: _extractDate(_extractText(card.querySelector('.date, .created-at'))),
        status: _extractStatus(card.querySelector('.status, .state') ?? Element.html('')),
        warehouseDelivered: _parseBool(card.querySelector('.warehouse, .delivered')),
        branchReceived: _parseBool(card.querySelector('.branch-received, .received')),
        notes: _extractText(card.querySelector('.notes, .description')),
        source: 'الموقع الرئيسي',
        items: [],
      );
      
      // إضافة فقط إذا كانت هناك بيانات حقيقية
      if (disbursement.operationNumber.isNotEmpty || disbursement.branch.isNotEmpty) {
        disbursements.add(disbursement);
      }
    }
    
    return disbursements;
  }

  // جلب الإحصائيات من الصفحة
  Future<Map<String, dynamic>> scrapeStatistics() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursement'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );

      if (response.statusCode == 200) {
        final document = parser.parse(response.body);
        return _extractStatisticsFromHtml(document);
      } else {
        throw Exception('Failed to load statistics page: ${response.statusCode}');
      }
    } catch (e) {
      print('Error scraping statistics: $e');
      return _getDefaultStatistics();
    }
  }

  // استخراج الإحصائيات من HTML
  Map<String, dynamic> _extractStatisticsFromHtml(Document document) {
    final stats = <String, dynamic>{};
    
    // البحث عن عناصر الإحصائيات
    final statElements = document.querySelectorAll('.stat-item, .statistic, .summary-item');
    
    for (final element in statElements) {
      final label = _extractText(element.querySelector('.label, .title, .name')).toLowerCase();
      final value = _extractText(element.querySelector('.value, .amount, .number'));
      
      if (label.contains('إجمالي') || label.contains('total')) {
        stats['totalValue'] = _extractDouble(value);
      } else if (label.contains('اليوم') || label.contains('today')) {
        stats['todayValue'] = _extractDouble(value);
      } else if (label.contains('عدد') || label.contains('count')) {
        stats['totalCount'] = _extractNumber(value);
      } else if (label.contains('متوسط') || label.contains('average')) {
        stats['averageValue'] = _extractDouble(value);
      }
    }
    
    return stats.isNotEmpty ? stats : _getDefaultStatistics();
  }

  // إحصائيات افتراضية
  Map<String, dynamic> _getDefaultStatistics() {
    return {
      'totalValue': 0.0,
      'todayValue': 0.0,
      'totalCount': 0,
      'averageValue': 0.0,
      'completedCount': 0,
      'pendingCount': 0,
    };
  }

  // جلب قائمة الفروع
  Future<List<String>> scrapeBranches() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/disbursement'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      );

      if (response.statusCode == 200) {
        final document = parser.parse(response.body);
        return _extractBranchesFromHtml(document);
      } else {
        throw Exception('Failed to load branches page: ${response.statusCode}');
      }
    } catch (e) {
      print('Error scraping branches: $e');
      return ['الكل'];
    }
  }

  // استخراج الفروع من HTML
  List<String> _extractBranchesFromHtml(Document document) {
    final Set<String> branches = {'الكل'};
    
    // البحث عن الفروع في الفلاتر أو القوائم
    final branchElements = document.querySelectorAll('.branch-filter option, .branch-item, .branch');
    
    for (final element in branchElements) {
      final branch = _extractText(element);
      if (branch.isNotEmpty && branch != 'الكل') {
        branches.add(branch);
      }
    }
    
    return branches.toList()..sort();
  }
}
