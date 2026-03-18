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
        'م / #',
        'كود المنتج / Product Code',
        'رقم المنتج / Item Number',
        'اسم المنتج / Product Name',
        'الوحدة / Unit',
        'التصنيف / Category',
        'الكمية / Qty',
        'سعر الوحدة / Unit Price',
        'الإجمالي / Total',
        'المخزون قبل / Stock Before',
        'المخزون بعد / Stock After',
        'المخزون الحالي / Current Stock',
        'الفرع / Branch',
        'التاريخ / Date'
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

    // Group issues by product
    const acc = new Map<string, any>();

    issues.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).forEach(issue => {
        issue.products.forEach(ip => {
            const product = products.find(p => p.id === ip.productId);
            const key = ip.productId;

            const existing = acc.get(key);
            const total = ip.totalPrice || (ip.quantity * ip.unitPrice);

            if (existing) {
                existing.quantity += ip.quantity;
                existing.total += total;
                existing.stockBefore += ip.quantity; // Summing total withdrawn to calculate initial virtual stock
            } else {
                const stockBefore = Number(ip.currentStock || (product?.currentStock || 0) + ip.quantity);
                acc.set(key, {
                    productCode: ip.productCode || product?.productCode || '',
                    itemNumber: product?.itemNumber || '',
                    productName: ip.productName || product?.productName || '',
                    unit: ip.unit || product?.unit || 'قطعة',
                    category: product?.category || '',
                    quantity: ip.quantity,
                    total: total,
                    stockBefore: stockBefore,
                    currentStock: product?.currentStock || 0 // Current actual stock
                });
            }
        });
    });



    Array.from(acc.values()).forEach(item => {
        grandTotal += item.total;
        const avgUnitPrice = item.quantity > 0 ? (item.total / item.quantity) : 0;
        const stockAfter = item.stockBefore - item.quantity;

        const rowData = [
            rowIndex++,
            item.productCode,
            item.itemNumber,
            item.productName,
            item.unit,
            item.category,
            item.quantity,
            avgUnitPrice, // Average price
            item.total,
            item.stockBefore,
            stockAfter,
            item.currentStock, // Current actual stock
            'الكل', // Merged branches
            formatArabicGregorianDateTime(new Date()) // Export date
        ];
        worksheet.addRow(rowData);
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
    const productMap = new Map<string, { 
        branchQuantities: { [branchName: string]: number },
        unitPrice?: number
    }>();

    issues.forEach(issue => {
        issue.products.forEach(ip => {
            const existing = productMap.get(ip.productName);
            
            if (existing) {
                existing.branchQuantities[issue.branchName] = (existing.branchQuantities[issue.branchName] || 0) + ip.quantity;
                // Store unit price if not already set
                if (!existing.unitPrice && ip.unitPrice) {
                    existing.unitPrice = ip.unitPrice;
                }
            } else {
                productMap.set(ip.productName, {
                    branchQuantities: { [issue.branchName]: ip.quantity },
                    unitPrice: ip.unitPrice
                });
            }
        });
    });

    // Headers: [#, Name, Branch1, Branch2, ..., Total Qty, Total Cost, Total Value]
    const headers = [
        'م / #',
        'اسم المنتج', 
        ...branchNames,
        'المجموع',
        'اجمالي التكلفة',
        'القيمة الإجمالية'
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // Branch totals for summary row
    const branchTotals: { [branchName: string]: number } = {};
    branchNames.forEach(name => branchTotals[name] = 0);

    let rowIndex = 1;
    for (const [productName, counts] of productMap.entries()) {
        const row: (string | number)[] = [rowIndex++, productName];
        
        let totalQty = 0;
        branchNames.forEach(bn => {
            const qty = counts.branchQuantities[bn] || 0;
            row.push(qty);
            totalQty += qty;
            branchTotals[bn] += qty;
        });
        
        const totalCost = counts.unitPrice ? totalQty * counts.unitPrice : 0;
        const totalValue = totalCost; // Same as total cost for now
        
        row.push(totalQty, totalCost, totalValue);
        worksheet.addRow(row);
    }

    // Add empty row
    worksheet.addRow([]);

    // Add total quantity per branch row
    const totalQtyRow: (string | number)[] = ['مجموع للفرع', ''];
    branchNames.forEach(bn => {
        totalQtyRow.push(branchTotals[bn]);
    });
    totalQtyRow.push(''); // For total quantity column
    totalQtyRow.push(''); // For total cost column
    totalQtyRow.push(Object.values(branchTotals).reduce((sum, qty) => sum + qty, 0)); // Grand total quantity
    const qtyRow = worksheet.addRow(totalQtyRow);
    qtyRow.font = { bold: true };
    qtyRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' } // Yellow
    };
    qtyRow.alignment = { horizontal: 'center' };

    // Add total value per branch row
    const totalValueRow: (string | number)[] = ['اجمالي القيمة للفرع', ''];
    let grandTotalValue = 0;
    branchNames.forEach(bn => {
        let branchValue = 0;
        for (const [productName, counts] of productMap.entries()) {
            const qty = counts.branchQuantities[bn] || 0;
            if (counts.unitPrice) {
                branchValue += qty * counts.unitPrice;
            }
        }
        totalValueRow.push(branchValue);
        grandTotalValue += branchValue;
    });
    totalValueRow.push(''); // For total quantity column
    totalValueRow.push(''); // For total cost column
    totalValueRow.push(grandTotalValue); // Grand total value
    const valueRow = worksheet.addRow(totalValueRow);
    valueRow.font = { bold: true };
    valueRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' } // Light purple
    };
    valueRow.alignment = { horizontal: 'center' };

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
        if (index === 1) {
            column.width = 30; // Product name column
        } else {
            column.width = 15;
        }
    });

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
