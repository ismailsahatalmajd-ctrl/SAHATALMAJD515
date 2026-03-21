import * as ExcelJS from 'exceljs';
import type { Issue, IssueProduct, Product } from './types';
import { formatArabicGregorianDateTime, formatArabicGregorianDateTimeWithDay } from './utils';

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
    
    // 1. All Branches Sheet (First)
    const allSheet = workbook.addWorksheet('جميع الفروع');
    allSheet.views = [{ rightToLeft: true }];
    const allHeaders = ['م', 'اسم الفرع', 'كود المنتج', 'اسم المنتج', 'الكمية', 'السعر', 'الإجمالي', 'التاريخ'];
    const allHeaderRow = allSheet.addRow(allHeaders);
    allHeaderRow.font = { bold: true };
    allHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };

    let allIdx = 1;
    let allGrandTotal = 0;

    // 2. Individual Sheets Data Collection
    const branchMap = new Map<string, Issue[]>();

    issues.sort((a, b) => new Date(a.deliveredAt || a.createdAt).getTime() - new Date(b.deliveredAt || b.createdAt).getTime()).forEach(issue => {
        const list = branchMap.get(issue.branchName) || [];
        list.push(issue);
        branchMap.set(issue.branchName, list);

        // Populate All Branches Sheet
        issue.products.forEach(ip => {
            const total = ip.totalPrice || (ip.quantity * ip.unitPrice);
            allGrandTotal += total;
            allSheet.addRow([
                allIdx++,
                issue.branchName,
                ip.productCode,
                ip.productName,
                ip.quantity,
                ip.unitPrice,
                total,
                formatArabicGregorianDateTimeWithDay(new Date(issue.deliveredAt || issue.createdAt))
            ]);
        });
    });

    allSheet.addRow([]);
    allSheet.addRow(['', '', '', '', '', '', 'الإجمالي العام:', allGrandTotal]).font = { bold: true };
    allSheet.columns.forEach(column => {
        column.width = 20;
        if (column.number === 4) column.width = 35; // Product Name
    });

    // 3. Create Individual Sheets
    for (const [branchName, branchIssues] of branchMap.entries()) {
        const safeName = branchName.slice(0, 31).replace(/[\\\/\?\*\[\]]/g, '');
        const worksheet = workbook.addWorksheet(safeName || 'Branch');
        worksheet.views = [{ rightToLeft: true }];

        const headers = ['م', 'كود المنتج', 'اسم المنتج', 'الكمية', 'السعر', 'الإجمالي', 'التاريخ'];
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

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
                    formatArabicGregorianDateTimeWithDay(new Date(issue.deliveredAt || issue.createdAt))
                ]);
            });
        });

        worksheet.addRow([]);
        worksheet.addRow(['', '', '', '', 'إجمالي الفرع:', branchTotal]).font = { bold: true };
        worksheet.columns.forEach(column => {
            column.width = 20;
            if (column.number === 3) column.width = 35; // Product Name
        });
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
        productCode: string;
        category: string;
        location: string;
        lastDeliveredAt?: string;
        branchQuantities: { [branchName: string]: number };
        branchValues: { [branchName: string]: number };
    }>();

    issues.forEach(issue => {
        issue.products.forEach(ip => {
            const product = products.find(p => p.id === ip.productId);
            const existing = productMap.get(ip.productName);

            const itemValue = ip.totalPrice || (ip.quantity * ip.unitPrice) || 0;

            if (existing) {
                existing.branchQuantities[issue.branchName] = (existing.branchQuantities[issue.branchName] || 0) + ip.quantity;
                existing.branchValues[issue.branchName] = (existing.branchValues[issue.branchName] || 0) + itemValue;
                
                // Store latest delivery date
                const currentIssueDate = issue.deliveredAt || issue.createdAt;
                if (!existing.lastDeliveredAt || new Date(currentIssueDate) > new Date(existing.lastDeliveredAt)) {
                    existing.lastDeliveredAt = currentIssueDate;
                }
            } else {
                productMap.set(ip.productName, {
                    productCode: product?.productCode || ip.productCode || '',
                    category: product?.category || '',
                    location: product?.location || product?.warehousePositionCode || product?.warehouseLocationId || '',
                    lastDeliveredAt: issue.deliveredAt || issue.createdAt,
                    branchQuantities: { [issue.branchName]: ip.quantity },
                    branchValues: { [issue.branchName]: itemValue }
                });
            }
        });
    });

    // Headers: [#, Name, Code, Category, Location, LastDelivered, Branch1, Branch2, ..., Total Qty, Total Cost, Total Value]
    const headers = [
        'م / #',
        'اسم المنتج',
        'كود المنتج',
        'التصنيف',
        'الموقع',
        'تاريخ آخر تسليم',
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
        const row: (string | number)[] = [
            rowIndex++,
            productName,
            counts.productCode || '',
            counts.category || '',
            counts.location || '',
            counts.lastDeliveredAt ? formatArabicGregorianDateTime(new Date(counts.lastDeliveredAt)) : '',
        ];
        // Add branch quantities
        let totalQty = 0;
        let totalValue = 0;
        branchNames.forEach(bn => {
            const qty = counts.branchQuantities[bn] || 0;
            const val = counts.branchValues[bn] || 0;
            row.push(qty);
            totalQty += qty;
            totalValue += val;
            branchTotals[bn] += qty;
        });
        
        row.push(totalQty, totalValue, totalValue);
        worksheet.addRow(row);
    }

    // Add empty row
    worksheet.addRow([]);

    // Add total quantity per branch row
    const totalQtyRow: (string | number)[] = ['مجموع للفرع', '', '', '', '', ''];
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
    const totalValueRow: (string | number)[] = ['اجمالي القيمة للفرع', '', '', '', '', ''];
    let grandTotalValue = 0;
    branchNames.forEach(bn => {
        let branchValueSum = 0;
        for (const [productName, counts] of productMap.entries()) {
            branchValueSum += counts.branchValues[bn] || 0;
        }
        totalValueRow.push(branchValueSum);
        grandTotalValue += branchValueSum;
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
        if (index === 1) { // Product Name
            column.width = 30;
        } else if (index >= 2 && index <= 5) { // Product Code, Category, Location, lastDeliveredAt
            column.width = 25;
        } else {
            column.width = 15;
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(buffer, `مصفوفة_المصروفات_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Report 4: Frequency Analysis (تحليل تكرار الطلب)
 * Columns: sequence, branch, product name, product code, total times ordered, total qty, order date, order day, order quantity.
 */
export async function exportFrequencyAnalysisExcel(issues: Issue[], products: Product[]) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('تحليل تكرار الطلب');
    worksheet.views = [{ rightToLeft: true }];

    const headers = [
        'م / #',
        'اسم الفرع / Branch Name',
        'اسم المنتج / Product Name',
        'كود المنتج / Product Code',
        'عدد مرات الطلب / Order Frequency',
        'كمية الطلب / Order Quantity',
        'إجمالي الكميات / Total Quantities',
        'تاريخ التسليم / Delivery Date',
        'يوم التسليم / Delivery Day',
        'إجمالي طلبات المنتج / Total Product Orders',
        'إجمالي المنصرف العام / Global Total Issues'
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // Grouping by Branch + Product
    const summaryMap = new Map<string, {
        branchName: string;
        productName: string;
        productCode: string;
        frequency: number;
        globalFrequency: number;
        globalTotalQty: number;
        totalQty: number;
        orders: { date: string, qty: number }[];
    }>();

    // Calculate Global Frequency and Quantities first
    const globalFrequencyMap = new Map<string, number>();
    const globalQtyMap = new Map<string, number>();
    issues.forEach(issue => {
        issue.products.forEach(ip => {
            const gFreq = globalFrequencyMap.get(ip.productId) || 0;
            globalFrequencyMap.set(ip.productId, gFreq + 1);
            
            const gQty = globalQtyMap.get(ip.productId) || 0;
            globalQtyMap.set(ip.productId, gQty + ip.quantity);
        });
    });

    issues.forEach(issue => {
        issue.products.forEach(ip => {
            const key = `${issue.branchName}-${ip.productId}`;
            const existing = summaryMap.get(key);
            const orderDate = issue.deliveredAt || issue.createdAt;

            if (existing) {
                existing.frequency += 1;
                existing.totalQty += ip.quantity;
                existing.orders.push({ date: orderDate, qty: ip.quantity });
            } else {
                summaryMap.set(key, {
                    branchName: issue.branchName,
                    productName: ip.productName,
                    productCode: ip.productCode || '',
                    frequency: 1,
                    globalFrequency: globalFrequencyMap.get(ip.productId) || 1,
                    globalTotalQty: globalQtyMap.get(ip.productId) || ip.quantity,
                    totalQty: ip.quantity,
                    orders: [{ date: orderDate, qty: ip.quantity }]
                });
            }
        });
    });

    let rowIndex = 1;
    // Sort summary entries by branch name, then frequency desc
    const sortedEntries = Array.from(summaryMap.values()).sort((a, b) => {
        if (a.branchName !== b.branchName) return a.branchName.localeCompare(b.branchName);
        return b.frequency - a.frequency;
    });

    sortedEntries.forEach(summary => {
        // Output one row per order, with summary fields repeating
        summary.orders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(order => {
            const dateObj = new Date(order.date);
            worksheet.addRow([
                rowIndex++,
                summary.branchName,
                summary.productName,
                summary.productCode,
                summary.frequency,
                order.qty,
                summary.totalQty,
                formatArabicGregorianDateTime(dateObj),
                dateObj.toLocaleDateString("ar-u-ca-gregory-nu-latn", { weekday: "long" }),
                summary.globalFrequency,
                summary.globalTotalQty
            ]);
        });
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
        column.width = 25;
        if (index === 2) column.width = 35; // Product Name
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(buffer, `تحليل_تكرار_الطلب_${new Date().toISOString().split('T')[0]}.xlsx`);
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
