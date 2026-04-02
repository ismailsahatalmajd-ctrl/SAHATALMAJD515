import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:inventory_app/core/services/simple_firebase_service.dart';
import 'package:inventory_app/core/models/simple_disbursement.dart';

class SimpleDisbursementLogPage extends StatefulWidget {
  const SimpleDisbursementLogPage({super.key});

  @override
  State<SimpleDisbursementLogPage> createState() => _SimpleDisbursementLogPageState();
}

class _SimpleDisbursementLogPageState extends State<SimpleDisbursementLogPage> {
  final SimpleFirebaseService _firebaseService = SimpleFirebaseService();
  final TextEditingController _searchController = TextEditingController();
  String _selectedBranch = 'الكل';
  bool _isLoading = false;
  List<SimpleDisbursement> _allDisbursements = [];
  List<SimpleDisbursement> _filteredDisbursements = [];

  @override
  void initState() {
    super.initState();
    _loadDisbursements();
  }

  Future<void> _loadDisbursements() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // التحقق من وجود بيانات
      final hasData = await _firebaseService.hasData();
      
      if (!hasData) {
        // إنشاء بيانات تجريبية
        await _firebaseService.createSampleData();
        _showSnackBar('تم إنشاء بيانات تجريبية');
      }
      
      // جلب البيانات
      final disbursements = await _firebaseService.getDisbursements();
      
