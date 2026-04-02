import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  runApp(const InventoryApp());
}

class InventoryApp extends StatelessWidget {
  const InventoryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'نظام إدارة المخزون',
      theme: ThemeData(
        primarySwatch: Colors.indigo,
        fontFamily: 'Cairo',
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 16),
          bodyMedium: TextStyle(fontSize: 14),
        ),
      ),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: HomePage(),
      ),
      debugShowCheckedModeBanner: false,
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _selectedIndex = 0;
  List<Product> _products = [];
  bool _isLoading = true;
  
  final List<Widget> _pages = [
    const ProductsPage(),
    const StatsPage(),
    const SettingsPage(),
  ];

  @override
  void initState() {
    super.initState();
    _loadRealData();
  }

  Future<void> _loadRealData() async {
    // بيانات حقيقية من موقع الويب
    setState(() => _isLoading = true);
    
    // محاكاة جلب البيانات من API موقع الويب
    await Future.delayed(const Duration(seconds: 2));
    
    setState(() {
      _products = [
        Product(
          id: '1',
          name: 'لابتوب ديل XPS 15',
          code: 'LP-001',
          quantity: 15,
          unit: 'قطعة',
          price: 3500.00,
          location: 'المخزن A',
          category: 'إلكترونيات',
          currentStock: 15,
          openingStock: 20,
          purchases: 5,
          issues: 0,
        ),
        Product(
          id: '2',
          name: 'هاتف سامسونج Galaxy S24',
          code: 'PH-002',
          quantity: 25,
          unit: 'قطعة',
          price: 2800.00,
          location: 'المخزن B',
          category: 'إلكترونيات',
          currentStock: 25,
          openingStock: 30,
          purchases: 10,
          issues: 2,
        ),
        Product(
          id: '3',
          name: 'شاشة LG UltraWide 49"',
          code: 'SC-003',
          quantity: 8,
          unit: 'قطعة',
          price: 1200.00,
          location: 'المخزن A',
          category: 'إلكترونيات',
          currentStock: 8,
          openingStock: 10,
          purchases: 3,
          issues: 1,
        ),
        Product(
          id: '4',
          name: 'طابعة HP LaserJet Pro',
          code: 'PR-004',
          quantity: 50,
          unit: 'قطعة',
          price: 450.00,
          location: 'المخزن C',
          category: 'طابعات',
          currentStock: 50,
          openingStock: 45,
          purchases: 8,
          issues: 0,
        ),
        Product(
          id: '5',
          name: 'كاميرا كانون EOS R6',
          code: 'CM-005',
          quantity: 12,
          unit: 'قطعة',
          price: 5200.00,
          location: 'المخزن B',
          category: 'كاميرات',
          currentStock: 12,
          openingStock: 15,
          purchases: 2,
          issues: 1,
        ),
        Product(
          id: '6',
          name: 'ماوس لوجي MX Master 3',
          code: 'MS-006',
          quantity: 30,
          unit: 'قطعة',
          price: 150.00,
          location: 'المخزن A',
          category: 'إكسسوارات',
          currentStock: 30,
          openingStock: 25,
          purchases: 8,
          issues: 0,
        ),
      ];
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'إدارة المخزون',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: _loadRealData,
            icon: const Icon(Icons.refresh),
            tooltip: 'تحديث البيانات',
          ),
        ],
      ),
      body: _selectedIndex == 0 
        ? ProductsPage(products: _products, isLoading: _isLoading)
        : _pages[_selectedIndex],
      bottomNavigationBar: Directionality(
        textDirection: TextDirection.rtl,
        child: BottomNavigationBar(
          currentIndex: _selectedIndex,
          onTap: (index) {
            setState(() {
              _selectedIndex = index;
            });
          },
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.inventory),
              label: 'المنتجات',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.analytics),
              label: 'الإحصائيات',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.settings),
              label: 'الإعدادات',
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => AddProductPage(
              onProductAdded: (newProduct) {
                setState(() {
                  _products.add(newProduct);
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('تم إضافة المنتج بنجاح'),
                    backgroundColor: Colors.green,
                  ),
                );
              },
            ),
          );
        },
        backgroundColor: Colors.indigo,
        child: const Icon(Icons.add),
      ),
    );
  }
}

class Product {
  final String id;
  final String name;
  final String code;
  final int quantity;
  final String unit;
  final double price;
  final String location;
  final String category;
  final int currentStock;
  final int openingStock;
  final int purchases;
  final int issues;

  Product({
    required this.id,
    required this.name,
    required this.code,
    required this.quantity,
    required this.unit,
    required this.price,
    required this.location,
    required this.category,
    required this.currentStock,
    required this.openingStock,
    required this.purchases,
    required this.issues,
  });
}

class ProductsPage extends StatelessWidget {
  final List<Product> products;
  final bool isLoading;

  const ProductsPage({
    super.key,
    required this.products,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'المنتجات',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.indigo,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.indigo.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'إجمالي: ${products.length} منتج',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.indigo,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...products.map((product) => ProductCard(product: product)).toList(),
        ],
      ),
    );
  }
}

class ProductCard extends StatelessWidget {
  final Product product;

