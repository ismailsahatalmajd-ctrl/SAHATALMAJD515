import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:inventory_app/core/services/web_scraper_service.dart';
import 'package:inventory_app/core/models/disbursement.dart';

class DisbursementPage extends StatefulWidget {
  const DisbursementPage({super.key});

  @override
  State<DisbursementPage> createState() => _DisbursementPageState();
}

class _DisbursementPageState extends State<DisbursementPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  final WebScraperService _webService = WebScraperService();
  String _selectedBranch = 'الكل';
  DateTimeRange? _dateRange;

  // Summary data
  double _totalValue = 0.0;
  double _todayValue = 0.0;
  int _totalCount = 0;
  double _averageValue = 0.0;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadSummaryData();
  }

  Future<void> _loadSummaryData() async {
    setState(() {
      _isLoading = true;
    });
    
    try {
      final stats = await _webService.scrapeStatistics();
      
      setState(() {
        _totalValue = stats['totalValue']?.toDouble() ?? 0.0;
        _todayValue = stats['todayValue']?.toDouble() ?? 0.0;
        _totalCount = stats['totalCount']?.toInt() ?? 0;
        _averageValue = stats['averageValue']?.toDouble() ?? 0.0;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      print('Error loading summary data: $e');
      _showSnackBar('فشل تحميل البيانات من الموقع');
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          _buildSliverAppBar(),
        ],
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildSummaryTab(),
            _buildDisbursementTab(),
            _buildAggregatedTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      expandedHeight: 120,
      floating: false,
      pinned: true,
      backgroundColor: const Color(0xFF4F46E5),
      elevation: 0,
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                top: -20,
                right: -20,
                child: Opacity(
                  opacity: 0.1,
                  child: Icon(Icons.inventory, size: 120, color: Colors.white),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'الصرف',
                      style: GoogleFonts.cairo(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      'إدارة عمليات الصرف والمتابعة',
                      style: GoogleFonts.cairo(
                        fontSize: 14,
                        color: Colors.white.withOpacity(0.8),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottom: TabBar(
        controller: _tabController,
        indicatorColor: Colors.white,
        indicatorWeight: 3,
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white.withOpacity(0.6),
        labelStyle: GoogleFonts.cairo(fontWeight: FontWeight.bold),
        tabs: const [
          Tab(text: 'ملخص'),
          Tab(text: 'سجل الصرف'),
          Tab(text: 'الفواتير المجمع'),
        ],
      ),
    );
  }

  Widget _buildSummaryTab() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _buildSummaryCards(),
          const SizedBox(height: 24),
          _buildQuickStats(),
        ],
      ),
    );
  }

  Widget _buildSummaryCards() {
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        _buildSummaryCard(
          'إجمالي الصرف',
          _totalValue.toStringAsFixed(2),
          'ر.س',
          FontAwesomeIcons.arrowUp,
          Colors.green,
        ),
        _buildSummaryCard(
          'صرف اليوم',
          _todayValue.toStringAsFixed(2),
          'ر.س',
          FontAwesomeIcons.calendarDay,
          Colors.blue,
        ),
        _buildSummaryCard(
          'عدد العمليات',
          _totalCount.toString(),
          'عملية',
          FontAwesomeIcons.receipt,
          Colors.orange,
        ),
        _buildSummaryCard(
          'متوسط الصرف',
          _averageValue.toStringAsFixed(2),
          'ر.س',
          FontAwesomeIcons.chartLine,
          Colors.purple,
        ),
      ],
    );
  }

  Widget _buildSummaryCard(String title, String value, String unit, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: FaIcon(icon, color: color, size: 20),
              ),
              const Spacer(),
              Icon(Icons.more_vert, color: Colors.grey[400]),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: GoogleFonts.cairo(
              fontSize: 12,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                value,
                style: GoogleFonts.cairo(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF1F2937),
                ),
              ),
              const SizedBox(width: 4),
              Text(
                unit,
                style: GoogleFonts.cairo(
                  fontSize: 12,
                  color: Colors.grey[500],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickStats() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'إحصائيات سريعة',
            style: GoogleFonts.cairo(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF1F2937),
            ),
          ),
          const SizedBox(height: 16),
          _buildStatItem('أكثر المنتجات صرفاً', 'أكياس بلاستيك كبيرة', '2,345 قطعة'),
          _buildStatItem('الفرع الأكثر صرفاً', 'الفرع الرئيسي', '45 عملية'),
          _buildStatItem('متوسط القيمة per عملية', '56,824 ر.س', 'زيادة 12%'),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, String subtitle) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF4F46E5),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: GoogleFonts.cairo(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  value,
                  style: GoogleFonts.cairo(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF1F2937),
                  ),
                ),
              ],
            ),
          ),
          Text(
            subtitle,
            style: GoogleFonts.cairo(
              fontSize: 12,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDisbursementTab() {
    return Column(
      children: [
        _buildFilters(),
        Expanded(
          child: _buildDisbursementTable(),
        ),
      ],
    );
  }

  Widget _buildFilters() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'بحث عن عملية صرف...',
                    hintStyle: GoogleFonts.cairo(fontSize: 14),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF4F46E5)),
                    filled: true,
                    fillColor: const Color(0xFFF9FAFB),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF4F46E5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.filter_list, color: Colors.white, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'فلترة',
                      style: GoogleFonts.cairo(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildBranchFilter(),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildDateFilter(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  
  Widget _buildDateFilter() {
    return GestureDetector(
      onTap: () async {
        final DateTimeRange? picked = await showDateRangePicker(
          context: context,
          firstDate: DateTime(2020),
          lastDate: DateTime.now(),
          builder: (context, child) {
            return Theme(
              data: Theme.of(context).copyWith(
                colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: const Color(0xFF4F46E5),
                ),
              ),
              child: child!,
            );
          },
        );
        if (picked != null) {
          setState(() {
            _dateRange = picked;
          });
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[200]!),
        ),
        child: Row(
          children: [
            const Icon(Icons.date_range, color: Color(0xFF4F46E5), size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _dateRange != null
                    ? '${_dateRange!.start.day}/${_dateRange!.start.month} - ${_dateRange!.end.day}/${_dateRange!.end.month}'
                    : 'اختر التاريخ',
                style: GoogleFonts.cairo(fontSize: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDisbursementTable() {
  return FutureBuilder<List<Disbursement>>(
    future: _getDisbursements(),
    builder: (context, snapshot) {
      if (snapshot.connectionState == ConnectionState.waiting) {
        return const Center(child: CircularProgressIndicator());
      }

      if (snapshot.hasError) {
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FaIcon(FontAwesomeIcons.exclamationTriangle, size: 64, color: Colors.red[300]),
              const SizedBox(height: 16),
              Text(
                'خطأ في تحميل البيانات',
                style: GoogleFonts.cairo(fontSize: 18, color: Colors.red[600], fontWeight: FontWeight.bold),
              ),
              Text(
                snapshot.error.toString(),
                style: GoogleFonts.cairo(color: Colors.grey[500]),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => setState(() {}),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4F46E5),
                  foregroundColor: Colors.white,
                ),
                child: Text('إعادة المحاولة', style: GoogleFonts.cairo()),
              ),
            ],
          ),
        );
      }

      final disbursements = snapshot.data ?? [];
      
      if (disbursements.isEmpty) {
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
                'لم يتم العثور على عمليات صرف مطابقة للفلاتر',
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
          borderRadius: BorderRadius.circular(16),
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
                itemCount: disbursements.length,
                itemBuilder: (context, index) {
                  return _buildDisbursementRow(disbursements[index]);
                },
              ),
            ),
          ],
        ),
      );
    },
  );
}

