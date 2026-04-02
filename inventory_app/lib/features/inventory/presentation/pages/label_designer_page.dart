import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:barcode_widget/barcode_widget.dart' as barcode_ui;
import 'package:inventory_app/core/models/product.dart';

class LabelDesignerPage extends StatefulWidget {
  final Product? product;

  const LabelDesignerPage({super.key, this.product});

  @override
  State<LabelDesignerPage> createState() => _LabelDesignerPageState();
}

class _LabelDesignerPageState extends State<LabelDesignerPage> {
  late TextEditingController _nameController;
  late TextEditingController _codeController;
  late TextEditingController _priceController;
  late TextEditingController _quantityController;
  
  double _labelWidth = 80.0;
  double _labelHeight = 50.0;
  double _fontSize = 14.0;
  bool _showBarcode = true;
  bool _showPrice = true;
  bool _showCode = true;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.product?.productName ?? 'اسم المنتج');
    _codeController = TextEditingController(text: widget.product?.productCode ?? 'PRD-001');
    _priceController = TextEditingController(text: widget.product?.price.toStringAsFixed(0) ?? '0');
    _quantityController = TextEditingController(text: widget.product?.quantity.toString() ?? '1');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _priceController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: Text('مصمم الملصقات', style: GoogleFonts.cairo(fontWeight: FontWeight.bold)),
        centerTitle: true,
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: _printLabel,
            icon: const FaIcon(FontAwesomeIcons.print, size: 20),
            color: const Color(0xFF4F46E5),
          ),
        ],
      ),
      body: Directionality(
        textDirection: TextDirection.rtl,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildPreviewSection(),
              const SizedBox(height: 32),
              _buildSettingsSection(),
              const SizedBox(height: 40),
              _buildActionButton(),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPreviewSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('معاينة الملصق', style: GoogleFonts.cairo(fontSize: 18, fontWeight: FontWeight.bold, color: const Color(0xFF1F2937))),
        const SizedBox(height: 16),
        Center(
          child: Container(
            constraints: const BoxConstraints(minHeight: 200, minWidth: double.infinity),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 20, offset: const Offset(0, 10)),
              ],
            ),
            child: Center(
              child: _buildLabelCard(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLabelCard() {
    // Scale for preview: 1mm = 3px
    double scale = 3.0;
    return Container(
      width: _labelWidth * scale,
      height: _labelHeight * scale,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey[300]!),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _nameController.text,
            style: GoogleFonts.cairo(fontSize: _fontSize, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (_showCode) ...[
            const SizedBox(height: 4),
            Text(_codeController.text, style: GoogleFonts.cairo(fontSize: _fontSize * 0.7, color: Colors.grey[600])),
          ],
          if (_showBarcode) ...[
            const Spacer(),
            SizedBox(
              height: _labelHeight * scale * 0.3,
              child: barcode_ui.BarcodeWidget(
                barcode: barcode_ui.Barcode.code128(),
                data: _codeController.text,
                drawText: false,
              ),
            ),
          ],
          if (_showPrice) ...[
            const Spacer(),
            Text('${_priceController.text} ر.س', style: GoogleFonts.cairo(fontSize: _fontSize * 0.9, fontWeight: FontWeight.bold, color: const Color(0xFF4F46E5))),
          ],
        ],
      ),
    );
  }

  Widget _buildSettingsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('بيانات المنتج', FontAwesomeIcons.fileSignature),
        const SizedBox(height: 16),
        _buildTextField(_nameController, 'اسم المنتج', FontAwesomeIcons.box),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildTextField(_codeController, 'الكود', FontAwesomeIcons.barcode)),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(_priceController, 'السعر', FontAwesomeIcons.moneyBillWave, keyboardType: TextInputType.number)),
          ],
        ),
        const SizedBox(height: 12),
        _buildTextField(_quantityController, 'الكمية لطباعتها', FontAwesomeIcons.copy, keyboardType: TextInputType.number),
        
        const SizedBox(height: 32),
        _buildSectionHeader('أبعاد الملصق (مم)', FontAwesomeIcons.rulerCombined),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _buildTextField(null, 'العرض', null, initialValue: _labelWidth.toString(), onChanged: (v) => setState(() => _labelWidth = double.tryParse(v) ?? 80), keyboardType: TextInputType.number)),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(null, 'الارتفاع', null, initialValue: _labelHeight.toString(), onChanged: (v) => setState(() => _labelHeight = double.tryParse(v) ?? 50), keyboardType: TextInputType.number)),
            const SizedBox(width: 12),
            Expanded(child: _buildTextField(null, 'حجم الخط', null, initialValue: _fontSize.toString(), onChanged: (v) => setState(() => _fontSize = double.tryParse(v) ?? 14), keyboardType: TextInputType.number)),
          ],
        ),

        const SizedBox(height: 32),
        _buildSectionHeader('خيارات العرض', FontAwesomeIcons.sliders),
        const SizedBox(height: 12),
        _buildToggleTile('عرض الباركود', _showBarcode, (v) => setState(() => _showBarcode = v)),
        _buildToggleTile('عرض السعر', _showPrice, (v) => setState(() => _showPrice = v)),
        _buildToggleTile('عرض الكود', _showCode, (v) => setState(() => _showCode = v)),
      ],
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Row(
      children: [
        FaIcon(icon, size: 16, color: const Color(0xFF4F46E5)),
        const SizedBox(width: 12),
        Text(title, style: GoogleFonts.cairo(fontSize: 16, fontWeight: FontWeight.bold, color: const Color(0xFF4F46E5))),
      ],
    );
  }

  Widget _buildTextField(TextEditingController? controller, String label, IconData? icon, {String? initialValue, Function(String)? onChanged, TextInputType? keyboardType}) {
    return TextFormField(
      controller: controller,
      initialValue: initialValue,
      onChanged: (v) {
        if (onChanged != null) onChanged(v);
        setState(() {}); // For preview update
      },
      keyboardType: keyboardType,
      style: GoogleFonts.cairo(fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.cairo(fontSize: 12, color: Colors.grey[500]),
        prefixIcon: icon != null ? Padding(padding: const EdgeInsets.all(12), child: FaIcon(icon, size: 16, color: Colors.grey[400])) : null,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  Widget _buildToggleTile(String title, bool value, Function(bool) onChanged) {
    return CheckboxListTile(
      value: value,
      onChanged: (v) => onChanged(v!),
      title: Text(title, style: GoogleFonts.cairo(fontSize: 14)),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
      activeColor: const Color(0xFF4F46E5),
      checkboxShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    );
  }

  Widget _buildActionButton() {
    return ElevatedButton.icon(
      onPressed: _printLabel,
      icon: const FaIcon(FontAwesomeIcons.print),
      label: Text('بدء الطباعة الآن', style: GoogleFonts.cairo(fontSize: 16, fontWeight: FontWeight.bold)),
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF4F46E5),
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        elevation: 0,
      ),
    );
  }

  Future<void> _printLabel() async {
    final doc = pw.Document();
    final font = await PdfGoogleFonts.cairoRegular();
    final fontBold = await PdfGoogleFonts.cairoBold();
    
    int count = int.tryParse(_quantityController.text) ?? 1;

    for (int i = 0; i < count; i++) {
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat(_labelWidth * PdfPageFormat.mm, _labelHeight * PdfPageFormat.mm),
          margin: const pw.EdgeInsets.all(5),
          build: (pw.Context context) {
            return pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Column(
                mainAxisAlignment: pw.MainAxisAlignment.center,
                children: [
                  pw.Text(
                    _nameController.text,
                    style: pw.TextStyle(font: fontBold, fontSize: _fontSize),
                    textAlign: pw.TextAlign.center,
                  ),
                  if (_showCode) ...[
                    pw.SizedBox(height: 2),
                    pw.Text(_codeController.text, style: pw.TextStyle(font: font, fontSize: _fontSize * 0.7)),
                  ],
                  if (_showBarcode) ...[
                    pw.Expanded(
                      child: pw.Center(
                        child: pw.BarcodeWidget(
                          barcode: pw.Barcode.code128(),
                          data: _codeController.text,
                          drawText: false,
                        ),
                      ),
                    ),
                  ],
                  if (_showPrice) ...[
                    pw.SizedBox(height: 2),
                    pw.Text('${_priceController.text} SAR', style: pw.TextStyle(font: fontBold, fontSize: _fontSize * 0.9)),
                  ],
                ],
              ),
            );
          },
        ),
      );
    }

    await Printing.layoutPdf(onLayout: (format) async => doc.save(), name: 'labels_${_codeController.text}.pdf');
  }
}
