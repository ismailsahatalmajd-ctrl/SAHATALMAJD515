import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui_web' as ui;
import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shimmer/shimmer.dart';

class ProductImageWidget extends StatelessWidget {
  final String productId;
  final String? imagePath;
  final double? width;
  final double? height;
  final double size;
  final BoxFit fit;
  final BorderRadius? borderRadius;

  const ProductImageWidget({
    super.key,
    required this.productId,
    this.imagePath,
    this.width,
    this.height,
    this.size = 80,
    this.fit = BoxFit.contain,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final double dispWidth = width ?? size;
    final double dispHeight = height ?? size;

    // If no image info at all
    if (imagePath == null || imagePath!.isEmpty) {
      return _buildPlaceholder(dispWidth, dispHeight);
    }

    // CASE 1: Standard URL (Firebase Storage or external) - WEB FIX FOR CORS
    if (imagePath!.startsWith('http')) {
      final String viewID = 'img-${productId}-${imagePath.hashCode}';
      
      // تسجيل العنصر في المتصفح لعرضه مباشرة بدون قيود CORS
      // ignore: undefined_prefixed_name
      ui.platformViewRegistry.registerViewFactory(viewID, (int viewId) {
        return html.ImageElement()
          ..src = imagePath!
          ..style.width = '100%'
          ..style.height = '100%'
          ..style.objectFit = 'contain'
          ..style.borderRadius = 'inherit';
      });

      return ClipRRect(
        borderRadius: borderRadius ?? BorderRadius.circular(12),
        child: SizedBox(
          width: dispWidth,
          height: dispHeight,
          child: HtmlElementView(viewType: viewID),
        ),
      );
    }

    // CASE 2: Fetch from separate collection (Large legacy images)
    if (imagePath == 'DB_IMAGE') {
      return FutureBuilder<DocumentSnapshot>(
        future: FirebaseFirestore.instance.collection('product_images').doc(productId).get(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) return _buildShimmer(dispWidth, dispHeight);
          if (snapshot.hasError || !snapshot.hasData || !snapshot.data!.exists) return _buildPlaceholder(dispWidth, dispHeight);

          final data = snapshot.data!.data() as Map<String, dynamic>?;
          final base64String = data?['data'] as String?;
          if (base64String == null || base64String.isEmpty) return _buildPlaceholder(dispWidth, dispHeight);

          return _buildBase64Image(base64String, dispWidth, dispHeight);
        },
      );
    }

    // CASE 3: Embedded Base64 (Legacy small images directly in product doc)
    if (imagePath!.startsWith('data:image') || (imagePath!.length > 100)) {
      return _buildBase64Image(imagePath!, dispWidth, dispHeight);
    }

    return _buildPlaceholder(dispWidth, dispHeight);
  }

  Widget _buildBase64Image(String base64String, double w, double h) {
    try {
      final cleanBase64 = base64String.contains(',') 
          ? base64String.split(',').last 
          : base64String;
      final Uint8List bytes = base64.decode(cleanBase64.trim());

      return ClipRRect(
        borderRadius: borderRadius ?? BorderRadius.circular(12),
        child: Image.memory(
          bytes,
          width: w,
          height: h,
          fit: fit,
          errorBuilder: (context, error, stackTrace) => _buildPlaceholder(w, h, icon: Icons.broken_image),
        ),
      );
    } catch (e) {
      return _buildPlaceholder(w, h, icon: Icons.broken_image);
    }
  }

  Widget _buildPlaceholder(double w, double h, {IconData icon = FontAwesomeIcons.image}) {
    return Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: const Color(0xFF4F46E5).withOpacity(0.05),
        borderRadius: borderRadius ?? BorderRadius.circular(12),
      ),
      child: Center(
        child: FaIcon(icon, color: const Color(0xFF4F46E5), size: (w < h ? w : h) * 0.4),
      ),
    );
  }

  Widget _buildShimmer(double w, double h) {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: borderRadius ?? BorderRadius.circular(12),
        ),
      ),
    );
  }
}
