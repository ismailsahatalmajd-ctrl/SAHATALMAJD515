import type { Product } from "./types"
import { formatArabicGregorianDate, formatEnglishNumber, formatCurrency, formatNumberWithSeparators, getSafeImageSrc } from "@/lib/utils"
import { db } from "@/lib/db"

export interface SummaryStats {
  totalProducts: number
  totalValue: number
  totalQuantity: number
}

import { TABLE_VIEW_MODES, type TableViewMode, getColumnsForView } from "@/lib/table-view-modes"

interface ProductsPdfOptions {
  products: Product[]
  visibleColumns: Record<string, boolean>
  columnLabels: Record<string, string>
  title?: string
  summaryStats?: SummaryStats
  viewMode?: TableViewMode // New prop
}

const BILINGUAL_HEADERS: Record<string, string> = {
  image: "Image / الصورة",
  productCode: "Code / الكود",
  itemNumber: "Item No / رقم الصنف",
  productName: "Product Name / اسم المنتج",
  location: "Location / الموقع",
  category: "Category / التصنيف",
  unit: "Unit / الوحدة",
  cartonDimensions: "Dimensions / الأبعاد",
  openingStock: "Opening / رصيد افتتاحي",
  purchases: "Purchases / مشتريات",
  issues: "Issues / صرف",
  inventoryCount: "Count / جرد فعلي",
  returns: "Returns / مرتجعات", // Added missing
  currentStock: "Stock / الرصيد الحالي",
  difference: "Diff / الفروقات",
  price: "Price / السعر",
  averagePrice: "Avg Price / متوسط السعر",
  currentStockValue: "Stock Value / قيمة الرصيد",
  issuesValue: "Issued Value / قيمة المنصرف",
  purchasesValue: "Purchases Value / قيمة المشتريات", // Added missing
  returnsValue: "Returns Value / قيمة المرتجعات", // Added missing
  turnoverRate: "Turnover / معدل الدوران",
  status: "Status / الحالة",
  stockStatus: "Stock Status / حالة المخزون", // Added missing
  lastActivity: "Last Activity / آخر نشاط",
}

