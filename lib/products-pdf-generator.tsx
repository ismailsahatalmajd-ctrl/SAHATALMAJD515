import type { Product } from "./types"
import { formatArabicGregorianDate, formatEnglishNumber, getSafeImageSrc } from "@/lib/utils"
import { db } from "@/lib/db"

interface ProductsPdfOptions {
  products: Product[]
  visibleColumns: Record<string, boolean>
  columnLabels: Record<string, string>
  title?: string
}

export async function generateProductsPDF({ products, visibleColumns, columnLabels, title = "قائمة المنتجات" }: ProductsPdfOptions) {
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
    'openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference',
    'price', 'averagePrice', 'currentStockValue', 'issuesValue', 'turnoverRate', 'status', 'lastActivity'
  ]

  // Filter columns based on visibility
  const activeColumns = order.filter(key => visibleColumns[key])

  // Helper to get label
  const getLabel = (key: string) => columnLabels[key] || key

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
    .meta-info {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 15px;
      font-size: 12px;
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
      -webkit-overflow-scrolling: touch;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 800px; /* Ensure table doesn't squish too much */
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
      font-size: 11px;
      white-space: nowrap;
    }
    td {
      padding: 6px;
      border: 1px solid #e2e8f0;
      text-align: center;
      vertical-align: middle;
      color: #334155;
    }
    tr {
      page-break-inside: avoid;
    }
    .product-image {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    }
    .no-image {
      font-size: 9px;
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
      th, td { padding: 3px; word-wrap: break-word; overflow-wrap: break-word; }
      .table-wrapper { overflow: visible; }
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
        <p>مستودع ساحة المجد</p>
      </div>
    </div>
  </div>

  <div class="meta-info">
    <span>تاريخ الطباعة: ${dateStr}</span>
    <span>عدد المنتجات: ${processedProducts.length}</span>
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
        return `<td>${p.image ? `<img src="${src}" class="product-image" />` : '<span class="no-image">لا صورة</span>'}</td>`
      }
      let value: any = (p as any)[col]

      // Dynamic calculations
      if (col === 'currentStock') {
        const opening = Number(p.openingStock) || 0
        const purchases = Number(p.purchases) || 0
        const issues = Number(p.issues) || 0
        value = opening + purchases - issues
      }

      // Recalculate difference dynamically
      if (col === 'difference') {
        const opening = Number(p.openingStock) || 0
        const purchases = Number(p.purchases) || 0
        const issues = Number(p.issues) || 0
        const currentStock = (p.currentStock !== undefined) ? Number(p.currentStock) : (opening + purchases - issues)
        const inventoryCount = Number(p.inventoryCount) || 0
        value = currentStock - inventoryCount
      }

      if (col === 'cartonDimensions') {
        const L = p.cartonLength
        const W = p.cartonWidth
        const H = p.cartonHeight
        const parts = [L, W, H].filter(v => v !== undefined && v !== null && v !== 0)
        const base = parts.length ? parts.join(" × ") : ''
        value = base ? (p.cartonUnit ? `${base} ${p.cartonUnit}` : base) : ''
      }

      // Format specific columns
      if (col === 'issuesValue') {
        const val = parseFloat(Number(value || 0).toFixed(5))
        value = formatEnglishNumber(val)
      } else if (['price', 'averagePrice', 'currentStockValue'].includes(col)) {
        value = formatEnglishNumber(Number(value || 0).toFixed(2))
      } else if (['openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference'].includes(col)) {
        value = formatEnglishNumber(value)
      } else if (col === 'productCode' || col === 'itemNumber') {
        // Ensure numbers are shown correctly (raw)
        value = (p as any)[col]
      } else if (col === 'turnoverRate') {
        // Calculate turnover if needed, or use existing if stored? 
        // In table it's calculated on fly. Here we assume p has it or we compute?
        // The p object passed from table usually is raw Product.
        // We might need to recalculate.
        // For simplicity, let's just show raw or skip complex calc if not available.
        // Actually, let's try to match table logic simply:
        const stock = Number(p.currentStock ?? 0)
        const opening = Number(p.openingStock ?? 0)
        const purchases = Number(p.purchases ?? 0)
        const soldQty = Number(p.issues ?? 0)
        const baseStock = stock > 0 ? stock : opening + purchases
        const ratio = baseStock > 0 ? soldQty / baseStock : 0
        value = formatEnglishNumber(ratio.toFixed(2))
      } else if (col === 'lastActivity') {
        value = p.lastActivity ? formatArabicGregorianDate(new Date(p.lastActivity)) : '-'
      }

      return `<td>${value !== undefined && value !== null ? value : ''}</td>`
    }).join('')}
          </tr>
          `
  }).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    تم استخراج هذا التقرير من نظام إدارة المخزون - ساحة المجد
  </div>

  <script>
    window.onload = function() {
      setTimeout(() => {
        window.print();
        // Optional: close window after print
        // window.close(); 
      }, 500);
    }
  </script>
</body>
</html>
  `

  const printWindow = window.open("", "_blank")
  if (printWindow) {
    printWindow.document.write(pdfContent)
    printWindow.document.close()
  }
}
