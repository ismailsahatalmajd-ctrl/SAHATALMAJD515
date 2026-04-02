import 'dart:io';
import 'package:excel/excel.dart';
import 'package:path_provider/path_provider.dart';
import 'package:printing/printing.dart';
import '../models/disbursement.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:convert';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

class ExcelService {
  static Future<void> exportToOdoo(Disbursement item) async {
    final excel = Excel.createExcel();
    final sheet = excel['Sheet1'];

    // Headers
    sheet.appendRow([
      TextCellValue('External ID'),
      TextCellValue('Reference'),
      TextCellValue('Product'),
      TextCellValue('Quantity'),
      TextCellValue('Unit Price'),
      TextCellValue('Branch'),
      TextCellValue('Date'),
    ]);

    // Data
    for (final product in item.items) {
      sheet.appendRow([
        TextCellValue(item.id ?? ''),
        TextCellValue(item.operationNumber),
        TextCellValue(product.productName),
        DoubleCellValue(product.quantity.toDouble()),
        DoubleCellValue(product.unitPrice),
        TextCellValue(item.branch),
        TextCellValue(item.date.toIso8601String()),
      ]);
    }

    final bytes = excel.save();
    if (bytes == null) return;

    if (kIsWeb) {
      final base64 = base64Encode(bytes);
      final anchor = html.AnchorElement(
          href: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,$base64')
        ..setAttribute('download', 'odoo_${item.operationNumber}.xlsx')
        ..click();
    } else {
      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/odoo_${item.operationNumber}.xlsx');
      await file.writeAsBytes(bytes);
      // You could use sharing or opening logic here for mobile
    }
  }
}