Future<List<Disbursement>> _getDisbursements() async {
  final allDisbursements = await _webService.scrapeDisbursementPage();
  
  // تطبيق الفلاتر
  if (_dateRange != null) {
    return allDisbursements.where((d) => 
      d.date.isAfter(_dateRange!.start.subtract(const Duration(days: 1))) && 
      d.date.isBefore(_dateRange!.end.add(const Duration(days: 1)))
    ).toList();
  } else if (_selectedBranch != 'الكل') {
    return allDisbursements.where((d) => d.branch == _selectedBranch).toList();
  } else {
    return allDisbursements;
  }
}

  Widget _buildTableHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF4F46E5),
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          Expanded(flex: 1, child: _buildHeaderCell('الإجراءات')),
          Expanded(flex: 1, child: _buildHeaderCell('المستودع/تسليم')),
          Expanded(flex: 1, child: _buildHeaderCell('استلام الفرع')),
          Expanded(flex: 1, child: _buildHeaderCell('التاريخ')),
          Expanded(flex: 1, child: _buildHeaderCell('القيمة الإجمالية')),
          Expanded(flex: 1, child: _buildHeaderCell('عدد المنتجات')),
          Expanded(flex: 1, child: _buildHeaderCell('الفرع')),
          Expanded(flex: 1, child: _buildHeaderCell('نوع العملية')),
          Expanded(flex: 1, child: _buildHeaderCell('رقم العملية')),
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

  Widget _buildDisbursementRow(Disbursement disbursement) {
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
          Expanded(flex: 1, child: _buildStatusCell(disbursement.warehouseDelivered != null ? 'تم' : 'انتظار')),
          Expanded(flex: 1, child: _buildStatusCell(disbursement.branchReceived != null ? 'تم' : 'انتظار')),
          Expanded(flex: 1, child: _buildCell('${disbursement.date.day}/${disbursement.date.month}/${disbursement.date.year}')),
          Expanded(flex: 1, child: _buildCell('${disbursement.totalValue.toStringAsFixed(2)}')),
          Expanded(flex: 1, child: _buildCell('${disbursement.productsCount}')),
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
        fontSize: 11,
        color: const Color(0xFF1F2937),
      ),
      textAlign: TextAlign.center,
    );
  }

  Widget _buildActionsMenu(Disbursement disbursement) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert, color: Color(0xFF4F46E5), size: 18),
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'assemble',
          child: Row(
            children: [
              const Icon(Icons.inventory_2, size: 16),
              const SizedBox(width: 8),
              Text('تجميع', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'verify',
          child: Row(
            children: [
              const Icon(Icons.check_circle, size: 16),
              const SizedBox(width: 8),
              Text('مطابقة', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'print',
          child: Row(
            children: [
              const Icon(Icons.print, size: 16),
              const SizedBox(width: 8),
              Text('طباعة الصرف', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'export',
          child: Row(
            children: [
              const Icon(Icons.download, size: 16),
              const SizedBox(width: 8),
              Text('تصدير لأودو', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'edit',
          child: Row(
            children: [
              const Icon(Icons.edit, size: 16),
              const SizedBox(width: 8),
              Text('تعديل', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'delivered',
          child: Row(
            children: [
              const Icon(Icons.local_shipping, size: 16),
              const SizedBox(width: 8),
              Text('تم التسليم', style: GoogleFonts.cairo(fontSize: 12)),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'delete',
          child: Row(
            children: [
              const Icon(Icons.delete, color: Colors.red, size: 16),
              const SizedBox(width: 8),
              Text('حذف', style: GoogleFonts.cairo(fontSize: 12, color: Colors.red)),
            ],
          ),
        ),
      ],
      onSelected: (value) => _handleAction(value, disbursement),
    );
  }

  void _handleAction(String action, Disbursement disbursement) async {
    bool success = false;
    
    switch (action) {
      case 'assemble':
        // Web scraping لا يدعم تعديل البيانات
        _showSnackBar('هذه الميزة غير متاحة في وضع العرض فقط');
        break;
      case 'verify':
        _showSnackBar('هذه الميزة غير متاحة في وضع العرض فقط');
        break;
      case 'print':
        _showSnackBar('جاري طباعة الصرف...');
        break;
      case 'export':
        _showSnackBar('جاري التصدير لأودو...');
        break;
      case 'edit':
        _showSnackBar('هذه الميزة غير متاحة في وضع العرض فقط');
        break;
      case 'delivered':
        _showSnackBar('هذه الميزة غير متاحة في وضع العرض فقط');
        break;
      case 'delete':
        _showSnackBar('هذه الميزة غير متاحة في وضع العرض فقط');
        break;
    }
  }

  void _showDeleteConfirmation(Disbursement disbursement) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('غير متاح', style: GoogleFonts.cairo(fontWeight: FontWeight.bold)),
        content: Text('هذه الميزة غير متاحة في وضع العرض فقط من الموقع', 
            style: GoogleFonts.cairo()),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('موافق', style: GoogleFonts.cairo()),
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

  Widget _buildStatusCell(String status) {
    Color color = status == 'تم' ? Colors.green : Colors.orange;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status,
        style: GoogleFonts.cairo(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.bold,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildBranchFilter() {
    return FutureBuilder<List<String>>(
      future: _webService.scrapeBranches(),
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
              });
            },
          ),
        );
      },
    );
  }

  Widget _buildAggregatedTab() {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFF4F46E5),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'الفواتير المجمع',
                    style: GoogleFonts.cairo(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.download, color: Colors.white, size: 16),
                      const SizedBox(width: 8),
                      Text(
                        'تصدير',
                        style: GoogleFonts.cairo(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Disbursement>>(
              future: _webService.scrapeDisbursementPage(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final disbursements = snapshot.data!;
                final aggregatedItems = _aggregateDisbursementItems(disbursements);

                if (aggregatedItems.isEmpty) {
                  return Center(
                    child: Text(
                      'لا توجد عناصر لعرضها',
                      style: GoogleFonts.cairo(
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                    ),
                  );
                }

                return ListView.builder(
                  itemCount: aggregatedItems.length,
                  itemBuilder: (context, index) {
                    final item = aggregatedItems[index];
                    return _buildAggregatedRow(item);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> _aggregateDisbursementItems(List<Disbursement> disbursements) {
    final Map<String, Map<String, dynamic>> aggregated = {};

    for (final disbursement in disbursements) {
      for (final item in disbursement.items) {
        final key = item.productId;
        if (aggregated.containsKey(key)) {
          aggregated[key]!['quantity'] += item.quantity;
          aggregated[key]!['totalPrice'] += item.totalPrice;
        } else {
          aggregated[key] = {
            'productName': item.productName,
            'productCode': item.productCode,
            'quantity': item.quantity,
            'totalPrice': item.totalPrice,
          };
        }
      }
    }

    return aggregated.values.toList();
  }

  Widget _buildAggregatedRow(Map<String, dynamic> item) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey[200]!),
        ),
      ),
      child: Row(
        children: [
          Expanded(flex: 1, child: _buildCell('${item['quantity']}')),
          Expanded(flex: 3, child: _buildCell(item['productName'])),
          Expanded(flex: 2, child: _buildCell(item['productCode'])),
          Expanded(flex: 1, child: _buildCell('${item['totalPrice'].toStringAsFixed(2)}')),
        ],
      ),
    );
  }
}
