import type { Issue } from "./types"
import { getProducts } from "@/lib/storage"
import type { Lang } from "@/lib/i18n"
import { translate } from "@/lib/i18n"
import { formatArabicGregorianDate } from "@/lib/utils"
import { getInvoiceSettings } from "./invoice-settings-store"

interface ConsolidatedProduct {
  productId: string
  productCode: string
  productName: string
  unit: string
  totalQuantity: number
  totalValue: number
  image?: string
  issueCount: number
}

interface TotalIssuedInvoiceOptions {
  dateFrom?: string
  dateTo?: string
  branchFilter?: string
  lang?: Lang
}

export async function generateTotalIssuedPDF(issues: Issue[], options: TotalIssuedInvoiceOptions = {}) {
  const settings = await getInvoiceSettings()
  const allProducts = getProducts()
  const { dateFrom, dateTo, branchFilter, lang = "ar" } = options
  const dir = lang === "ar" ? "rtl" : "ltr"
  const htmlLang = lang === "ar" ? "ar" : "en"

  // Filter issues by date and branch if specified
  let filteredIssues = [...issues]

  if (dateFrom) {
    filteredIssues = filteredIssues.filter((issue) => new Date(issue.createdAt) >= new Date(dateFrom))
  }

  if (dateTo) {
    filteredIssues = filteredIssues.filter((issue) => new Date(issue.createdAt) <= new Date(dateTo + "T23:59:59"))
  }

  if (branchFilter && branchFilter !== "all") {
    filteredIssues = filteredIssues.filter((issue) => issue.branchId === branchFilter)
  }

  // Consolidate products from all filtered issues
  const consolidatedMap = new Map<string, ConsolidatedProduct>()

  filteredIssues.forEach((issue) => {
    issue.products.forEach((product) => {
      const key = product.productId || product.productCode

      if (consolidatedMap.has(key)) {
        const existing = consolidatedMap.get(key)!
        existing.totalQuantity += product.quantity
        existing.totalValue += product.totalPrice
        existing.issueCount += 1
      } else {
        // Get unit from product list if not available
        let unit = product.unit
        if (!unit) {
          const currentProduct = allProducts.find(
            (p) => p.id === product.productId || p.productCode === product.productCode,
          )
          if (currentProduct) {
            unit = currentProduct.unit
          }
        }

        consolidatedMap.set(key, {
          productId: product.productId,
          productCode: product.productCode,
          productName: product.productName,
          unit: unit || "-",
          totalQuantity: product.quantity,
          totalValue: product.totalPrice,
          image: product.image,
          issueCount: 1,
        })
      }
    })
  })

  const consolidatedProducts = Array.from(consolidatedMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity) // Sort by quantity descending

  const totalQuantity = consolidatedProducts.reduce((sum, p) => sum + p.totalQuantity, 0)
  const totalValue = consolidatedProducts.reduce((sum, p) => sum + p.totalValue, 0)

  const formatDate = (d: string) => formatArabicGregorianDate(new Date(d))

  let dateRangeText = "كل الفترات / All Periods"
  if (dateFrom && dateTo) {
    dateRangeText = `من ${formatDate(dateFrom)} إلى ${formatDate(dateTo)}<br><span style="font-size:10px;font-weight:normal">From ${new Date(dateFrom).toLocaleDateString('en-GB')} To ${new Date(dateTo).toLocaleDateString('en-GB')}</span>`
  } else if (dateFrom) {
    dateRangeText = `من ${formatDate(dateFrom)}<br><span style="font-size:10px;font-weight:normal">From ${new Date(dateFrom).toLocaleDateString('en-GB')}</span>`
  } else if (dateTo) {
    dateRangeText = `حتى ${formatDate(dateTo)}<br><span style="font-size:10px;font-weight:normal">Until ${new Date(dateTo).toLocaleDateString('en-GB')}</span>`
  }

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  const pdfContent = `
<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>تقرير الصرف الإجمالي</title>
  <base href="${window.location.origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page {
      size: A4;
      margin: 15mm;
    }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 20px;
      background: white;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 3px solid #dc2626;
      padding-bottom: 15px;
    }
    .header h1 {
      color: #dc2626;
      font-size: 22px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .header-info {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      font-size: 12px;
    }
    .header-info p {
      color: #475569;
    }
    .date-range {
      background: #fef2f2;
      color: #991b1b;
      padding: 8px 15px;
      border-radius: 8px;
      font-weight: bold;
      display: inline-block;
      margin-top: 10px;
      border: 1px solid #fecaca;
    }
    .summary-cards {
      display: flex;
      gap: 15px;
      margin-bottom: 20px;
    }
    .summary-card {
      flex: 1;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card.issues {
      background: #fef3c7;
      border: 1px solid #fcd34d;
    }
    .summary-card.products {
      background: #dbeafe;
      border: 1px solid #93c5fd;
    }
    .summary-card.quantity {
      background: #dcfce7;
      border: 1px solid #86efac;
    }
    .summary-card.value {
      background: #fce7f3;
      border: 1px solid #f9a8d4;
    }
    .summary-card h3 {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .summary-card .value {
      font-size: 18px;
      font-weight: bold;
      color: #1e293b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 10px;
    }
    thead {
      background: #dc2626;
      color: white;
    }
    th {
      padding: 10px 5px;
      text-align: center;
      font-weight: 600;
      font-size: 10px;
      border: 1px solid #b91c1c;
    }
    td {
      padding: 8px 5px;
      border: 1px solid #d1d5db;
      color: #000000;
      text-align: center;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) {
      background: #fef2f2;
    }
    .product-image {
      width: 35px;
      height: 35px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .no-image {
      width: 35px;
      height: 35px;
      background: #f1f5f9;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 7px;
      color: #94a3b8;
      border: 1px solid #e2e8f0;
    }
    .product-name {
      text-align: right;
      font-weight: 500;
      max-width: 180px;
      word-wrap: break-word;
      line-height: 1.3;
    }
    .quantity-cell {
      font-weight: bold;
      font-size: 13px;
      color: #dc2626;
    }
    .value-cell {
      font-weight: bold;
      color: #1e293b;
    }
    .footer-section {
      margin-top: 20px;
      padding: 15px;
      background: #fef2f2;
      border-radius: 8px;
      border: 1px solid #dc2626;
    }
    .footer-row {
      display: flex;
      justify-content: space-between;
      margin: 8px 0;
      font-size: 13px;
    }
    .footer-row.total {
      font-size: 16px;
      font-weight: bold;
      color: #dc2626;
      border-top: 2px solid #dc2626;
      padding-top: 10px;
      margin-top: 10px;
    }
    .signature-section {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      gap: 30px;
    }
    .signature-box {
      flex: 1;
      text-align: center;
      padding: 15px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .signature-line {
      border-top: 2px solid #000;
      margin-top: 40px;
      padding-top: 8px;
      font-size: 11px;
      color: #64748b;
    }
    .page-footer {
      margin-top: 20px;
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }
    @media print {
      body { padding: 10px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
      <img src="${logoUrl}" alt="مستودع ساحة المجد" style="width:48px;height:48px;border-radius:6px;" onerror="this.style.display='none'"/>
      <div>
        <h1>Aggregated invoice of issued products<br><span style="font-size:16px; font-weight:normal;">فاتورة إجمالية للمنتجات المصروفة</span></h1>
        <p>مستودع ساحة المجد / Sahat Almajd Warehouse</p>
      </div>
    </div>
    <div class="subtitle" style="margin-top:5px;">Aggregate totals with filter and search options / تجميع المبالغ مع خيارات التصفية والبحث</div>
    <div class="date-range">${dateRangeText}</div>
    <div class="header-info">
      <p><strong>تاريخ التقرير / Report Date:</strong> ${(lang === "ar" ? formatArabicGregorianDate(new Date()) : new Date().toLocaleDateString("en-GB"))}</p>
      <p><strong>عدد الفواتير / Invoices Count:</strong> ${filteredIssues.length}</p>
    </div>
  </div>

  <div class="summary-cards">
    <div class="summary-card issues">
      <h3>الفواتير / Invoices</h3>
      <div class="value">${filteredIssues.length}</div>
    </div>
    <div class="summary-card products">
      <h3>الأصناف / Items</h3>
      <div class="value">${consolidatedProducts.length}</div>
    </div>
    ${settings.showQuantity ? `
    <div class="summary-card quantity">
      <h3>الكمية / Quantity</h3>
      <div class="value">${totalQuantity}</div>
    </div>
    ` : ''}
    ${settings.showTotal ? `
    <div class="summary-card value">
      <h3>القيمة / Value</h3>
      <div class="value">${totalValue.toFixed(2)}</div>
    </div>
    ` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 35px">#</th>
        <th style="width: 45px">الصورة<br>Image</th>
        <th style="width: 80px">الكود<br>Code</th>
        <th style="min-width: 150px">اسم المنتج<br>Product Name</th>
        ${settings.showUnit ? `<th style="width: 50px">الوحدة<br>Unit</th>` : ''}
        ${settings.showQuantity ? `<th style="width: 70px">الكمية المصروفة<br>Issued Qty</th>` : ''}
        ${settings.showPrice ? `<th style="width: 80px">سعر الوحدة<br>Unit Price</th>` : ''}
        ${settings.showTotal ? `<th style="width: 90px">المجموع الجزئي<br>Subtotal</th>` : ''}
        <th style="width: 60px">عدد مرات الصرف<br>Issue Count</th>
      </tr>
    </thead>
    <tbody>
      ${consolidatedProducts
      .map(
        (product, index) => {
          const unitPrice = product.totalQuantity > 0 ? (product.totalValue / product.totalQuantity) : 0;
          return `
        <tr>
          <td>${index + 1}</td>
          <td>
            ${product.image
              ? `<img src="${product.image}" alt="${product.productName}" class="product-image" />`
              : `<div class="no-image">No Image</div>`
            }
          </td>
          <td>${product.productCode}</td>
          <td class="product-name">${product.productName}</td>
          ${settings.showUnit ? `<td>${product.unit}</td>` : ''}
          ${settings.showQuantity ? `<td class="quantity-cell">${product.totalQuantity}</td>` : ''}
          ${settings.showPrice ? `<td>${unitPrice.toFixed(2)}</td>` : ''}
          ${settings.showTotal ? `<td class="value-cell">${product.totalValue.toFixed(2)}</td>` : ''}
          <td>${product.issueCount}</td>
        </tr>
      `
        },
      )
      .join("")}
    </tbody>
  </table>

  <div class="footer-section">
    <div class="footer-row">
      <span>إجمالي عدد المنتجات / Total Products Count</span>
      <span>${consolidatedProducts.length}</span>
    </div>
    <div class="footer-row">
      <span>إجمالي عدد الفواتير / Total Invoices</span>
      <span>${filteredIssues.length}</span>
    </div>
    ${settings.showQuantity ? `
    <div class="footer-row total">
      <span>إجمالي الكميات المصروفة / Total Issued Qty</span>
      <span>${totalQuantity}</span>
    </div>
    ` : ''}
    ${settings.showTotal ? `
    <div class="footer-row total">
      <span>المجموع الكلي للمبالغ / Grand Total Amount</span>
      <span>${totalValue.toFixed(2)} ريال / SAR</span>
    </div>
    ` : ''}
  </div>

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line">مدير المستودع / Warehouse Manager</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">المدير المالي / Finance Manager</div>
    </div>
  </div>

  <div class="page-footer">
    <p>صفحة / Page <span class="page-count"></span> - ${(lang === "ar" ? formatArabicGregorianDate(new Date()) : new Date().toLocaleDateString("en-GB"))} ${new Date().toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB")}</p>
  </div>

  <script>
    window.onload = function() {
      window.print();
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
