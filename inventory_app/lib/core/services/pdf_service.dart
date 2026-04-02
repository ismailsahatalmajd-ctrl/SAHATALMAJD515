import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/disbursement.dart';
import 'package:intl/intl.dart' as intl;
import 'package:http/http.dart' as http;

class PdfService {
  static pw.Font? _cairoBold;
  static pw.Font? _cairoRegular;

  static Future<void> _loadFonts() async {
    if (_cairoBold != null && _cairoRegular != null) return;
    
    try {
      final boldData = await rootBundle.load('assets/fonts/Cairo-Bold.ttf');
      final regularData = await rootBundle.load('assets/fonts/Cairo-Regular.ttf');
      
      _cairoBold = pw.Font.ttf(boldData);
      _cairoRegular = pw.Font.ttf(regularData);
    } catch (e) {
      print('Error loading fonts from assets: $e');
    }
  }

  static Future<pw.MemoryImage?> _fetchImage(String? url) async {
    if (url == null || url.isEmpty) return null;
    try {
      final response = await http.get(Uri.parse(url));
      if (response.statusCode == 200) {
        return pw.MemoryImage(response.bodyBytes);
      }
    } catch (e) {
      print('Error fetching image: $e');
    }
    return null;
  }

  static Future<void> printDisbursement(Disbursement item) async {
    await _loadFonts();
    final pdf = pw.Document();

    final itemImages = <String, pw.MemoryImage?>{};
    for (var i in item.items) {
      if (i.imageUrl != null) {
        itemImages[i.productId] = await _fetchImage(i.imageUrl);
      }
    }

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        theme: pw.ThemeData.withFont(
          base: _cairoRegular,
          bold: _cairoBold,
        ),
        build: (pw.Context context) {
          return [
            pw.Column(
              children: [
                pw.Directionality(
                  textDirection: pw.TextDirection.rtl,
                  child: pw.Text('فاتورة صرف منتجات / Products Issue Invoice', style: pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold)),
                ),
                pw.Directionality(
                  textDirection: pw.TextDirection.rtl,
                  child: pw.Text('مستودع ساحة المجد / Sahat Almajd Warehouse', style: pw.TextStyle(fontSize: 12)),
                ),
                pw.Container(height: 1, color: PdfColors.black, margin: const pw.EdgeInsets.symmetric(vertical: 5)),
              ],
            ),
            pw.SizedBox(height: 10),
            pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                _buildInfoBox('معلومات الفاتورة / Invoice Info', {
                  'Invoice No / رقم الفاتورة': item.operationNumber,
                  'Date / التاريخ': intl.DateFormat('yyyy/MM/dd').format(item.date),
                  'Time / الوقت': intl.DateFormat('HH:mm:ss').format(item.date),
                }, barcode: item.operationNumber),
                pw.SizedBox(width: 10),
                _buildInfoBox('معلومات الفرع / Branch Info', {
                  'Branch Name / اسم الفرع': item.branch,
                  'Products Count / عدد المنتجات': item.items.length.toString(),
                  'Order Ref / رقم الطلب': item.operationNumber,
                  'Notes / ملاحظات': item.notes ?? '-',
                }),
              ],
            ),
            pw.SizedBox(height: 20),
            pw.Table(
              border: pw.TableBorder.all(color: PdfColors.grey400),
              columnWidths: {
                0: const pw.FixedColumnWidth(25),
                1: const pw.FixedColumnWidth(50),
                2: const pw.FixedColumnWidth(80),
                3: const pw.FlexColumnWidth(),
                4: const pw.FixedColumnWidth(60),
                5: const pw.FixedColumnWidth(50),
              },
              children: [
                pw.TableRow(
                  decoration: const pw.BoxDecoration(color: PdfColors.grey100),
                  children: [
                    _tableHeader('#'),
                    _tableHeader('الصورة / Image'),
                    _tableHeader('كود المنتج / Product Code'),
                    _tableHeader('اسم المنتج / Product Name'),
                    _tableHeader('الوحدة / Unit'),
                    _tableHeader('الكمية / Qty'),
                  ],
                ),
                ...item.items.asMap().entries.map((entry) {
                  final i = entry.value;
                  final img = itemImages[i.productId];
                  return pw.TableRow(
                    children: [
                      _tableCell((entry.key + 1).toString()),
                      pw.Container(
                        height: 35,
                        alignment: pw.Alignment.center,
                        child: img != null ? pw.Image(img, fit: pw.BoxFit.contain) : pw.SizedBox(),
                      ),
                      _tableCell(i.productCode),
                      _tableCell(i.productName, align: pw.Alignment.centerLeft),
                      _tableCell(i.unit),
                      _tableCell(i.quantity.toString(), isBold: true),
                    ],
                  );
                }),
              ],
            ),
            pw.SizedBox(height: 10),
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text('عدد الأصناف / Items Count: ${item.items.length}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                pw.Text('إجمالي الكميات / Total Quantity: ${item.items.fold<double>(0, (sum, i) => sum + i.quantity)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              ],
            ),
            pw.SizedBox(height: 30),
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                _signatureBox('المرسل من المستودع'),
                _signatureBox('السائق'),
                _signatureBox('المستلم من الفرع'),
              ],
            ),
          ];
        },
      ),
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
      name: 'invoice_${item.operationNumber}.pdf',
    );
  }

  static Future<void> printAssembly(Disbursement item) async {
    await _loadFonts();
    final pdf = pw.Document();

    final itemImages = <String, pw.MemoryImage?>{};
    for (var i in item.items) {
      if (i.imageUrl != null) {
        itemImages[i.productId] = await _fetchImage(i.imageUrl);
      }
    }

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4.landscape,
        theme: pw.ThemeData.withFont(
          base: _cairoRegular,
          bold: _cairoBold,
        ),
        build: (pw.Context context) {
          return [
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text('التاريخ: ${intl.DateFormat('yyyy/MM/dd').format(item.date)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                    pw.Text('الأصناف: ${item.items.length}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                  ],
                ),
                pw.Column(
                  children: [
                    pw.Directionality(
                      textDirection: pw.TextDirection.rtl,
                      child: pw.Text('قائمة تجميع (مفصلة) - ${item.branch}', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
                    ),
                    pw.Text('Picking List', style: pw.TextStyle(fontSize: 14)),
                  ],
                ),
                pw.SizedBox(width: 80),
              ],
            ),
            pw.Divider(),
            pw.SizedBox(height: 10),
            pw.Table(
              border: pw.TableBorder.all(color: PdfColors.grey),
              columnWidths: {
                0: const pw.FixedColumnWidth(25),
                1: const pw.FixedColumnWidth(60),
                2: const pw.FixedColumnWidth(80),
                3: const pw.FlexColumnWidth(),
                4: const pw.FixedColumnWidth(70),
                5: const pw.FixedColumnWidth(40),
                6: const pw.FixedColumnWidth(80),
                7: const pw.FixedColumnWidth(30),
                8: const pw.FixedColumnWidth(30),
                9: const pw.FixedColumnWidth(30),
              },
              children: [
                pw.TableRow(
                  decoration: const pw.BoxDecoration(color: PdfColors.grey100),
                  children: [
                    _tableHeader('#'),
                    _tableHeader('صورة / Image'),
                    _tableHeader('كود / Code'),
                    _tableHeader('المنتج / Product'),
                    _tableHeader('وحدة / Unit'),
                    _tableHeader('كمية / Qty'),
                    _tableHeader('ملاحظات / Notes'),
                    _tableHeader('فعلي'),
                    _tableHeader('Pick'),
                    _tableHeader('Check'),
                  ],
                ),
                ...item.items.asMap().entries.map((entry) {
                  final i = entry.value;
                  final img = itemImages[i.productId];
                  return pw.TableRow(
                    children: [
                      _tableCell((entry.key + 1).toString()),
                      pw.Container(
                        height: 35,
                        alignment: pw.Alignment.center,
                        child: img != null ? pw.Image(img, fit: pw.BoxFit.contain) : pw.SizedBox(),
                      ),
                      _tableCell(i.productCode),
                      _tableCell(i.productName, align: pw.Alignment.centerLeft),
                      _tableCell(i.unit),
                      _tableCell(i.quantity.toString(), isBold: true),
                      _tableCell(''),
                      _tableCell(''),
                      _tableCell(''),
                      _tableCell(''),
                    ],
                  );
                }),
              ],
            ),
            pw.SizedBox(height: 15),
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.end,
              children: [
                pw.Container(
                  padding: const pw.EdgeInsets.all(5),
                  decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.black)),
                  child: pw.Text('المجموع: ${item.items.fold<double>(0, (sum, i) => sum + i.quantity)} قطعة', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                ),
              ],
            ),
            pw.SizedBox(height: 20),
            pw.Row(
              children: [
                pw.Text('المحضر: ...........................'),
                pw.SizedBox(width: 50),
                pw.Text('المراجع: ...........................'),
              ],
            ),
          ];
        },
      ),
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
      name: 'picking_${item.operationNumber}.pdf',
    );
  }

  static pw.Widget _buildInfoBox(String title, Map<String, String> data, {String? barcode}) {
    return pw.Expanded(
      child: pw.Container(
        padding: const pw.EdgeInsets.all(8),
        decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey300)),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(title, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
            pw.Divider(color: PdfColors.grey300),
            ...data.entries.map((e) => pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(e.key, style: const pw.TextStyle(fontSize: 9)),
                pw.Text(e.value, style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
              ],
            )),
            if (barcode != null) ...[
              pw.SizedBox(height: 5),
              pw.Center(
                child: pw.BarcodeWidget(
                  barcode: pw.Barcode.code128(),
                  data: barcode,
                  width: 140,
                  height: 30,
                  drawText: true,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static pw.Widget _tableHeader(String text) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(5),
      alignment: pw.Alignment.center,
      child: pw.Text(text, style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9)),
    );
  }

  static pw.Widget _tableCell(String text, {pw.Alignment align = pw.Alignment.center, bool isBold = false}) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(5),
      alignment: align,
      child: pw.Directionality(
        textDirection: pw.TextDirection.rtl,
        child: pw.Text(text, style: pw.TextStyle(fontSize: 8, fontWeight: isBold ? pw.FontWeight.bold : pw.FontWeight.normal)),
      ),
    );
  }

  static pw.Widget _signatureBox(String label) {
    return pw.Column(
      children: [
        pw.Text(label, style: const pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 25),
        pw.Container(height: 1, width: 100, color: PdfColors.grey),
        pw.Text('Name & Signature', style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey)),
      ],
    );
  }
}
