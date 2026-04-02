import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:inventory_app/core/services/firebase_disbursement_service.dart';
import 'package:inventory_app/core/models/disbursement.dart';
import 'package:inventory_app/core/models/return_model.dart';
import 'package:inventory_app/core/services/pdf_service.dart';
import 'package:inventory_app/core/services/excel_service.dart';
import 'package:inventory_app/features/inventory/presentation/pages/scanner_page.dart';
import 'package:intl/intl.dart' as intl;

class DisbursementLogPage extends StatefulWidget {
  const DisbursementLogPage({super.key});

  @override
  State<DisbursementLogPage> createState() => _DisbursementLogPageState();
}

class _DisbursementLogPageState extends State<DisbursementLogPage> {
  final FirebaseDisbursementService _service = FirebaseDisbursementService();
  final TextEditingController _searchController = TextEditingController();
  
  String _selectedBranch = 'الكل';
  DateTimeRange? _dateRange;
  bool _isLoading = true;
  
  List<Disbursement> _allIssues = [];
  List<ReturnModel> _allReturns = [];
  List<Disbursement> _filteredIssues = [];
  List<ReturnModel> _filteredReturns = [];

  Map<String, dynamic> _stats = {
    'totalIssuesValue': 0.0,
    'totalReturnsValue': 0.0,
    'netValue': 0.0,
    'issuesCount': 0,
    'returnsCount': 0,
  };

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      // Listen to both streams
      _service.getDisbursements().listen((data) {
        if (mounted) {
          setState(() {
            _allIssues = data;
            _updateFilters();
          });
        }
      });

      _service.getReturns().listen((data) {
        if (mounted) {
          setState(() {
            _allReturns = data;
            _updateFilters();
          });
        }
      });

