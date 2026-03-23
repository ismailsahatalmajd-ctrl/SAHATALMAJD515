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

    // --- Summary Section at Bottom ---
    worksheet.addRow([]);
    worksheet.addRow([]);
    const summaryHeaderRow = worksheet.addRow(['', 'مختصر القيمة حسب المجموعات / Group Summary', '', '']);
    summaryHeaderRow.font = { bold: true, size: 14 };
    
    const subHeaders = ['المجموعة / Group', 'اجمالي القيمة / Group Total', 'قيمة المصروفات / Branch Value', 'اسم الفرع / Branch Name'];
    const subHeaderRow = worksheet.addRow(subHeaders);
    subHeaderRow.font = { bold: true };
    subHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    subHeaderRow.alignment = { horizontal: 'center' };

    // Grouping Logic
    const branchValueSumMap = new Map<string, number>();
    branchNames.forEach(bn => {
        let sum = 0;
        for (const counts of productMap.values()) {
            sum += counts.branchValues[bn] || 0;
        }
        branchValueSumMap.set(bn, sum);
    });

    const groups = [
        { label: 'قيمة المصنع', branches: branchNames.filter(b => b === 'Factory') },
        { label: 'قيمة هنو', branches: branchNames.filter(b => b.toLowerCase().includes('hanoverian')) },
        { label: 'قيمة جديل', branches: branchNames.filter(b => b.toLowerCase().includes('jadeel')) },
        { label: 'قيمتة سويدي', branches: branchNames.filter(b => b.includes('Roastery Sewadi')) },
        { label: 'قيمة سبارك', branches: branchNames.filter(b => b === 'SPARK') },
        { label: 'قيمة المبيعات', branches: branchNames.filter(b => b === 'Sales') },
        { label: 'قيمة مبيعات جدة', branches: branchNames.filter(b => b === 'Sales Jeddah') }
    ];

    let currentSumRow = worksheet.lastRow!.number + 1;
    let totalAll = 0;

    groups.forEach(g => {
        if (g.branches.length === 0) return;

        const groupTotal = g.branches.reduce((sum, bn) => sum + (branchValueSumMap.get(bn) || 0), 0);
        totalAll += groupTotal;

        g.branches.forEach((bn, idx) => {
            const branchVal = branchValueSumMap.get(bn) || 0;
            const r = worksheet.addRow([
                g.label,
                groupTotal,
                branchVal,
                bn
            ]);
            r.getCell(2).numFmt = '#,##0.00';
            r.getCell(3).numFmt = '#,##0.00';
        });

        // Merge group label and group total if more than one branch
        if (g.branches.length > 1) {
            const startRow = currentSumRow;
            const endRow = currentSumRow + g.branches.length - 1;
            worksheet.mergeCells(startRow, 1, endRow, 1);
            worksheet.mergeCells(startRow, 2, endRow, 2);
            
            // Center the merged content
            worksheet.getRow(startRow).getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
            worksheet.getRow(startRow).getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
        }
        
        currentSumRow += g.branches.length;
    });

    const finalTotalRow = worksheet.addRow(['الإجمالي العام', totalAll, '', '']);
    finalTotalRow.font = { bold: true };
    finalTotalRow.getCell(2).numFmt = '#,##0.00';
    finalTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };

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

    issues.sort((a, b) => new Date(a.deliveredAt || a.createdAt).getTime() - new Date(b.deliveredAt || b.createdAt).getTime());

    // Grouping for Day Summary Sheet
    const daySummaryMap = new Map<string, {
        branchName: string;
        dateStr: string;
        productCount: number;
        ordersCount: number;
    }>();

    // Calculate Global Frequency, Quantities, and Daily Totals
    const globalFrequencyMap = new Map<string, number>();
    const globalQtyMap = new Map<string, number>();
    const dailyGlobalProductCount = new Map<string, number>();
    const dailyGlobalOrderCount = new Map<string, number>();

    // Weekly Summary Data Structure
    const weekdaySummaryMap = new Map<string, {
        dayName: string;
        ordersCount: number;
        branchDeliveriesCount: number;
        productsCount: number;
        totalQuantity: number;
    }>();

    // Branch-Weekday Summary Structure
    const branchWeekdayMap = new Map<string, {
        branchName: string;
        dayName: string;
        ordersCount: number;
        productsCount: number;
    }>();

    issues.forEach(issue => {
        const orderDate = issue.deliveredAt || issue.createdAt;
        const dateObj = new Date(orderDate);
        const dayName = dateObj.toLocaleDateString("ar-u-ca-gregory-nu-latn", { weekday: "long" });

        // Update branch-weekday mapping
        const bwKey = `${issue.branchName}-${dayName}`;
        const existingBW = branchWeekdayMap.get(bwKey);
        const pCount = issue.products.length;
        if (existingBW) {
            existingBW.ordersCount += 1;
            existingBW.productsCount += pCount;
        } else {
            branchWeekdayMap.set(bwKey, {
                branchName: issue.branchName,
                dayName,
                ordersCount: 1,
                productsCount: pCount
            });
        }
        
        const existingWeekday = weekdaySummaryMap.get(dayName);
        const currentProductsCount = issue.products.length;
        const currentTotalQty = issue.products.reduce((sum, ip) => sum + ip.quantity, 0);

        if (existingWeekday) {
            existingWeekday.ordersCount += 1;
            existingWeekday.branchDeliveriesCount += 1;
            existingWeekday.productsCount += currentProductsCount;
            existingWeekday.totalQuantity += currentTotalQty;
        } else {
            weekdaySummaryMap.set(dayName, {
                dayName,
                ordersCount: 1,
                branchDeliveriesCount: 1,
                productsCount: currentProductsCount,
                totalQuantity: currentTotalQty
            });
        }

        const dateStr = dateObj.toISOString().split('T')[0];
        const dayKey = `${issue.branchName}-${dateStr}`;
        
        // Update Daily Global Product & Order Counts
        const productsInIssueCount = issue.products.length;
        const currentGlobalDayCount = dailyGlobalProductCount.get(dateStr) || 0;
        dailyGlobalProductCount.set(dateStr, currentGlobalDayCount + productsInIssueCount);
        
        const currentGlobalOrderCount = dailyGlobalOrderCount.get(dateStr) || 0;
        dailyGlobalOrderCount.set(dateStr, currentGlobalOrderCount + 1);
        
        // Update Day Summary Map
        const existingDay = daySummaryMap.get(dayKey);

        if (existingDay) {
            existingDay.productCount += productsInIssueCount;
            existingDay.ordersCount += 1;
        } else {
            daySummaryMap.set(dayKey, {
                branchName: issue.branchName,
                dateStr: dateStr,
                productCount: productsInIssueCount,
                ordersCount: 1
            });
        }

        // Update Global Maps
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
    
    // Create new Summary Sheet ( ملخص الأيام والفروع )
    const summarySheet = workbook.addWorksheet('ملخص الأيام والفروع');
    summarySheet.views = [{ rightToLeft: true }];
    const summaryHeaders = [
        'م / #',
        'اسم الفرع / Branch Name',
        'شهر التسليم / Delivery Month',
        'يوم التسليم (رقم) / Day',
        'يوم التسليم (اسم) / Weekday',
        'عدد المنتجات / Product Items',
        'إجمالي طلبات اليوم (للكل) / Global Daily Orders',
        'إجمالي منتجات اليوم (للكل) / Global Daily Items'
    ];
    const sHeaderRow = summarySheet.addRow(summaryHeaders);
    sHeaderRow.font = { bold: true };
    sHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    sHeaderRow.alignment = { horizontal: 'center' };

    let sIdx = 1;
    // Sort summarized days by date and then branch
    const sortedSummary = Array.from(daySummaryMap.values()).sort((a, b) => {
        if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
        return a.branchName.localeCompare(b.branchName);
    });

    sortedSummary.forEach(item => {
        const date = new Date(item.dateStr);
        summarySheet.addRow([
            sIdx++,
            item.branchName,
            date.toLocaleDateString("ar-u-ca-gregory-nu-latn", { month: "long" }),
            date.getDate(),
            date.toLocaleDateString("ar-u-ca-gregory-nu-latn", { weekday: "long" }),
            item.productCount,
            dailyGlobalOrderCount.get(item.dateStr) || 1,
            dailyGlobalProductCount.get(item.dateStr) || item.productCount
        ]);
    });

    summarySheet.columns.forEach(col => col.width = 25);

    // 2. Weekly Summary Table
    summarySheet.addRow([]);
    summarySheet.addRow([]);
    const weeklyTitleRow = summarySheet.addRow(['ملخص أيام الأسبوع / Weekly Summary']);
    weeklyTitleRow.font = { bold: true, size: 14 };
    
    const weeklyHeaders = [
        'يوم التسليم (اسم) / Day Name',
        'إجمالي الطلبات / Total Orders',
        'عدد مرات صرف الفروع / Branch Deliveries',
        'إجمالي بنود المنتجات / Product Items',
        'إجمالي الكميات / Total Quantity'
    ];
    const wHeaderRow = summarySheet.addRow(weeklyHeaders);
    wHeaderRow.font = { bold: true };
    wHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    wHeaderRow.alignment = { horizontal: 'center' };

    const weekdayOrder = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
    
    weekdayOrder.forEach(day => {
        const stats = weekdaySummaryMap.get(day);
        if (stats) {
            summarySheet.addRow([
                stats.dayName,
                stats.ordersCount,
                stats.branchDeliveriesCount,
                stats.productsCount,
                stats.totalQuantity
            ]);
        }
    });

    // 3. Branch & Weekday Analysis Table
    summarySheet.addRow([]);
    summarySheet.addRow([]);
    const bwTitleRow = summarySheet.addRow(['تحليل الطلب حسب الفروع والأيام / Branch & Weekday Analysis']);
    bwTitleRow.font = { bold: true, size: 14 };

    const bwHeaders = [
        'اسم الفرع / Branch Name',
        'يوم التسليم (اسم) / Day Name',
        'إجمالي المرات المطلوبة / Total Orders Count',
        'إجمالي عدد بنود المنتجات / Total Products Count'
    ];
    const bwHeaderRow = summarySheet.addRow(bwHeaders);
    bwHeaderRow.font = { bold: true };
    bwHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    bwHeaderRow.alignment = { horizontal: 'center' };

    // Sort by branch name and then weekday
    const sortedBW = Array.from(branchWeekdayMap.values()).sort((a, b) => {
        if (a.branchName !== b.branchName) return a.branchName.localeCompare(b.branchName);
        return weekdayOrder.indexOf(a.dayName) - weekdayOrder.indexOf(b.dayName);
    });

    sortedBW.forEach(stats => {
        summarySheet.addRow([
            stats.branchName,
            stats.dayName,
            stats.ordersCount,
            stats.productsCount
        ]);
    });

    const fullBuffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(fullBuffer, `تحليل_تكرار_الطلب_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Report 5: Product Movement Analysis (تحليل حركة المنتجات)
 * Columns: sequence, product name, product code, category, location, [Month columns: Status & Qty], stock balance, stock value, overall status.
 */
export async function exportProductMovementAnalysisExcel(issues: Issue[], products: Product[]) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('تحليل حركة المنتجات');
    worksheet.views = [{ rightToLeft: true }];

    // Group issues by Month-Product
    const productStats = new Map<string, {
        [month: string]: number;
    }>();
    const monthsSet = new Set<string>();

    issues.forEach(issue => {
        const date = new Date(issue.deliveredAt || issue.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthsSet.add(monthKey);

        issue.products.forEach(ip => {
            const currentStats = productStats.get(ip.productId) || {};
            currentStats[monthKey] = (currentStats[monthKey] || 0) + ip.quantity;
            productStats.set(ip.productId, currentStats);
        });
    });

    const sortedMonths = Array.from(monthsSet).sort();

    // Headers Building
    const headers = [
        'م / #',
        'اسم المنتج / Product Name',
        'كود المنتج / Product Code',
        'التصنيف / Category',
        'الموقع / Location'
    ];

    sortedMonths.forEach(m => {
        const monthName = new Date(`${m}-01`).toLocaleDateString("ar-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });
        headers.push(`${monthName} - الحالة`, `${monthName} - الكمية`);
    });

    headers.push(
        'المخزون المتبقي / Stock Bal',
        'قيمة المخزون / Stock Value',
        'الحالة الحالية / Final Status'
    );

    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    headerRow.alignment = { horizontal: 'center' };

    const getStatus = (qty: number, currentStock: number) => {
        if (qty === 0) return 'راكد (Dead)';
        if (currentStock <= 0) return 'سريع (Fast)'; // Definite fast movement if stock is out
        
        const ratio = qty / currentStock;
        if (ratio > 1) return 'سريع (Fast)';
        if (ratio >= 0.35) return 'عادي (Normal)';
        return 'بطيء (Slow)';
    };

    let idx = 1;

    products.forEach(p => {
        const stats = productStats.get(p.id) || {};
        const rowData: (string | number)[] = [
            idx++,
            p.productName,
            p.productCode,
            p.category,
            p.location || p.warehousePositionCode || ''
        ];

        // Monthly data
        let totalIssued = 0;
        sortedMonths.forEach(m => {
            const qty = stats[m] || 0;
            totalIssued += qty;
            rowData.push(getStatus(qty, p.currentStock), qty);
        });

        // Summary data
        const stockBal = p.currentStock || 0;
        const stockVal = stockBal * (p.averagePrice || p.price || 0);

        // Overall status based on total period consumption
        // Use normalized average monthly consumption for overall status?
        // Let's use the average per month if available, else 0
        const avgMonthlyQty = sortedMonths.length > 0 ? (totalIssued / sortedMonths.length) : 0;
        
        rowData.push(
            stockBal,
            Number(stockVal.toFixed(2)),
            getStatus(avgMonthlyQty, p.currentStock)
        );

        const row = worksheet.addRow(rowData);
        // Apply number format to Stock Value cell (second to last column)
        const valCell = row.getCell(rowData.length - 1);
        valCell.numFmt = '#,##0.00';
    });

    // Auto-width
    worksheet.columns.forEach(col => col.width = 22);

    const buffer = await workbook.xlsx.writeBuffer();
    saveAsExcel(buffer, `تحليل_حركة_المنتجات_${new Date().toISOString().split('T')[0]}.xlsx`);
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