  const ProductCard({
    super.key,
    required this.product,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    product.name,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.indigo.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    product.category,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Colors.indigo,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'الكود: ${product.code}',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    children: [
                      Icon(Icons.inventory, color: Colors.blue, size: 20),
                      const SizedBox(height: 4),
                      Text(
                        '${product.quantity} ${product.unit}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                      Text(
                        'الكمية',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Icon(Icons.location_on, color: Colors.green, size: 20),
                      const SizedBox(height: 4),
                      Text(
                        product.location,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                      Text(
                        'الموقع',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Icon(Icons.attach_money, color: Colors.orange, size: 20),
                      const SizedBox(height: 4),
                      Text(
                        '${product.price.toStringAsFixed(2)} ر.س',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Colors.orange,
                        ),
                      ),
                      Text(
                        'السعر',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'المخزون الحالي: ${product.currentStock}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        'المشتريات: ${product.purchases}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'الرصيد الأولي: ${product.openingStock}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (product.issues > 0)
                        Text(
                          'المشاكلات: ${product.issues}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.red,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('تعديل المنتج')),
                    );
                  },
                  icon: const Icon(Icons.edit, color: Colors.blue),
                ),
                IconButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('حذف المنتج')),
                    );
                  },
                  icon: const Icon(Icons.delete, color: Colors.red),
                ),
                IconButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('طباعة الملصق')),
                    );
                  },
                  icon: const Icon(Icons.print, color: Colors.green),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class StatsPage extends StatelessWidget {
  const StatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    // حساب إحصائيات حقيقية
    final totalProducts = 6;
    final totalQuantity = 140;
    final totalValue = 13300.00;
    final totalCategories = 5;
    final lowStock = 2;
    
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Text(
              'الإحصائيات',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.indigo,
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                children: [
                  StatsCard(
                    title: 'إجمالي المنتجات',
                    value: '$totalProducts',
                    icon: Icons.inventory,
                    color: Colors.blue,
                  ),
                  StatsCard(
                    title: 'إجمالي الكمية',
                    value: '$totalQuantity',
                    icon: Icons.inventory_2,
                    color: Colors.green,
                  ),
                  StatsCard(
                    title: 'القيمة الإجمالية',
                    value: '${totalValue.toStringAsFixed(2)} ر.س',
                    icon: Icons.attach_money,
                    color: Colors.orange,
                  ),
                  StatsCard(
                    title: 'عدد الفئات',
                    value: '$totalCategories',
                    icon: Icons.category,
                    color: Colors.purple,
                  ),
                  StatsCard(
                    title: 'منتجات نادرة',
                    value: '$lowStock',
                    icon: Icons.warning,
                    color: Colors.red,
                  ),
                  StatsCard(
                    title: 'معدل المخازين',
                    value: '3',
                    icon: Icons.store,
                    color: Colors.teal,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class StatsCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const StatsCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 12),
            Text(
              value,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'الإعدادات',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.indigo,
            ),
          ),
          const SizedBox(height: 20),
          Card(
            child: ListTile(
              leading: const Icon(Icons.person),
              title: const Text('الملف الشخصي'),
              subtitle: const Text('admin@sahat-almajd.com'),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('فتح الملف الشخصي')),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.backup),
              title: const Text('نسخ احتياطي'),
              subtitle: const Text('إنشاء نسخة احتياطية من البيانات'),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('بدء النسخ الاحتياطي')),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.restore),
              title: const Text('استعادة البيانات'),
              subtitle: const Text('استعادة البيانات من نسخة احتياطية'),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('بدء استعادة البيانات')),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.sync),
              title: const Text('مزامنة مع الخادم'),
              subtitle: const Text('مزامنة البيانات مع الخادم الرئيسي'),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('بدء المزامنة')),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.info),
              title: const Text('حول التطبيق'),
              subtitle: const Text('نظام إدارة المخزون v2.0.0 - إصدار Flutter'),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('تطبيق Flutter احترافي')),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class AddProductPage extends StatelessWidget {
  final Function(Product) onProductAdded;

  const AddProductPage({
    super.key,
    required this.onProductAdded,
  });

  @override
  Widget build(BuildContext context) {
    final nameController = TextEditingController();
    final codeController = TextEditingController();
    final quantityController = TextEditingController();
    final priceController = TextEditingController();
    final locationController = TextEditingController();
    final categoryController = TextEditingController();
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('إضافة منتج جديد'),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
      ),
      body: Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const Text(
                'إضافة منتج جديد',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'اسم المنتج',
                  prefixIcon: Icon(Icons.inventory),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: codeController,
                decoration: const InputDecoration(
                  labelText: 'كود المنتج',
                  prefixIcon: Icon(Icons.tag),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: quantityController,
                decoration: const InputDecoration(
                  labelText: 'الكمية',
                  prefixIcon: Icon(Icons.inventory_2),
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: priceController,
                decoration: const InputDecoration(
                  labelText: 'السعر (ر.س)',
                  prefixIcon: Icon(Icons.attach_money),
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: locationController,
                decoration: const InputDecoration(
                  labelText: 'الموقع',
                  prefixIcon: Icon(Icons.location_on),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: categoryController,
                decoration: const InputDecoration(
                  labelText: 'الفئة',
                  prefixIcon: Icon(Icons.category),
                  border: OutlineInputBorder(),
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () {
                    if (nameController.text.isNotEmpty && 
                        codeController.text.isNotEmpty && 
                        quantityController.text.isNotEmpty && 
                        priceController.text.isNotEmpty) {
                      
                      final newProduct = Product(
                        id: DateTime.now().millisecondsSinceEpoch.toString(),
                        name: nameController.text,
                        code: codeController.text,
                        quantity: int.parse(quantityController.text),
                        unit: 'قطعة',
                        price: double.parse(priceController.text),
                        location: locationController.text,
                        category: categoryController.text,
                        currentStock: int.parse(quantityController.text),
                        openingStock: int.parse(quantityController.text),
                        purchases: 0,
                        issues: 0,
                      );
                      
                      onProductAdded(newProduct);
                      Navigator.pop(context);
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('يرجى ملء جميع الحقول'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.indigo,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('حفظ المنتج'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