      final stats = await _service.getFullStatistics();
      if (mounted) {
        setState(() {
          _stats = stats;
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Error loading data: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _updateFilters() {
    final query = _searchController.text.toLowerCase();
    
    setState(() {
      _filteredIssues = _allIssues.where((item) {
        final matchesSearch = item.operationNumber.toLowerCase().contains(query) ||
            item.branch.toLowerCase().contains(query);
        final matchesBranch = _selectedBranch == 'الكل' || item.branch == _selectedBranch;
        return matchesSearch && matchesBranch;
      }).toList();

      _filteredReturns = _allReturns.where((item) {
        final matchesSearch = (item.returnCode ?? '').toLowerCase().contains(query) ||
            item.branchName.toLowerCase().contains(query);
        final matchesBranch = _selectedBranch == 'الكل' || item.branchName == _selectedBranch;
        return matchesSearch && matchesBranch;
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        appBar: AppBar(
          title: Text('سجل عمليات الصرف والمرتجع', 
            style: GoogleFonts.cairo(fontWeight: FontWeight.bold, color: Colors.white)),
          backgroundColor: const Color(0xFF4F46E5),
          elevation: 0,
          actions: [
            IconButton(onPressed: _loadData, icon: const Icon(Icons.refresh, color: Colors.white)),
          ],
        ),
        body: _isLoading 
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF4F46E5)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildStatsCards(),
                  const SizedBox(height: 24),
                  _buildFilters(),
                  const SizedBox(height: 24),
                  _buildSectionHeader('سجل عمليات الصرف', FontAwesomeIcons.fileInvoice),
                  _buildIssuesTable(),
                  const SizedBox(height: 32),
                  _buildSectionHeader('سجل عمليات المرتجع', FontAwesomeIcons.undo),
                  _buildReturnsTable(),
                ],
              ),
            ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, right: 4),
      child: Row(
        children: [
          FaIcon(icon, size: 18, color: const Color(0xFF4F46E5)),
          const SizedBox(width: 8),
          Text(title, style: GoogleFonts.cairo(fontSize: 18, fontWeight: FontWeight.bold, color: const Color(0xFF1E293B))),
        ],
      ),
    );
  }

  Widget _buildStatsCards() {
    return Row(
      children: [
        _buildStatCard('إجمالي الصرف', '${_stats['totalIssuesValue'].toStringAsFixed(2)} ر.س', 
            '${_stats['issuesCount']} عملية', Colors.blue, FontAwesomeIcons.fileInvoice),
        const SizedBox(width: 12),
        _buildStatCard('إجمالي المرتجعات', '${_stats['totalReturnsValue'].toStringAsFixed(2)} ر.س', 
            '${_stats['returnsCount']} عملية', Colors.orange, FontAwesomeIcons.undo),
        const SizedBox(width: 12),
        _buildStatCard('الصافي', '${_stats['netValue'].toStringAsFixed(2)} ر.س', 
            'بعد المرتجعات', Colors.green, FontAwesomeIcons.wallet),
      ],
    );
  }

  Widget _buildStatCard(String title, String value, String sub, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border(right: BorderSide(color: color, width: 4)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: GoogleFonts.cairo(fontSize: 12, color: Colors.grey[600], fontWeight: FontWeight.w600)),
                FaIcon(icon, size: 14, color: color.withOpacity(0.5)),
              ],
            ),
            const SizedBox(height: 8),
            Text(value, style: GoogleFonts.cairo(fontSize: 16, fontWeight: FontWeight.bold, color: const Color(0xFF1E293B))),
            Text(sub, style: GoogleFonts.cairo(fontSize: 10, color: Colors.grey[500])),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10)],
      ),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: TextField(
              controller: _searchController,
              onChanged: (_) => _updateFilters(),
              decoration: InputDecoration(
                hintText: 'بحث برقم العملية أو الفرع...',
                prefixIcon: const Icon(Icons.search, size: 20),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.grey[200]!)),
              ),
              style: GoogleFonts.cairo(fontSize: 14),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FutureBuilder<List<String>>(
              future: _service.getBranches(),
              builder: (context, snapshot) {
                final branches = snapshot.data ?? ['الكل'];
                return DropdownButtonFormField<String>(
                  value: _selectedBranch,
                  items: branches.map((b) => DropdownMenuItem(value: b, child: Text(b, style: GoogleFonts.cairo(fontSize: 13)))).toList(),
                  onChanged: (val) {
                    setState(() {
                      _selectedBranch = val!;
                      _updateFilters();
                    });
                  },
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIssuesTable() {
    return _buildTableWrapper(
      columns: ['رقم العملية', 'نوع العملية', 'الفرع', 'التاريخ', 'استلام الفرع', 'تسليم المستودع', 'المصدر', 'الإجراءات'],
      rows: _filteredIssues.map((item) => <Widget>[
        _buildTextCell(item.operationNumber, isBold: true, color: const Color(0xFF4F46E5)),
        _buildTextCell(item.operationType),
        _buildTextCell(item.branch),
        _buildTextCell(intl.DateFormat('yyyy/MM/dd HH:mm').format(item.date)),
        _buildStatusCell(item.branchReceived),
        _buildStatusCell(item.warehouseDelivered),
        _buildTextCell(item.source ?? '-', isBadge: true, color: Colors.purple),
        _buildActionsMenu(item),
      ]).toList(),
    );
  }

  Widget _buildActionsMenu(Disbursement item) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert, size: 18, color: Color(0xFF64748B)),
      padding: EdgeInsets.zero,
      offset: const Offset(0, 40),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      tooltip: 'الإجراءات / Actions',
      onSelected: (val) => _handleAction(val, item),
      itemBuilder: (context) => [
        _buildPopupHeader('الإجراءات', 'Actions'),
        _buildPopupItem('assemble', Icons.inventory_2, 'تجميـــع', 'Assemble'),
        _buildPopupItem('verify', Icons.barcode_reader, 'مطابقة', 'Verify'),
        _buildPopupItem('print', Icons.print, 'طباعة الصرف', 'Print Issue'),
        _buildPopupItem('odoo', Icons.download, 'تصدير للأودو', '(Odoo Excel)'),
        _buildPopupItem('edit', Icons.edit, 'تعديل', 'Edit'),
        const PopupMenuDivider(),
        _buildPopupItem('deliver', Icons.check_circle_outline, 'تم التسليم', 'Delivered', 
            enabled: !item.warehouseDelivered),
        const PopupMenuDivider(),
        _buildPopupItem('delete', Icons.delete_outline, 'حذف', 'Delete', color: Colors.red),
      ],
    );
  }

  PopupMenuItem<String> _buildPopupHeader(String ar, String en) {
    return PopupMenuItem<String>(
      enabled: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(ar, style: GoogleFonts.cairo(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey[800], height: 1)),
          Text(en, style: GoogleFonts.cairo(fontSize: 10, color: Colors.grey[500], height: 1.2)),
        ],
      ),
    );
  }

  PopupMenuItem<String> _buildPopupItem(String value, IconData icon, String ar, String en, {Color? color, bool enabled = true}) {
    return PopupMenuItem<String>(
      value: value,
      enabled: enabled,
      child: Row(
        children: [
          Icon(icon, size: 18, color: color ?? const Color(0xFF6366F1)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(ar, style: GoogleFonts.cairo(fontSize: 12, fontWeight: FontWeight.w600, color: color ?? Colors.black87, height: 1)),
                Text(en, style: GoogleFonts.cairo(fontSize: 10, color: (color ?? Colors.grey[600])!.withOpacity(0.8), height: 1.2)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _handleAction(String action, Disbursement item) async {
    switch (action) {
      case 'assemble':
        _showToast('جاري تحضير ملف التجميع...');
        await PdfService.printAssembly(item);
        break;
      case 'verify':
        Navigator.push(context, MaterialPageRoute(builder: (context) => ScannerPage()));
        break;
      case 'print':
        _showToast('جاري تجهيز الفاتورة للطباعة...');
        await PdfService.printDisbursement(item);
        break;
      case 'odoo':
        _showToast('جاري تصدير البيانات إلى Excel...');
        await ExcelService.exportToOdoo(item);
        break;
      case 'edit':
        _showToast('ميزة التعديل قيد التطوير');
        break;
      case 'deliver':
        _confirmDelivery(item);
        break;
      case 'delete':
        _confirmDelete(item);
        break;
    }
  }

  void _confirmDelivery(Disbursement item) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('تأكيد التسليم', style: GoogleFonts.cairo(fontWeight: FontWeight.bold)),
        content: Text('هل أنت متأكد من تغيير حالة العملية إلى "تم التسليم"؟', style: GoogleFonts.cairo()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('إلغاء', style: GoogleFonts.cairo())),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              await _service.updateDisbursementStatus(item.id!, true);
              _showToast('تم تحديث حالة التسليم بنجاح');
            },
            child: Text('تأكيد', style: GoogleFonts.cairo()),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(Disbursement item) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('حذف العملية', style: GoogleFonts.cairo(fontWeight: FontWeight.bold, color: Colors.red)),
        content: Text('هل أنت متأكد من حذف هذه العملية؟ لا يمكنك التراجع عن هذا الإجراء.', style: GoogleFonts.cairo()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('إلغاء', style: GoogleFonts.cairo())),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              Navigator.pop(context);
              await _service.deleteDisbursement(item.id!);
              _showToast('تم حذف العملية بنجاح');
            },
            child: Text('حذف', style: GoogleFonts.cairo(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showToast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: GoogleFonts.cairo()),
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1E293B),
      ),
    );
  }

  Widget _buildReturnsTable() {
    return _buildTableWrapper(
      columns: ['رقم المرتجع', 'الفرع', 'المنتجات', 'القيمة', 'السبب', 'التاريخ', 'الحالة', 'الإجراءات'],
      rows: _filteredReturns.map((item) => <Widget>[
        _buildTextCell(item.returnCode ?? '', isBold: true, color: Colors.orange),
        _buildTextCell(item.branchName),
        _buildTextCell(item.products.length.toString()),
        _buildTextCell('${item.totalValue.toStringAsFixed(2)} ر.س'),
        _buildTextCell(item.reason, maxWidth: 120),
        _buildTextCell(intl.DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt)),
        _buildStatusCell(item.status == 'completed' || item.status == 'approved'),
        _buildReturnActionsMenu(item),
      ]).toList(),
    );
  }

  Widget _buildReturnActionsMenu(ReturnModel item) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert, size: 18, color: Color(0xFF64748B)),
      padding: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      onSelected: (val) async {
        if (val == 'delete') {
          await _service.deleteReturn(item.id!);
          _showToast('تم حذف المرتجع بنجاح');
        }
      },
      itemBuilder: (context) => [
        _buildPopupItem('print', Icons.print, 'طباعة المرتجع', 'Print Return'),
        _buildPopupItem('delete', Icons.delete_outline, 'حذف', 'Delete', color: Colors.red),
      ],
    );
  }

  Widget _buildTableWrapper({required List<String> columns, required List<List<Widget>> rows}) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: MaterialStateProperty.all(const Color(0xFFF8FAFC)),
          columnSpacing: 20,
          horizontalMargin: 12,
          dataRowHeight: 64, // Increased for dual text visibility
          columns: columns.map((c) => DataColumn(label: Text(c, style: GoogleFonts.cairo(fontWeight: FontWeight.bold, fontSize: 13, color: const Color(0xFF64748B))))).toList(),
          rows: rows.map((r) => DataRow(cells: r.map((c) => DataCell(c)).toList())).toList(),
        ),
      ),
    );
  }

  Widget _buildTextCell(String text, {bool isBold = false, Color? color, double? maxWidth, bool isBadge = false}) {
    Color displayColor = color ?? Colors.blue;
    
    Widget child = Text(
      text,
      style: GoogleFonts.cairo(
        fontSize: 12,
        fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
        color: isBadge ? displayColor.withOpacity(0.9) : displayColor,
      ),
      overflow: TextOverflow.ellipsis,
    );

    if (isBadge) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: displayColor.withOpacity(0.1),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: displayColor.withOpacity(0.2)),
        ),
        child: child,
      );
    }

    return Container(
      constraints: maxWidth != null ? BoxConstraints(maxWidth: maxWidth) : null,
      child: child,
    );
  }

  Widget _buildStatusCell(bool isDone) {
    return Container(
      width: 70,
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: (isDone ? Colors.green : Colors.orange).withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: (isDone ? Colors.green : Colors.orange).withOpacity(0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            isDone ? 'تم' : 'انتظار',
            style: GoogleFonts.cairo(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: isDone ? Colors.green[700] : Colors.orange[700],
              height: 1,
            ),
          ),
          Text(
            isDone ? 'Done' : 'Waiting',
            style: GoogleFonts.cairo(
              fontSize: 8,
              color: (isDone ? Colors.green : Colors.orange).withOpacity(0.7),
              height: 1,
            ),
          ),
        ],
      ),
    );
  }
}
