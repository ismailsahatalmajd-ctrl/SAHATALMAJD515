import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:inventory_app/features/inventory/presentation/widgets/product_image_widget.dart';
import 'package:inventory_app/core/models/product.dart';
import '../pages/product_details_page.dart';
import '../pages/edit_product_page.dart';
import '../pages/label_designer_page.dart';

class ProductCard extends StatelessWidget {
  final Product product;

  const ProductCard({
    super.key,
    required this.product,
  });

  @override
  Widget build(BuildContext context) {
    bool isLowStock = product.quantity < 5;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
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
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => ProductDetailsPage(product: product)),
          ),
          borderRadius: BorderRadius.circular(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProductImageWidget(
                productId: product.id ?? '',
                imagePath: product.image,
                width: double.infinity,
                height: 120,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: _getCategoryColor(product.category).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            product.category,
                            style: GoogleFonts.cairo(
                              fontSize: 10,
                              color: _getCategoryColor(product.category),
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        if (isLowStock)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.red.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              'مخزون منخفض',
                              style: GoogleFonts.cairo(
                                fontSize: 10,
                                color: Colors.red,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      product.productName,
                      style: GoogleFonts.cairo(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: const Color(0xFF1F2937),
                        height: 1.2,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      'SKU: ${product.productCode}',
                      style: GoogleFonts.cairo(
                        fontSize: 12,
                        color: Colors.grey[500],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildQuickInfo(
                          FontAwesomeIcons.cubes,
                          'الكمية',
                          '${product.quantity % 1 == 0 ? product.quantity.toInt() : product.quantity} ${product.unit}',
                          isLowStock ? Colors.red : const Color(0xFF4F46E5),
                        ),
                        _buildQuickInfo(
                          FontAwesomeIcons.locationDot,
                          'الموقع',
                          product.location,
                          const Color(0xFF10B981),
                        ),
                        _buildQuickInfo(
                          FontAwesomeIcons.tag,
                          'السعر',
                          '${product.price.toStringAsFixed(0)} ر.س',
                          const Color(0xFFF59E0B),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  _buildActionButton(
                    context,
                    FontAwesomeIcons.penToSquare,
                    'تعديل',
                    const Color(0xFF4F46E5),
                    () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => EditProductPage(product: product)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  _buildActionButton(
                    context,
                    FontAwesomeIcons.print,
                    'ملصق',
                    const Color(0xFF10B981),
                    () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (context) => LabelDesignerPage(product: product)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionButton(BuildContext context, IconData icon, String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            FaIcon(icon, size: 12, color: color),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.cairo(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickInfo(IconData icon, String label, String value, Color color) {
    return Column(
      children: [
        FaIcon(icon, size: 16, color: color),
        const SizedBox(height: 6),
        Text(
          value,
          style: GoogleFonts.cairo(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: const Color(0xFF374151),
          ),
        ),
        Text(
          label,
          style: GoogleFonts.cairo(
            fontSize: 10,
            color: Colors.grey[500],
          ),
        ),
      ],
    );
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'إلكترونيات': return Colors.blue;
      case 'أثاث': return Colors.brown;
      case 'أدوات': return Colors.orange;
      default: return const Color(0xFF4F46E5);
    }
  }
}
