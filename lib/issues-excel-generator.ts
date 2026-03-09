import * as ExcelJS from 'exceljs';
import type { Issue, IssueProduct, Product } from './types';
import { formatArabicGregorianDateTime } from './utils';

/**
 * Generates Excel files for Warehouse Issues (المصروفات)
 */

interface ExportOptions {
    startDate?: string;
    endDate?: string;
}

/**
 * Report 1: Merged (المدمج)
 * Columns: sequence, product code, product name, unit, category, qty, price, total, stock before, stock after.
 * With total at bottom.
 */
export async function exportMergedIssuesExcel(issues: Issue[], products: Product[], options?: ExportOptions) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('المصروفات المدمجة');

    // Right to Left
    worksheet.views = [{ rightToLeft: true }];

    // Header Row
    const headers = [
        'م',
        'كود المنتج',
        'رقم المنتج',
        'اسم المنتج',
        'الوحدة',
        'التصنيف',
        'الكمية',
        'سعر الوحدة',
        'الإجمالي',
        'المخزون قبل',
        'المخزون بعد',
        'الفرع',
        'التاريخ'
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = { horizontal: 'center' };

    let rowIndex = 1;
    let grandTotal = 0;

    // We need to flatten the issues to individual product lines
    issues.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).forEach(issue => {
        issue.products.forEach(ip => {
            const product = products.find(p => p.id === ip.productId);
            const stockBefore = Number(ip.currentStock || (product?.currentStock || 0) + ip.quantity);
            const stockAfter = stockBefore - ip.quantity;
            const total = ip.totalPrice || (ip.quantity * ip.unitPrice);
            grandTotal += total;

            const rowData = [
                rowIndex++,
                ip.productCode || product?.productCode || '',
                product?.itemNumber || '',
                ip.productName || product?.productName || '',
                ip.unit || product?.unit || 'قطعة',
                product?.category || '',
                ip.quantity,
                ip.unitPrice,
                total,
                stockBefore,
                stockAfter,
                issue.branchName,
                formatArabicGregorianDateTime(new Date(issue.createdAt))
            ];
            worksheet.addRow(rowData);
        });
    });

    // Grand Total Row
    worksheet.addRow([]);
    const totalRow = worksheet.addRow([
        '', '', '', '', '', '', '', 'إجمالي القيمة:', grandTotal
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(9).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow
    };

    // Auto-fit columns (simplified)
    worksheet.columns.forEach(column => {
        column.width = 15;
        if (column.number === 4) column.width = 30; // Name
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(buffer, `مصروفات_مدمجة_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Report 2: Detailed by Branch (مفصل حسب كل فرع)
 * Each branch gets a sheet.
 */
export async function exportDetailedBranchesExcel(issues: Issue[], products: Product[]) {
    const workbook = new ExcelJS.Workbook();
    const branchMap = new Map<string, Issue[]>();

    issues.forEach(issue => {
        const list = branchMap.get(issue.branchName) || [];
        list.push(issue);
        branchMap.set(issue.branchName, list);
    });

    for (const [branchName, branchIssues] of branchMap.entries()) {
        const safeName = branchName.slice(0, 31).replace(/[\\\/\?\*\[\]]/g, '');
        const worksheet = workbook.addWorksheet(safeName || 'Branch');
        worksheet.views = [{ rightToLeft: true }];

        const headers = ['م', 'كود المنتج', 'اسم المنتج', 'الكمية', 'السعر', 'الإجمالي', 'التاريخ'];
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };

        let idx = 1;
        let branchTotal = 0;

        branchIssues.forEach(issue => {
            issue.products.forEach(ip => {
                const total = ip.totalPrice || (ip.quantity * ip.unitPrice);
                branchTotal += total;
                worksheet.addRow([
                    idx++,
                    ip.productCode,
                    ip.productName,
                    ip.quantity,
                    ip.unitPrice,
                    total,
                    formatArabicGregorianDateTime(new Date(issue.createdAt))
                ]);
            });
        });

        worksheet.addRow([]);
        worksheet.addRow(['', '', '', '', 'إجمالي الفرع:', branchTotal]).font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(buffer, `مصروفات_مفصلة_فروع_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Report 3: Matrix (اسم المنتج + أعمدة باسماء الفروع)
 */
export async function exportMatrixIssuesExcel(issues: Issue[], products: Product[]) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('مصفوفة المصروفات');
    worksheet.views = [{ rightToLeft: true }];

    const branchNames = Array.from(new Set(issues.map(i => i.branchName))).sort();
    const productMap = new Map<string, { [branchSelector: string]: number }>();

    issues.forEach(issue => {
        issue.products.forEach(ip => {
            const counts = productMap.get(ip.productName) || {};
            counts[issue.branchName] = (counts[issue.branchName] || 0) + ip.quantity;
            productMap.set(ip.productName, counts);
        });
    });

    // Headers: [Name, Branch1, Branch2, ...]
    const headers = ['اسم المنتج', ...branchNames];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };

    for (const [productName, counts] of productMap.entries()) {
        const row: (string | number)[] = [productName];
        branchNames.forEach(bn => {
            row.push(counts[bn] || 0);
        });
        worksheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(buffer, `مصفوفة_المصروفات_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function saveAsExcel(buffer: ExcelJS.Buffer, filename: string) {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
