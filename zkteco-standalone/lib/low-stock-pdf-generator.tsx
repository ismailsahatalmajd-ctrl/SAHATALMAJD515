
import type { Product } from "./types"
import { formatArabicGregorianDate, formatEnglishNumber } from "@/lib/utils"

export function generateLowStockPDF(products: Product[]) {
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'
  const dateStr = formatArabicGregorianDate(new Date(), { year: "numeric", month: "long", day: "numeric" })

  // Calculate low stock items logic again to be safe or pass pre-filtered
  const lowStockItems = products.filter(p => {
    if (p.isLowStock !== undefined) return p.isLowStock
    const threshold = p.lowStockThresholdPercentage || 33.33
    const limit = (p.openingStock + p.purchases) * (threshold / 100)
    return p.currentStock <= limit
  })

  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير المخزون المنخفض</title>
  <base href="${window.location.origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 40px;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid #dc2626;
      padding-bottom: 20px;
    }
    .header h1 { color: #dc2626; font-size: 32px; margin-bottom: 10px; }
    .header p { color: #64748b; font-size: 14px; }
    .info-box { background: #fef2f2; padding: 20px; border-radius: 8px; border-right: 4px solid #dc2626; margin-bottom: 30px; }
    .info-box p { color: #7f1d1d; font-size: 16px; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    thead { background: #dc2626; color: white; }
    th { padding: 15px; text-align: right; font-weight: 600; font-size: 14px; }
    td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    tbody tr:hover { background: #fff1f2; }
    .footer { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    @media print {
      body { padding: 20px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
      <img src="${logoUrl}" alt="المخزن" style="width:48px;height:48px;border-radius:6px;" onerror="this.style.display='none'"/>
      <div>
        <h1>تقرير المخزون المنخفض</h1>
        <p>تنبيهات انخفاض الكميات عن الحد المسموح</p>
      </div>
    </div>
  </div>

  <div class="info-box">
    <p><strong>تاريخ التقرير:</strong> ${dateStr}</p>
    <p><strong>عدد المنتجات المنخفضة:</strong> ${formatEnglishNumber(lowStockItems.length)}</p>
    <p><strong>معيار الانخفاض:</strong> الكمية الحالية &le; 33.33% من (المخزون الافتتاحي + المشتريات)</p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 50px">#</th>
        <th>كود المنتج</th>
        <th>اسم المنتج</th>
        <th>التصنيف</th>
        <th>الكمية الحالية</th>
        <th>الحد الأدنى</th>
        <th>تاريخ التنبيه</th>
      </tr>
    </thead>
    <tbody>
      ${lowStockItems
      .map((product, index) => {
        const threshold = product.lowStockThresholdPercentage || 33.33
        const limit = (product.openingStock + product.purchases) * (threshold / 100)
        const detectedDate = product.lowStockDetectedAt ? new Date(product.lowStockDetectedAt).toLocaleDateString('ar-SA') : '-'

        return `
        <tr>
          <td>${formatEnglishNumber(index + 1)}</td>
          <td>${product.productCode}</td>
          <td><strong>${product.productName}</strong></td>
          <td>${product.category}</td>
          <td style="color: #dc2626; font-weight: bold;">${formatEnglishNumber(product.currentStock)}</td>
          <td>${formatEnglishNumber(Math.floor(limit))} <span style="font-size:0.8em; color:#64748b">(${threshold}%)</span></td>
          <td>${detectedDate}</td>
        </tr>
      `
      })
      .join("")}
    </tbody>
  </table>

  <div class="footer">
    <p>تم إنشاء هذا التقرير آلياً من النظام.</p>
  </div>
</body>
</html>
`

  const printWindow = window.open("", "_blank")
  if (!printWindow) return
  printWindow.document.write(pdfContent)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 300)
}