export async function generateProductsPDF({ products, visibleColumns, columnLabels, title = "قائمة المنتجات", summaryStats, viewMode = 'default' }: ProductsPdfOptions) {
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'
  const dateStr = formatArabicGregorianDate(new Date(), { year: "numeric", month: "long", day: "numeric" })

  // Pre-process products to fetch images from DB if needed
  const processedProducts = await Promise.all(products.map(async (p) => {
    if (p.image === 'DB_IMAGE') {
      try {
        const rec = await db.productImages.get(p.id)
        return { ...p, image: rec?.data || '' }
      } catch (e) {
        console.error("Failed to load image for PDF", p.id)
        return { ...p, image: '' }
      }
    }
    return p
  }))

  // Define column order (same as table)
  const order = [
    'image', 'productCode', 'itemNumber', 'productName', 'location', 'category', 'unit', 'cartonDimensions',
    'openingStock', 'purchases', 'issues', 'returns', 'inventoryCount', 'currentStock', 'difference',
    'price', 'averagePrice', 'currentStockValue', 'purchasesValue', 'issuesValue', 'returnsValue', 'turnoverRate', 'status', 'stockStatus', 'lastActivity'
  ]

  // Get columns for current view
  const viewColumns = getColumnsForView(viewMode)

  // Filter columns based on visibility AND view mode
  const activeColumns = order.filter(key => {
    // 1. Must be enabled in settings (if in default mode, or typically visible columns are passed correctly)
    // Actually products-table passes visibleColumns which reflects checkbox state.
    // If viewMode is default, we respect visibleColumns[key].
    // If viewMode is NOT default, we ONLY show columns in that view.

    if (viewMode === 'default') {
      return visibleColumns[key]
    } else {
      return viewColumns.includes(key)
    }
  })

  // Helper to get bilingual label
  const getLabel = (key: string) => {
    return BILINGUAL_HEADERS[key] || columnLabels[key] || key
  }

  // Create PDF content as HTML
  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <base href="${window.location.origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 10px;
      background: white;
      font-size: 12px;
    }
    @media (min-width: 768px) {
      body { padding: 20px; }
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 10px;
    }
    .header h1 {
      color: #2563eb;
      font-size: 20px;
      margin-bottom: 5px;
    }
    @media (min-width: 768px) {
      .header h1 { font-size: 24px; }
    }
    .header p {
      color: #64748b;
      font-size: 12px;
    }
    
    .summary-section {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 15px;
      text-align: center;
      min-width: 120px;
    }
    .summary-title {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .summary-value {
      font-size: 14px;
      font-weight: bold;
      color: #0f172a;
    }

    .meta-info {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 15px;
      font-size: 11px;
      color: #475569;
    }
    @media (min-width: 480px) {
      .meta-info {
        flex-direction: row;
        justify-content: space-between;
      }
    }
    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 100%;
    }
    thead {
      background: #f1f5f9;
      display: table-header-group;
    }
    th {
      padding: 8px;
      text-align: center;
      font-weight: 600;
      border: 1px solid #e2e8f0;
      font-size: 10px;
      white-space: pre-wrap; /* Allow wrapping for bilingual headers */
    }
    td {
      padding: 6px;
      border: 1px solid #e2e8f0;
      text-align: center;
      vertical-align: middle;
      color: #334155;
      font-size: 10px;
    }
    tr {
      page-break-inside: avoid;
    }
    .product-image {
      width: 30px;
      height: 30px;
      object-fit: cover;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    }
    .no-image {
      font-size: 8px;
      color: #94a3b8;
    }
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }
    @media print {
      body { padding: 0; }
      .header { margin-top: 10px; }
      table { font-size: 9px; width: 100%; table-layout: fixed; }
      th, td { padding: 4px; word-wrap: break-word; overflow-wrap: break-word; }
      .table-wrapper { overflow: visible; }
      .summary-card { border: 1px solid #000; background: white; }
      @page {
        size: landscape;
        margin: 5mm;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
      <img src="${logoUrl}" alt="Logo" style="width:40px;height:40px;" onerror="this.style.display='none'"/>
      <div>
        <h1>${title}</h1>
        <p>مستودع ساحة المجد - Sahat Almajd Warehouse</p>
      </div>
    </div>
  </div>

  ${summaryStats ? `
  <div class="summary-section">
    <div class="summary-card">
      <div class="summary-title">Total Products / عدد المنتجات</div>
      <div class="summary-value">${formatNumberWithSeparators(summaryStats.totalProducts)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-title">Total Quantity / إجمالي الكمية</div>
      <div class="summary-value">${formatNumberWithSeparators(summaryStats.totalQuantity)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-title">Total Value / إجمالي القيمة</div>
      <div class="summary-value">${formatCurrency(summaryStats.totalValue)}</div>
    </div>
  </div>
  ` : ''}

  <div class="meta-info">
    <span>Date / التاريخ: ${dateStr}</span>
    <span>Count / العدد: ${processedProducts.length}</span>
  </div>

  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th style="width: 30px">#</th>
          ${activeColumns.map(col => `<th>${getLabel(col)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${processedProducts.map((p, index) => {
    return `
          <tr>
            <td>${index + 1}</td>
            ${activeColumns.map(col => {
      if (col === 'image') {
        const src = getSafeImageSrc(p.image || '')
        return `<td>${p.image ? `<img src="${src}" class="product-image" />` : '<span class="no-image">-</span>'}</td>`
      }

      let value: any = (p as any)[col]

      // 1. Current Stock Calculation
      if (col === 'currentStock') {
        const opening = Number(p.openingStock) || 0
        const purchases = Number(p.purchases) || 0
        const returns = Number(p.returns) || 0
        const issues = Number(p.issues) || 0
        value = (opening + purchases + returns - issues)
      }

      // 2. Stock Status (Calculated)
      if (col === 'stockStatus') {
        const stock = Number(p.currentStock) || 0

        // Calculate Low Stock Threshold based on Percentage
        const opening = Number(p.openingStock) || 0
        const purchases = Number(p.purchases) || 0
        const totalIn = opening + purchases
        const percentage = Number(p.lowStockThresholdPercentage) || 0

        let isLow = false
        if (percentage > 0) {
          const threshold = totalIn * (percentage / 100)
          isLow = stock <= threshold
        }

        if (stock <= 0) value = 'Out / نفذ'
        else if (isLow) value = 'Low / منخفض'
        else value = 'OK / متوفر'
      }

      // 3. Turnover Rate (Calculated)
      if (col === 'turnoverRate') {
        const opening = Number(p.openingStock) || 0
        const current = Number(p.currentStock) || 0
        const issues = Number(p.issues) || 0
        const avg = (opening + current) / 2

        if (avg <= 0) value = '0%'
        else {
          const rate = issues / avg
          value = `${(rate * 100).toFixed(2)}%`
        }
      }

      // 4. Values (Purchases, Returns, Issues)
      if (col === 'purchasesValue') {
        const qty = Number(p.purchases) || 0
        const price = Number(p.averagePrice || p.price || 0)
        value = qty * price
      }

      if (col === 'returnsValue') {
        if (p.returnsValue !== undefined) value = p.returnsValue
        else {
          const qty = Number(p.returns) || 0
          const price = Number(p.averagePrice || p.price || 0)
          value = qty * price
        }
      }

      if (col === 'issuesValue') {
        // issuesValue is usually stored, but let's recalculate if missing to be safe
        if (!value) {
          const qty = Number(p.issues) || 0
          const price = Number(p.price) || 0 // Issues usually valued at selling price
          value = qty * price
        }
      }

      // 5. Difference
      if (col === 'difference') {
        // Force 0 as per user request (Manual Inventory Disabled)
        value = 0
      }

      // 6. Carton Dimensions and Box/Piece Logic
      if (['openingStock', 'purchases', 'issues', 'returns', 'inventoryCount', 'currentStock', 'difference'].includes(col)) {
        // Special formatting for quantities (Box + Piece)
        const numVal = Number(value || 0)
        const perCarton = Number(p.quantityPerCarton || 1)

        // Default formatting
        let formatted = formatNumberWithSeparators(numVal)

        if (perCarton > 1 && numVal !== 0 && !isNaN(numVal)) {
          const absVal = Math.abs(numVal)
          const cartons = Math.floor(absVal / perCarton)
          const remainder = absVal % perCarton
          const sign = numVal < 0 ? "-" : ""
          const cartonLabel = p.cartonUnit || 'Box'
          const unitLabel = p.unit || 'Pc'

          const parts = []
          if (cartons > 0) parts.push(`${cartons} ${cartonLabel}`)
          if (remainder > 0) parts.push(`${remainder} ${unitLabel}`)

          if (parts.length > 0) {
            formatted = `${sign}${parts.join(' + ')} (${formatNumberWithSeparators(numVal)})`
          }
        }
        value = formatted
      } else if (col === 'cartonDimensions') {
        const L = p.cartonLength
        const W = p.cartonWidth
        const H = p.cartonHeight
        const parts = [L, W, H].filter(v => v !== undefined && v !== null && v !== 0)
        const base = parts.length ? parts.join(" × ") : ''
        value = base ? (p.cartonUnit ? `${base} ${p.cartonUnit}` : base) : ''
      } else if (['price', 'averagePrice', 'currentStockValue', 'issuesValue', 'purchasesValue', 'returnsValue'].includes(col)) {
        value = formatCurrency(Number(value || 0))
      } else if (col === 'lastActivity') {
        try {
          value = value ? formatArabicGregorianDate(new Date(String(value))) : '-'
        } catch { value = '-' }
      } else if (col === 'quantityPerCarton') {
        value = formatNumberWithSeparators(Number(value || 0))
      }

      return `<td>${value !== undefined && value !== null ? value : ''}</td>`
    }).join('')}
          </tr>
          `
  }).join('')}
      </tbody >
    </table >
  </div >

  <div class="footer">
    Generated by Sahat Almajd System / تم الاستخراج من نظام ساحة المجد
  </div>

  <script>
    window.onload = function() {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  </script>
</body >
</html >
  `

  return new Promise<void>((resolve) => {
    try {
      const printWindow = window.open("", "_blank")
      if (printWindow) {
        printWindow.document.write(pdfContent)
        printWindow.document.close()
        setTimeout(() => resolve(), 1000)
      } else {
        resolve()
      }
    } catch (error) {
      console.error("Failed to generate PDF:", error)
      resolve()
    }
  })
}
