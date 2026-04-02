import 'dart:io';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:inventory_app/core/models/product.dart';
import 'package:inventory_app/core/services/product_service.dart';
import 'package:inventory_app/features/inventory/presentation/widgets/product_image_widget.dart';

class EditProductPage extends StatefulWidget {
  final Product product;

  const EditProductPage({super.key, required this.product});

  @override
  State<EditProductPage> createState() => _EditProductPageState();
}

class _EditProductPageState extends State<EditProductPage> {
  final _formKey = GlobalKey<FormState>();
  final _productService = ProductService();

  late final TextEditingController _productCodeController;
  late final TextEditingController _itemNumberController;
  late final TextEditingController _locationController;
  late final TextEditingController _productNameController;
  late final TextEditingController _quantityController;
  late final TextEditingController _priceController;

  final ImagePicker _imagePicker = ImagePicker();
  String? _selectedImage;
  bool _isLoading = false;

  final List<String> _units = ['قطعة', 'كيلوجرام', 'لتر', 'متر', 'صندوق', 'كرتونة', 'غير ذلك'];
  final List<String> _categories = ['إلكترونيات', 'أثاث', 'أدوات', 'ملابس', 'مكتبية', 'أخرى'];
  late String _selectedUnit;
  late String _selectedCategory;

  @override
  void initState() {
    super.initState();
    _productCodeController = TextEditingController(text: widget.product.productCode);
    _itemNumberController = TextEditingController(text: widget.product.itemNumber);
    _locationController = TextEditingController(text: widget.product.location);
    _productNameController = TextEditingController(text: widget.product.productName);
    _quantityController = TextEditingController(text: widget.product.quantity.toString());
    _priceController = TextEditingController(text: widget.product.price.toStringAsFixed(0));
    
    _selectedUnit = widget.product.unit;
    _selectedCategory = widget.product.category;
  }

  @override
  void dispose() {
    _productCodeController.dispose();
    _itemNumberController.dispose();
    _locationController.dispose();
    _productNameController.dispose();
    _quantityController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    try {
      final XFile? image = await _imagePicker.pickImage(source: ImageSource.gallery);
      if (image != null) setState(() => _selectedImage = image.path);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('خطأ: $e')));
    }
  }

  Future<void> _updateProduct() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    try {
      String? imageUrl = widget.product.image;
      if (_selectedImage != null) {
        final fileName = 'prod_${DateTime.now().millisecondsSinceEpoch}';
        imageUrl = await _productService.uploadImage(_selectedImage!, fileName);
      }

      final updatedProduct = widget.product.copyWith(
        productCode: _productCodeController.text.trim(),
        itemNumber: _itemNumberController.text.trim(),
        location: _locationController.text.trim(),
        productName: _productNameController.text.trim(),
        quantity: double.tryParse(_quantityController.text) ?? 0.0,
        unit: _selectedUnit,
        price: double.parse(_priceController.text),
        category: _selectedCategory,
        image: imageUrl,
        updatedAt: DateTime.now(),
      );

      await _productService.updateProduct(widget.product.id!, updatedProduct);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('تم تحديث البيانات بنجاح', style: GoogleFonts.cairo()),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
        Navigator.pop(context); // Pop details page to refresh
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('خطأ: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: Text('تعديل بيانات المنتج', style: GoogleFonts.cairo(fontWeight: FontWeight.bold)),
        centerTitle: true,
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildImagePicker(),
                const SizedBox(height: 32),
                _buildSectionTitle('المعلومات الأساسية'),
                const SizedBox(height: 16),
                _buildTextField(_productNameController, 'اسم المنتج', FontAwesomeIcons.box, validator: (v) => v!.isEmpty ? 'مطلوب' : null),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _buildTextField(_productCodeController, 'كود المنتج', FontAwesomeIcons.barcode, validator: (v) => v!.isEmpty ? 'مطلوب' : null)),
                    const SizedBox(width: 12),
                    Expanded(child: _buildTextField(_itemNumberController, 'الرقم الداخلي', FontAwesomeIcons.hashtag, validator: (v) => v!.isEmpty ? 'مطلوب' : null)),
                  ],
                ),
                const SizedBox(height: 16),
                _buildDropdownField<String>('الفئة', _selectedCategory, _categories, (v) => setState(() => _selectedCategory = v!)),
                
                const SizedBox(height: 32),
                _buildSectionTitle('المخزون والسعر'),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _buildTextField(_quantityController, 'الكمية الحالية', FontAwesomeIcons.cubes, keyboardType: TextInputType.number, validator: (v) => v!.isEmpty ? 'مطلوب' : null)),
                    const SizedBox(width: 12),
                    Expanded(child: _buildDropdownField<String>('الوحدة', _selectedUnit, _units, (v) => setState(() => _selectedUnit = v!))),
                  ],
                ),
                const SizedBox(height: 16),
                _buildTextField(_locationController, 'موقع التخزين', FontAwesomeIcons.locationDot, validator: (v) => v!.isEmpty ? 'مطلوب' : null),
                const SizedBox(height: 16),
                _buildTextField(_priceController, 'السعر (ر.س)', FontAwesomeIcons.handHoldingDollar, keyboardType: TextInputType.number, validator: (v) => v!.isEmpty ? 'مطلوب' : null),
                
                const SizedBox(height: 48),
                _buildSaveButton(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: GoogleFonts.cairo(fontSize: 18, fontWeight: FontWeight.bold, color: const Color(0xFF4F46E5)),
    );
  }

  Widget _buildImagePicker() {
    return Center(
      child: GestureDetector(
        onTap: _pickImage,
        child: Container(
          width: double.infinity,
          height: 120,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFF4F46E5).withOpacity(0.1), width: 2),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: _selectedImage != null
              ? ClipRRect(borderRadius: BorderRadius.circular(24), child: Image.file(File(_selectedImage!), fit: BoxFit.contain))
              : Stack(
                  children: [
                    ProductImageWidget(
                      productId: widget.product.id ?? '',
                      imagePath: widget.product.image,
                      width: double.infinity,
                      height: 120,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    Positioned(
                      bottom: 12,
                      right: 12,
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF4F46E5),
                          shape: BoxShape.circle,
                        ),
                        child: const FaIcon(FontAwesomeIcons.camera, size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, IconData icon, {TextInputType? keyboardType, String? Function(String?)? validator}) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      validator: validator,
      style: GoogleFonts.cairo(fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.cairo(color: Colors.grey[500], fontSize: 13),
        prefixIcon: Padding(padding: const EdgeInsets.all(12), child: FaIcon(icon, size: 18, color: const Color(0xFF4F46E5))),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
      ),
    );
  }

  Widget _buildDropdownField<T>(String label, T value, List<T> items, ValueChanged<T?> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: DropdownButtonHideUnderline(
        child: DropdownButtonFormField<T>(
          value: value,
          onChanged: onChanged,
          decoration: InputDecoration(labelText: label, labelStyle: GoogleFonts.cairo(fontSize: 13), border: InputBorder.none),
          items: items.map((i) => DropdownMenuItem<T>(value: i, child: Text(i.toString(), style: GoogleFonts.cairo(fontSize: 14)))).toList(),
        ),
      ),
    );
  }

  Widget _buildSaveButton() {
    return ElevatedButton(
      onPressed: _isLoading ? null : _updateProduct,
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF4F46E5),
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        elevation: 0,
      ),
      child: _isLoading
          ? const CircularProgressIndicator(color: Colors.white)
          : Text('حفظ التعديلات', style: GoogleFonts.cairo(fontSize: 18, fontWeight: FontWeight.bold)),
    );
  }
}
