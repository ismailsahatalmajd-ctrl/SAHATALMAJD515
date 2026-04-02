import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:flutter_staggered_animations/flutter_staggered_animations.dart';
import 'package:inventory_app/core/services/auth_service.dart';
import 'package:inventory_app/core/services/product_service.dart';
import 'package:inventory_app/core/models/product.dart';
import '../widgets/product_card.dart';
import '../widgets/product_image_widget.dart';
import '../widgets/stats_card.dart';
import '../pages/add_product_page.dart';
import '../pages/disbursement_page.dart';
import '../pages/disbursement_log_page.dart';
import '../pages/simple_disbursement_log_page.dart';
import '../pages/data_test_page.dart';
import '../pages/edit_product_page.dart';
import '../pages/label_designer_page.dart';
import '../pages/product_details_page.dart';
import '../pages/scanner_page.dart';

enum ViewMode { list, grid, table }

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ProductService _productService = ProductService();
  String _searchQuery = '';
  String _selectedCategory = 'الكل';
  ViewMode _viewMode = ViewMode.list;
  List<String> _selectedCategories = ['الكل'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
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
            _buildProductsTab(),
            _buildStatsTab(),
            _buildSettingsTab(),
          ],
        ),
      ),
      floatingActionButton: _buildFloatingActionButton(),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      expandedHeight: 180,
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
                  child: Icon(Icons.inventory, size: 150, color: Colors.white),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 80, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ساحة المجد',
                      style: GoogleFonts.cairo(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      'نظام إدارة المخزون الذكي',
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
        title: Text(
          'إدارة المخزون',
          style: GoogleFonts.cairo(
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        centerTitle: true,
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.history, color: Colors.white),
          tooltip: 'سجل الصرف والمرتجع',
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => const DisbursementLogPage()),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.logout, color: Colors.white),
          onPressed: () async => await AuthService().signOut(),
        ),
      ],
      bottom: TabBar(
        controller: _tabController,
        indicatorColor: Colors.white,
        indicatorWeight: 3,
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white.withOpacity(0.6),
        labelStyle: GoogleFonts.cairo(fontWeight: FontWeight.bold),
        tabs: const [
          Tab(text: 'المنتجات'),
          Tab(text: 'الإحصائيات'),
          Tab(text: 'الإعدادات'),
        ],
      ),
    );
  }

  Widget _buildProductsTab() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: TextField(
            onChanged: (value) => setState(() => _searchQuery = value),
            decoration: InputDecoration(
              hintText: 'بحث عن منتج برقم الصنف أو الاسم...',
              hintStyle: GoogleFonts.cairo(fontSize: 14),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF4F46E5)),
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              suffixIcon: IconButton(
                icon: const Icon(Icons.qr_code_scanner, color: Color(0xFF4F46E5)),
                onPressed: () async {
                  final String? result = await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const ScannerPage()),
                  );
                  if (result != null) {
                    setState(() {
                      _searchQuery = result;
                    });
                  }
                },
              ),
            ),
          ),
        ),
        _buildViewToggle(),
        _buildCategoryFilter(),
        Expanded(
          child: StreamBuilder<List<Product>>(
            stream: _getProductsStream(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return Center(child: Text('خطأ: ${snapshot.error}'));
              }

              final products = snapshot.data ?? [];

              if (products.isEmpty) {
                return _buildEmptyState();
              }

              return AnimationLimiter(
                child: _buildView(products),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FaIcon(FontAwesomeIcons.boxOpen, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'لا توجد منتجات',
            style: GoogleFonts.cairo(fontSize: 18, color: Colors.grey[600], fontWeight: FontWeight.bold),
          ),
          Text(
            'اضغط على + لإضافة منتج جديد للمخزون',
            style: GoogleFonts.cairo(color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryFilter() {
    return FutureBuilder<List<String>>(
      future: _productService.getCategories(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const SizedBox();

        final categories = ['الكل', ...snapshot.data!];

        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
          child: PopupMenuButton<String>(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _selectedCategories.contains('الكل') 
                      ? 'جميع التصنيفات' 
                      : _selectedCategories.length == 1 
                          ? _selectedCategories.first
                          : '${_selectedCategories.length} تصنيفات مختارة',
                  style: GoogleFonts.cairo(
                    fontSize: 14,
                    color: const Color(0xFF1F2937),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Row(
                  children: [
                    Icon(
                      Icons.filter_list,
                      color: const Color(0xFF4F46E5),
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      Icons.keyboard_arrow_down,
                      color: const Color(0xFF4F46E5),
                      size: 20,
                    ),
                  ],
                ),
              ],
            ),
            itemBuilder: (context) {
              return categories.map((category) {
                final isSelected = _selectedCategories.contains(category);
                return PopupMenuItem<String>(
                  value: category,
                  child: Row(
                    children: [
                      Icon(
                        isSelected ? Icons.check_box : Icons.check_box_outline_blank,
                        color: isSelected ? const Color(0xFF4F46E5) : Colors.grey,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          category,
                          style: GoogleFonts.cairo(
                            fontSize: 14,
                            color: isSelected ? const Color(0xFF4F46E5) : Colors.black87,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList();
            },
            onSelected: (String value) {
              setState(() {
                if (value == 'الكل') {
                  _selectedCategories = ['الكل'];
                } else {
                  _selectedCategories.remove('الكل');
                  if (_selectedCategories.contains(value)) {
                    _selectedCategories.remove(value);
                    if (_selectedCategories.isEmpty) {
                      _selectedCategories = ['الكل'];
                    }
                  } else {
                    _selectedCategories.add(value);
                  }
                }
              });
            },
          ),
        );
      },
    );
  }

  Widget _buildStatsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: StreamBuilder<List<Product>>(
        stream: _productService.getProducts(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

          final products = snapshot.data!;
          final totalProducts = products.length;
          final totalQuantity = products.fold<double>(0, (sum, p) => sum + p.quantity);
          final totalValue = products.fold<double>(0, (sum, p) => sum + (p.price * p.quantity));
          final lowStockCount = products.where((p) => p.quantity < 5).length;

          return Column(
            children: [
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                children: [
                  StatsCard(
                    title: 'إجمالي المواد',
                    value: totalProducts.toString(),
                    icon: Icons.inventory_2,
                    color: const Color(0xFF4F46E5),
                  ),
                  StatsCard(
                    title: 'إجمالي الكمية',
                    value: totalQuantity.toString(),
                    icon: Icons.unarchive,
                    color: const Color(0xFF10B981),
                  ),
                  StatsCard(
                    title: 'القيمة التقديرية',
                    value: '${totalValue.toStringAsFixed(0)} ر.س',
                    icon: Icons.account_balance_wallet,
                    color: const Color(0xFFF59E0B),
                  ),
                  StatsCard(
                    title: 'نواقص المخزون',
                    value: lowStockCount.toString(),
                    icon: Icons.warning_amber_rounded,
                    color: const Color(0xFFEF4444),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              InkWell(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const DisbursementLogPage())),
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF4F46E5).withOpacity(0.3),
                        blurRadius: 12,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.history, color: Colors.white, size: 28),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'سجل الصرف والمرتجع',
                              style: GoogleFonts.cairo(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              'السجل المتزامن مع الموقع الإلكتروني',
                              style: GoogleFonts.cairo(
                                color: Colors.white.withOpacity(0.8),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.arrow_forward_ios, color: Colors.white, size: 16),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSettingsTab() {
    final user = AuthService().currentUser;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: const Color(0xFF4F46E5),
                  child: const Icon(Icons.person, color: Colors.white, size: 30),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.displayName ?? 'مستخدم المسؤول',
                        style: GoogleFonts.cairo(fontWeight: FontWeight.bold, fontSize: 18),
                      ),
                      Text(user?.email ?? '', style: GoogleFonts.cairo(color: Colors.grey)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        _buildSettingsItem(Icons.print, 'إعدادات الطباعة', 'تخصيص ملصقات الباركود', () => Navigator.push(context, MaterialPageRoute(builder: (context) => const LabelDesignerPage()))),
        _buildSettingsItem(Icons.inventory_outlined, 'الصرف', 'إدارة عمليات الصرف والمتابعة', () => Navigator.push(context, MaterialPageRoute(builder: (context) => const DisbursementPage()))),
        _buildSettingsItem(Icons.history, 'سجل الصرف والمرتجع (الموقع)', 'عرض السجل المتزامن مع الموقع الإلكتروني', () => Navigator.push(context, MaterialPageRoute(builder: (context) => const DisbursementLogPage()))),
        _buildSettingsItem(Icons.list_alt, 'السجل المحلي', 'عرض سجل العمليات المحلية', () => Navigator.push(context, MaterialPageRoute(builder: (context) => const SimpleDisbursementLogPage()))),
        _buildSettingsItem(Icons.bug_report, 'اختبار البيانات', 'فحص استيراد البيانات من الموقع و Firebase', () => Navigator.push(context, MaterialPageRoute(builder: (context) => const DataTestPage()))),
        _buildSettingsItem(Icons.sync, 'المزامنة السحابية', 'تحديث البيانات مع الموقع الرئيسي', () {}),
        _buildSettingsItem(Icons.language, 'اللغة والاعدادات', 'العربية - الرياض، السعودية', () {}),
        _buildSettingsItem(Icons.info_outline, 'عن التطبيق', 'نسخة V2.0.0 - ساحة المجد', () {}),
      ],
    );
  }

  Widget _buildSettingsItem(IconData icon, String title, String subtitle, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFF4F46E5)),
      title: Text(title, style: GoogleFonts.cairo(fontWeight: FontWeight.bold)),
      subtitle: Text(subtitle, style: GoogleFonts.cairo(fontSize: 12)),
      trailing: const Icon(Icons.chevron_left),
      onTap: onTap,
    );
  }

  Widget _buildFloatingActionButton() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        FloatingActionButton(
          heroTag: 'add_btn',
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (context) => const AddProductPage())),
          backgroundColor: const Color(0xFF4F46E5),
          child: const Icon(Icons.add, color: Colors.white),
        ),
      ],
    );
  }

  Stream<List<Product>> _getProductsStream() {
    if (_searchQuery.isNotEmpty) {
      return _productService.searchProducts(_searchQuery);
    } else if (_selectedCategories.contains('الكل')) {
      return _productService.getProducts();
    } else if (_selectedCategories.length == 1) {
      return _productService.getProductsByCategory(_selectedCategories.first);
    } else {
      // For multiple categories, combine multiple streams
      return _productService.getProducts().map((allProducts) {
        return allProducts.where((product) {
          return _selectedCategories.contains(product.category);
        }).toList();
      });
    }
  }

  Widget _buildViewToggle() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'عرض المنتجات',
            style: GoogleFonts.cairo(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF1F2937),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF4F46E5).withOpacity(0.2)),
            ),
            child: Row(
              children: [
                _buildViewButton(
                  icon: Icons.list,
                  label: 'قائمة',
                  isSelected: _viewMode == ViewMode.list,
                  onTap: () => setState(() => _viewMode = ViewMode.list),
                ),
                _buildViewButton(
                  icon: Icons.grid_view,
                  label: 'شبكة',
                  isSelected: _viewMode == ViewMode.grid,
                  onTap: () => setState(() => _viewMode = ViewMode.grid),
                ),
                _buildViewButton(
                  icon: Icons.table_chart,
                  label: 'جدول',
                  isSelected: _viewMode == ViewMode.table,
                  onTap: () => setState(() => _viewMode = ViewMode.table),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildViewButton({
    required IconData icon,
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF4F46E5) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 18,
              color: isSelected ? Colors.white : const Color(0xFF4F46E5),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.cairo(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isSelected ? Colors.white : const Color(0xFF4F46E5),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildView(List<Product> products) {
    switch (_viewMode) {
      case ViewMode.list:
        return _buildListView(products);
      case ViewMode.grid:
        return _buildGridView(products);
      case ViewMode.table:
        return _buildTableView(products);
    }
  }

  Widget _buildListView(List<Product> products) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: products.length,
      itemBuilder: (context, index) {
        return AnimationConfiguration.staggeredList(
          position: index,
          duration: const Duration(milliseconds: 375),
          child: SlideAnimation(
            verticalOffset: 50.0,
            child: FadeInAnimation(
              child: ProductCard(product: products[index]),
            ),
          ),
        );
      },
    );
  }

  Widget _buildGridView(List<Product> products) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: GridView.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 0.75,
        ),
        itemCount: products.length,
        itemBuilder: (context, index) {
          return _buildGridProductCard(products[index]);
        },
      ),
    );
  }

  Widget _buildGridProductCard(Product product) {
    bool isLowStock = product.quantity < 5;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => ProductDetailsPage(product: product)),
          ),
          borderRadius: BorderRadius.circular(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 3,
                child: ClipRRect(
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                  ),
                  child: Container(
                    width: double.infinity,
                    height: double.infinity,
                    color: const Color(0xFF4F46E5).withOpacity(0.05),
                    child: product.image != null
                        ? ProductImageWidget(
                            productId: product.id ?? '',
                            imagePath: product.image,
                            width: double.infinity,
                            height: double.infinity,
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(16),
                              topRight: Radius.circular(16),
                            ),
                          )
                        : Icon(
                            Icons.inventory_2,
                            color: const Color(0xFF4F46E5).withOpacity(0.3),
                            size: 40,
                          ),
                  ),
                ),
              ),
              Expanded(
                flex: 2,
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.productName,
                        style: GoogleFonts.cairo(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFF1F2937),
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        product.productCode,
                        style: GoogleFonts.cairo(
                          fontSize: 10,
                          color: Colors.grey[500],
                        ),
                      ),
                      const Spacer(),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: isLowStock ? Colors.red.withOpacity(0.1) : const Color(0xFF4F46E5).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              '${product.quantity.toInt()}',
                              style: GoogleFonts.cairo(
                                fontSize: 9,
                                color: isLowStock ? Colors.red : const Color(0xFF4F46E5),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          Text(
                            '${product.price.toStringAsFixed(0)}',
                            style: GoogleFonts.cairo(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF10B981),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTableView(List<Product> products) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        margin: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            // Table Header
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
                  Expanded(flex: 1, child: Text('صورة', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                  Expanded(flex: 2, child: Text('المنتج', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                  Expanded(flex: 1, child: Text('الكود', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                  Expanded(flex: 1, child: Text('الموقع', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                  Expanded(flex: 1, child: Text('المخزون', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                  Expanded(flex: 1, child: Text('السعر', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                  Expanded(flex: 1, child: Text('إجراءات', style: GoogleFonts.cairo(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12))),
                ],
              ),
            ),
            // Table Body
            Expanded(
              child: ListView.builder(
                itemCount: products.length,
                itemBuilder: (context, index) {
                  final product = products[index];
                  bool isLowStock = product.quantity < 5;
                  
                  return Container(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: Colors.grey[200]!),
                      ),
                    ),
                    child: Row(
                      children: [
                        // Image
                        Expanded(
                          flex: 1,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              width: 40,
                              height: 40,
                              child: ProductImageWidget(
                                productId: product.id ?? '',
                                imagePath: product.image,
                                width: 40,
                                height: 40,
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                          ),
                        ),
                        // Product Name
                        Expanded(
                          flex: 2,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                product.productName,
                                style: GoogleFonts.cairo(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: const Color(0xFF1F2937),
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                product.category,
                                style: GoogleFonts.cairo(
                                  fontSize: 10,
                                  color: Colors.grey[500],
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Product Code
                        Expanded(
                          flex: 1,
                          child: Text(
                            product.productCode,
                            style: GoogleFonts.cairo(fontSize: 11, color: const Color(0xFF6B7280)),
                          ),
                        ),
                        // Location
                        Expanded(
                          flex: 1,
                          child: Text(
                            product.location,
                            style: GoogleFonts.cairo(fontSize: 11, color: const Color(0xFF6B7280)),
                          ),
                        ),
                        // Stock
                        Expanded(
                          flex: 1,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: isLowStock ? Colors.red.withOpacity(0.1) : Colors.green.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '${product.quantity.toInt()} ${product.unit}',
                              style: GoogleFonts.cairo(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: isLowStock ? Colors.red : Colors.green,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                        // Price
                        Expanded(
                          flex: 1,
                          child: Text(
                            '${product.price.toStringAsFixed(0)} ر.س',
                            style: GoogleFonts.cairo(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF10B981),
                            ),
                          ),
                        ),
                        // Actions
                        Expanded(
                          flex: 1,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              IconButton(
                                onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (context) => ProductDetailsPage(product: product)),
                                ),
                                icon: const Icon(Icons.visibility, color: Color(0xFF4F46E5), size: 18),
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                              ),
                              IconButton(
                                onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (context) => EditProductPage(product: product)),
                                ),
                                icon: const Icon(Icons.edit, color: Color(0xFF10B981), size: 18),
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
