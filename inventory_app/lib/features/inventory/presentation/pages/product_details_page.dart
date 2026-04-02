import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:inventory_app/core/models/product.dart';
import '../pages/edit_product_page.dart';
import '../pages/label_designer_page.dart';

class ProductDetailsPage extends StatelessWidget {
  final Product product;

  const ProductDetailsPage({
    super.key,
    required this.product,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: CustomScrollView(
        slivers: [
          _buildSliverAppBar(context),
          SliverToBoxAdapter(
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                product.productName,
                                style: GoogleFonts.cairo(
                                  fontSize: 26,
                                  fontWeight: FontWeight.bold,
                                  color: const Color(0xFF1F2937),
                                ),
                              ),
                              Text(
                                'SKU: ${product.productCode}',
                                style: GoogleFonts.cairo(
                                  fontSize: 14,
                                  color: Colors.grey[500],
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        _buildCategoryBadge(),
                      ],
                    ),
                    const SizedBox(height: 32),
                    _buildStatsRow(),
                    const SizedBox(height: 32),
                    _buildInfoSection('تفاصيل التخزين', [
                      _buildInfoTile(FontAwesomeIcons.locationDot, 'الموقع', product.location),
                      _buildInfoTile(FontAwesomeIcons.hashtag, 'الرقم الداخلي', product.itemNumber),
                      _buildInfoTile(FontAwesomeIcons.calendarDay, 'تاريخ الإضافة', '${product.createdAt.day}/${product.createdAt.month}/${product.createdAt.year}'),
                    ]),
                    const SizedBox(height: 32),
                    _buildActionButtons(context),
                    const SizedBox(height: 40),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSliverAppBar(BuildContext context) {
    return SliverAppBar(
      expandedHeight: 160,
      pinned: true,
      backgroundColor: const Color(0xFF4F46E5),
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            if (product.image != null)
              Image.network(
                product.image!, 
                fit: BoxFit.contain,
                width: double.infinity,
                height: 160,
                errorBuilder: (context, error, stackTrace) => Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Center(
                    child: FaIcon(
                      FontAwesomeIcons.boxOpen,
                      size: 50,
                      color: Colors.white.withOpacity(0.5),
                    ),
                  ),
                ),
              )
            else
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Center(
                  child: FaIcon(
                    FontAwesomeIcons.boxOpen,
                    size: 80,
                    color: Colors.white.withOpacity(0.5),
                  ),
                ),
              ),
            // Gradient Overlay
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.3),
                    Colors.transparent,
                    Colors.black.withOpacity(0.2),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      actions: [
        IconButton(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => EditProductPage(product: product)),
          ),
          icon: const FaIcon(FontAwesomeIcons.penToSquare, color: Colors.white, size: 20),
        ),
      ],
    );
  }

  Widget _buildCategoryBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF4F46E5).withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        product.category,
        style: GoogleFonts.cairo(
          color: const Color(0xFF4F46E5),
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
      ),
    );
  }

  Widget _buildStatsRow() {
    return Row(
      children: [
        _buildStatCard('الكمية', '${product.quantity}', product.unit, Colors.blue),
        const SizedBox(width: 12),
        _buildStatCard('السعر', '${product.price.toStringAsFixed(0)}', 'ر.س', Colors.green),
        const SizedBox(width: 12),
        _buildStatCard('الإجمالي', '${(product.quantity * product.price).toStringAsFixed(0)}', 'ر.س', Colors.orange),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, String sub, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.1)),
        ),
        child: Column(
          children: [
            Text(label, style: GoogleFonts.cairo(fontSize: 10, color: Colors.grey[600])),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(value, style: GoogleFonts.cairo(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
                const SizedBox(width: 4),
                Text(sub, style: GoogleFonts.cairo(fontSize: 10, fontWeight: FontWeight.bold, color: color)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GoogleFonts.cairo(fontSize: 18, fontWeight: FontWeight.bold, color: const Color(0xFF1F2937)),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFF9FAFB),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _buildInfoTile(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: FaIcon(icon, size: 16, color: const Color(0xFF4F46E5)),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: GoogleFonts.cairo(fontSize: 11, color: Colors.grey[500])),
              Text(value, style: GoogleFonts.cairo(fontSize: 14, fontWeight: FontWeight.bold, color: const Color(0xFF374151))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => LabelDesignerPage(product: product),
                ),
              );
            },
            icon: const FaIcon(FontAwesomeIcons.print, size: 18),
            label: Text('طباعة الملصق', style: GoogleFonts.cairo(fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 56),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              elevation: 0,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Container(
          height: 56,
          width: 56,
          decoration: BoxDecoration(
            color: const Color(0xFFF3F4F6),
            borderRadius: BorderRadius.circular(16),
          ),
          child: IconButton(
            onPressed: () {},
            icon: const FaIcon(FontAwesomeIcons.shareNodes, size: 20, color: Color(0xFF4B5563)),
          ),
        ),
      ],
    );
  }
}