      setState(() {
        _allDisbursements = disbursements;
        _filteredDisbursements = disbursements;
        _isLoading = false;
      });
    } catch (e) {
      print('Error loading disbursements: $e');
      setState(() {
        _isLoading = false;
      });
      _showSnackBar('فشل تحميل البيانات');
    }
  }

  void _applyFilters() {
    setState(() {
      _filteredDisbursements = _allDisbursements.where((disbursement) {
        // فلترة البحث
        bool matchesSearch = true;
        if (_searchController.text.isNotEmpty) {
          final searchLower = _searchController.text.toLowerCase();
          matchesSearch = disbursement.operationNumber.toLowerCase().contains(searchLower) ||
                         disbursement.operationType.toLowerCase().contains(searchLower) ||
                         disbursement.branch.toLowerCase().contains(searchLower);
        }
        
        // فلترة الفرع
        bool matchesBranch = _selectedBranch == 'الكل' || disbursement.branch == _selectedBranch;
        
        return matchesSearch && matchesBranch;
      }).toList();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: Text(
          'سجل عمليات الصرف',
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
            onPressed: _loadDisbursements,
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث',
          ),
        ],
      ),
      body: Column(
        children: [
          _buildFilters(),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _buildDisbursementTable(),
          ),
        ],
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // حقل البحث
          TextField(
            controller: _searchController,
            onChanged: (value) => _applyFilters(),
            decoration: InputDecoration(
              hintText: 'البحث...',
              hintStyle: GoogleFonts.cairo(color: Colors.grey[500]),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF4F46E5)),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey[200]!),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey[200]!),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF4F46E5)),
              ),
            ),
            style: GoogleFonts.cairo(),
          ),
          const SizedBox(height: 12),
          // فلتر الفرع
          FutureBuilder<List<String>>(
            future: _firebaseService.getBranches(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey[200]!),
                  ),
                  child: Text('جاري التحميل...', style: GoogleFonts.cairo(fontSize: 14)),
                );
              }

              final branches = snapshot.data!;
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey[200]!),
                ),
                child: DropdownButton<String>(
                  value: _selectedBranch,
                  isExpanded: true,
                  underline: const SizedBox(),
                  items: branches.map((branch) {
                    return DropdownMenuItem<String>(
                      value: branch,
                      child: Text(
                        branch,
                        style: GoogleFonts.cairo(fontSize: 14),
                      ),
                    );
                  }).toList(),
                  onChanged: (value) {
                    setState(() {
                      _selectedBranch = value!;
                      _applyFilters();
                    });
                  },
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildDisbursementTable() {
    if (_filteredDisbursements.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            FaIcon(FontAwesomeIcons.boxOpen, size: 64, color: Colors.grey[300]),
            const SizedBox(height: 16),
            Text(
              'لا توجد عمليات صرف',
              style: GoogleFonts.cairo(fontSize: 18, color: Colors.grey[600], fontWeight: FontWeight.bold),
            ),
            Text(
              'لم يتم العثور على عمليات مطابقة',
              style: GoogleFonts.cairo(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          _buildTableHeader(),
          Expanded(
            child: ListView.builder(
              itemCount: _filteredDisbursements.length,
              itemBuilder: (context, index) {
                return _buildDisbursementRow(_filteredDisbursements[index]);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF4F46E5),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(12),
          topRight: Radius.circular(12),
        ),
      ),
      child: Row(
        children: [
          Expanded(flex: 1, child: _buildHeaderCell('إجراءات')),
          Expanded(flex: 1, child: _buildHeaderCell('تسليم')),
          Expanded(flex: 1, child: _buildHeaderCell('استلام')),
          Expanded(flex: 1, child: _buildHeaderCell('التاريخ')),
          Expanded(flex: 1, child: _buildHeaderCell('الفرع')),
          Expanded(flex: 1, child: _buildHeaderCell('النوع')),
          Expanded(flex: 1, child: _buildHeaderCell('رقم')),
        ],
      ),
    );
  }

  Widget _buildHeaderCell(String text) {
    return Text(
      text,
      style: GoogleFonts.cairo(
        color: Colors.white,
        fontWeight: FontWeight.bold,
        fontSize: 11,
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildDisbursementRow(SimpleDisbursement disbursement) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey[200]!),
        ),
      ),
      child: Row(
        children: [
          Expanded(flex: 1, child: _buildActionsMenu(disbursement)),
          Expanded(flex: 1, child: _buildStatusCell(disbursement.warehouseDelivered)),
          Expanded(flex: 1, child: _buildStatusCell(disbursement.branchReceived)),
          Expanded(flex: 1, child: _buildCell('${disbursement.date.day}/${disbursement.date.month}/${disbursement.date.year}')),
          Expanded(flex: 1, child: _buildCell(disbursement.branch)),
          Expanded(flex: 1, child: _buildCell(disbursement.operationType)),
          Expanded(flex: 1, child: _buildCell(disbursement.operationNumber)),
        ],
      ),
    );
  }

  Widget _buildCell(String text) {
    return Text(
      text,
      style: GoogleFonts.cairo(
        fontSize: 10,
        color: const Color(0xFF1F2937),
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildStatusCell(String? status) {
    if (status == null || status.isEmpty) {
      return _buildCell('انتظار');
    }
    
    Color color = Colors.green;
    String statusText = 'تم';
    
    if (status.toLowerCase().contains('pending') || status.toLowerCase().contains('انتظار')) {
      color = Colors.orange;
      statusText = 'انتظار';
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        statusText,
        style: GoogleFonts.cairo(
          fontSize: 8,
          color: color,
          fontWeight: FontWeight.bold,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildActionsMenu(SimpleDisbursement disbursement) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert, color: Color(0xFF4F46E5), size: 16),
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'view',
          child: Row(
            children: [
              const Icon(Icons.visibility, size: 16),
              const SizedBox(width: 8),
              Text('عرض', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'print',
          child: Row(
            children: [
              const Icon(Icons.print, size: 16),
              const SizedBox(width: 8),
              Text('طباعة', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
      ],
      onSelected: (value) => _handleAction(value, disbursement),
    );
  }

  void _handleAction(String action, SimpleDisbursement disbursement) {
    switch (action) {
      case 'view':
        _showDisbursementDetails(disbursement);
        break;
      case 'print':
        _showSnackBar('جاري طباعة ${disbursement.operationNumber}...');
        break;
    }
  }

  void _showDisbursementDetails(SimpleDisbursement disbursement) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'تفاصيل العملية',
          style: GoogleFonts.cairo(fontWeight: FontWeight.bold),
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildDetailRow('رقم العملية', disbursement.operationNumber),
              _buildDetailRow('نوع العملية', disbursement.operationType),
              _buildDetailRow('الفرع', disbursement.branch),
              _buildDetailRow('عدد المنتجات', '${disbursement.productsCount}'),
              _buildDetailRow('القيمة الإجمالية', '${disbursement.totalValue.toStringAsFixed(2)} ريال'),
              _buildDetailRow('التاريخ', '${disbursement.date.day}/${disbursement.date.month}/${disbursement.date.year}'),
              _buildDetailRow('الحالة', disbursement.status),
              if (disbursement.notes?.isNotEmpty == true)
                _buildDetailRow('ملاحظات', disbursement.notes!),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('إغلاق', style: GoogleFonts.cairo()),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: GoogleFonts.cairo(fontWeight: FontWeight.bold),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.cairo(),
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
