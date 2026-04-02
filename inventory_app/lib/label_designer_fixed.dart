import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:barcode_widget/barcode_widget.dart';

void main() {
  runApp(const LabelDesignerApp());
}

class LabelDesignerApp extends StatelessWidget {
  const LabelDesignerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'مصمم الملصقات',
      theme: ThemeData(
        primarySwatch: Colors.indigo,
        fontFamily: 'Cairo',
      ),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: LabelDesignerPage(),
      ),
      debugShowCheckedModeBanner: false,
    );
  }
}

class LabelDesignerPage extends StatefulWidget {
  const LabelDesignerPage({super.key});

  @override
  State<LabelDesignerPage> createState() => _LabelDesignerPageState();
}

class _LabelDesignerPageState extends State<LabelDesignerPage> {
  final TextEditingController _nameController = TextEditingController(text: 'لابتوب ديل XPS 15');
  final TextEditingController _codeController = TextEditingController(text: 'LP-001');
  final TextEditingController _priceController = TextEditingController(text: '3500.00');
  final TextEditingController _quantityController = TextEditingController(text: '15');
  
  double _labelWidth = 80.0;
  double _labelHeight = 60.0;
  double _fontSize = 12.0;
  bool _showBarcode = true;
  bool _showPrice = true;
  bool _showQuantity = true;
  bool _showCode = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('مصمم الملصقات'),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
      ),
      body: Directionality(
        textDirection: TextDirection.rtl,
        child: Row(
          children: [
            // لوحة التحكم
            Expanded(
              flex: 1,
              child: Card(
                margin: const EdgeInsets.all(16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'إعدادات الملصق',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      
                      // حقول الإدخال
                      TextField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: 'اسم المنتج',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      
                      TextField(
                        controller: _codeController,
                        decoration: const InputDecoration(
                          labelText: 'الكود',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      
                      TextField(
                        controller: _priceController,
                        decoration: const InputDecoration(
                          labelText: 'السعر (ر.س)',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                      const SizedBox(height: 12),
                      
                      TextField(
                        controller: _quantityController,
                        decoration: const InputDecoration(
                          labelText: 'الكمية',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                      const SizedBox(height: 20),
                      
                      // حجم الملصق
                      const Text('أبعاد الملصق (مم):'),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              decoration: const InputDecoration(
                                labelText: 'العرض',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                              onChanged: (value) => setState(() => _labelWidth = double.tryParse(value) ?? 80.0),
                              controller: TextEditingController(text: _labelWidth.toStringAsFixed(0)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              decoration: const InputDecoration(
                                labelText: 'الارتفاع',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                              onChanged: (value) => setState(() => _labelHeight = double.tryParse(value) ?? 60.0),
                              controller: TextEditingController(text: _labelHeight.toStringAsFixed(0)),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      
                      // حجم الخط
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'حجم الخط',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.number,
                        onChanged: (value) => setState(() => _fontSize = double.tryParse(value) ?? 12.0),
                        controller: TextEditingController(text: _fontSize.toStringAsFixed(0)),
                      ),
                      const SizedBox(height: 20),
                      
                      // خيارات العرض
                      const Text('خيارات العرض:'),
                      CheckboxListTile(
                        title: const Text('عرض الباركود'),
                        value: _showBarcode,
                        onChanged: (value) => setState(() => _showBarcode = value ?? true),
                      ),
                      CheckboxListTile(
                        title: const Text('عرض السعر'),
                        value: _showPrice,
                        onChanged: (value) => setState(() => _showPrice = value ?? true),
                      ),
                      CheckboxListTile(
                        title: const Text('عرض الكمية'),
                        value: _showQuantity,
                        onChanged: (value) => setState(() => _showQuantity = value ?? true),
                      ),
                      CheckboxListTile(
                        title: const Text('عرض الكود'),
                        value: _showCode,
                        onChanged: (value) => setState(() => _showCode = value ?? true),
                      ),
                      
                      const Spacer(),
                      
                      // أزرار الطباعة
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _printLabel,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.indigo,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.all(16),
                          ),
                          child: const Text('طباعة الملصق'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _printMultipleLabels,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.all(16),
                          ),
                          child: const Text('طباعة ملصقات متعددة'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            
            // معاينة الملصق
            Expanded(
              flex: 1,
              child: Card(
                margin: const EdgeInsets.all(16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      const Text(
                        'معاينة الملصق',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: Center(
                          child: Container(
                            width: _labelWidth * 3, // تكبير للمعاينة
                            height: _labelHeight * 3,
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey),
                              borderRadius: BorderRadius.circular(8),
                              color: Colors.white,
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: _buildLabelContent(scale: 3.0),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabelContent({double scale = 1.0}) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // اسم المنتج مع معالجة النص
          Flexible(
            child: Text(
              _nameController.text,
              style: TextStyle(
                fontSize: _fontSize * scale,
                fontWeight: FontWeight.bold,
                height: 1.2, // مسافة بين السطور
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
            ),
          ),
          
          SizedBox(height: 4 * scale),
          
          // الكود والسعر والكمية في سطر واحد
          if (_showCode || _showPrice || _showQuantity)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (_showCode)
                  Flexible(
                    child: Text(
                      'كود: ${_codeController.text}',
                      style: TextStyle(
                        fontSize: (_fontSize - 2) * scale,
                        color: Colors.grey[600],
                      ),
                    ),
                  ),
                if (_showPrice)
                  Flexible(
                    child: Text(
                      '${_priceController.text} ر.س',
                      style: TextStyle(
                        fontSize: (_fontSize - 2) * scale,
                        fontWeight: FontWeight.bold,
                        color: Colors.green[700],
                      ),
                    ),
                  ),
                if (_showQuantity)
                  Flexible(
                    child: Text(
                      'الكمية: ${_quantityController.text}',
                      style: TextStyle(
                        fontSize: (_fontSize - 2) * scale,
                        color: Colors.blue[700],
                      ),
                    ),
                  ),
              ],
            ),
          
          if (_showBarcode) ...[
            SizedBox(height: 8 * scale),
            Expanded(
              child: Center(
                child: BarcodeWidget(
                  barcode: Barcode.code128(),
                  data: _codeController.text,
                  width: _labelWidth * 0.8 * scale,
                  height: _labelHeight * 0.3 * scale,
                  style: const TextStyle(fontSize: 8),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _printLabel() async {
    try {
      final pdf = pw.Document();
      
      // استخدام خط افتراضي للطباعة
      final arabicFont = pw.Font.cairo();
      
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat(_labelWidth * PdfPageFormat.mm, _labelHeight * PdfPageFormat.mm),
          margin: const pw.EdgeInsets.all(2),
          build: (pw.Context context) {
            return pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Container(
                padding: const pw.EdgeInsets.all(2),
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: PdfColors.grey300),
                  borderRadius: pw.BorderRadius.circular(2),
                ),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  mainAxisSize: pw.MainAxisSize.min,
                  children: [
                    // اسم المنتج مع معالجة النص
                    pw.Text(
                      _nameController.text,
                      style: pw.TextStyle(
                        font: arabicFont,
                        fontSize: _fontSize,
                        fontWeight: pw.FontWeight.bold,
                        lineSpacing: 1.2,
                      ),
                      maxLines: 2,
                      textAlign: pw.TextAlign.right,
                    ),
                    
                    pw.SizedBox(height: 2),
                    
                    // الكود والسعر والكمية
                    if (_showCode || _showPrice || _showQuantity)
                      pw.Row(
                        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                        children: [
                          if (_showCode)
                            pw.Expanded(
                              child: pw.Text(
                                'كود: ${_codeController.text}',
                                style: pw.TextStyle(
                                  font: arabicFont,
                                  fontSize: _fontSize - 2,
                                  color: PdfColors.grey600,
                                ),
                              ),
                            ),
                          if (_showPrice)
                            pw.Expanded(
                              child: pw.Text(
                                '${_priceController.text} ر.س',
                                style: pw.TextStyle(
                                  font: arabicFont,
                                  fontSize: _fontSize - 2,
                                  fontWeight: pw.FontWeight.bold,
                                  color: PdfColors.green700,
                                ),
                                textAlign: pw.TextAlign.center,
                              ),
                            ),
                          if (_showQuantity)
                            pw.Expanded(
                              child: pw.Text(
                                'الكمية: ${_quantityController.text}',
                                style: pw.TextStyle(
                                  font: arabicFont,
                                  fontSize: _fontSize - 2,
                                  color: PdfColors.blue700,
                                ),
                                textAlign: pw.TextAlign.left,
                              ),
                            ),
                        ],
                      ),
                    
                    if (_showBarcode) ...[
                      pw.SizedBox(height: 4),
                      pw.Expanded(
                        child: pw.Center(
                          child: pw.BarcodeWidget(
                            barcode: pw.Barcode.code128(),
                            data: _codeController.text,
                            width: _labelWidth * 0.8,
                            height: _labelHeight * 0.3,
                            textStyle: pw.TextStyle(
                              font: arabicFont,
                              fontSize: 6,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      );

      await Printing.layoutPdf(
        onLayout: (PdfPageFormat format) async => pdf.save(),
        name: 'ملصق_${_codeController.text}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('خطأ في الطباعة: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _printMultipleLabels() async {
    try {
      final quantity = int.tryParse(_quantityController.text) ?? 1;
      final pdf = pw.Document();
      
      // استخدام خط افتراضي للطباعة
      final arabicFont = pw.Font.cairo();
      
      for (int i = 0; i < quantity; i++) {
        pdf.addPage(
          pw.Page(
            pageFormat: PdfPageFormat(_labelWidth * PdfPageFormat.mm, _labelHeight * PdfPageFormat.mm),
            margin: const pw.EdgeInsets.all(2),
            build: (pw.Context context) {
              return pw.Directionality(
                textDirection: pw.TextDirection.rtl,
                child: pw.Container(
                  padding: const pw.EdgeInsets.all(2),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.grey300),
                    borderRadius: pw.BorderRadius.circular(2),
                  ),
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    mainAxisSize: pw.MainAxisSize.min,
                    children: [
                      // اسم المنتج
                      pw.Text(
                        _nameController.text,
                        style: pw.TextStyle(
                          font: arabicFont,
                          fontSize: _fontSize,
                          fontWeight: pw.FontWeight.bold,
                          lineSpacing: 1.2,
                        ),
                        maxLines: 2,
                        textAlign: pw.TextAlign.right,
                      ),
                      
                      pw.SizedBox(height: 2),
                      
                      // الكود والسعر والكمية
                      if (_showCode || _showPrice || _showQuantity)
                        pw.Row(
                          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                          children: [
                            if (_showCode)
                              pw.Expanded(
                                child: pw.Text(
                                  'كود: ${_codeController.text}',
                                  style: pw.TextStyle(
                                    font: arabicFont,
                                    fontSize: _fontSize - 2,
                                    color: PdfColors.grey600,
                                  ),
                                ),
                              ),
                            if (_showPrice)
                              pw.Expanded(
                                child: pw.Text(
                                  '${_priceController.text} ر.س',
                                  style: pw.TextStyle(
                                    font: arabicFont,
                                    fontSize: _fontSize - 2,
                                    fontWeight: pw.FontWeight.bold,
                                    color: PdfColors.green700,
                                  ),
                                  textAlign: pw.TextAlign.center,
                                ),
                              ),
                            if (_showQuantity)
                              pw.Expanded(
                                child: pw.Text(
                                  'الكمية: ${_quantityController.text}',
                                  style: pw.TextStyle(
                                    font: arabicFont,
                                    fontSize: _fontSize - 2,
                                    color: PdfColors.blue700,
                                  ),
                                  textAlign: pw.TextAlign.left,
                                ),
                              ),
                          ],
                        ),
                      
                      if (_showBarcode) ...[
                        pw.SizedBox(height: 4),
                        pw.Expanded(
                          child: pw.Center(
                            child: pw.BarcodeWidget(
                              barcode: pw.Barcode.code128(),
                              data: _codeController.text,
                              width: _labelWidth * 0.8,
                              height: _labelHeight * 0.3,
                              textStyle: pw.TextStyle(
                                font: arabicFont,
                                fontSize: 6,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        );
      }

      await Printing.layoutPdf(
        onLayout: (PdfPageFormat format) async => pdf.save(),
        name: 'ملصقات_${_codeController.text}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('خطأ في الطباعة: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
