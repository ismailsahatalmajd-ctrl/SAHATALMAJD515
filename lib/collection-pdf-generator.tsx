import type { Issue } from "./types"
import { getProducts } from "@/lib/storage"
import type { Lang } from "@/lib/i18n"
import { translate } from "@/lib/i18n"
import { formatArabicGregorianDate } from "@/lib/utils"
import { getInvoiceSettings } from "./invoice-settings-store"

interface CollectionInvoiceOptions {
  extractorName?: string
  inspectorName?: string
  lang?: Lang
}

export async function generateCollectionPDF(issue: Issue, options: CollectionInvoiceOptions = {}) {
  const settings = await getInvoiceSettings()
  const allProducts = getProducts()
  const { extractorName = "", inspectorName = "", lang = "ar" } = options

  const dir = lang === "ar" ? "rtl" : "ltr"
  const htmlLang = lang === "ar" ? "ar" : "en"
  const dateStr = lang === "ar"
    ? formatArabicGregorianDate(new Date(issue.createdAt), { year: "numeric", month: "long", day: "numeric" })
    : new Date(issue.createdAt).toLocaleDateString("en-GB")

  const pdfContent = `
<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>${translate("pdf.collection.title", lang)} ${issue.id.slice(-8)}</title>
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
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 3px solid #059669;
      padding-bottom: 15px;
    }
    .header h1 {
      color: #059669;
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header-info {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      font-size: 13px;
    }
    .header-info p {
      color: #475569;
    }
    .branch-badge {
      background: #059669;
      color: white;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      display: inline-block;
      margin-top: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 11px;
    }
    thead {
      background: #059669;
      color: white;
    }
    th {
      padding: 10px 5px;
      text-align: center;
      font-weight: 600;
      font-size: 11px;
      border: 1px solid #047857;
    }
    td {
      padding: 8px 5px;
      border: 1px solid #d1d5db;
      color: #000000;
      text-align: center;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) {
      background: #f0fdf4;
    }
    .product-image {
      width: 40px;
      height: 40px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .no-image {
      width: 40px;
      height: 40px;
      background: #f1f5f9;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #94a3b8;
      border: 1px solid #e2e8f0;
    }
    .product-name {
      text-align: right;
      font-weight: 500;
      max-width: 150px;
      word-wrap: break-word;
      line-height: 1.3;
    }
    .checkbox-cell {
      width: 30px;
    }
    .checkbox {
      width: 20px;
      height: 20px;
      border: 2px solid #000;
      display: inline-block;
      border-radius: 3px;
    }
    .empty-cell {
      min-width: 50px;
      height: 30px;
    }
    .quantity-cell {
      font-weight: bold;
      font-size: 14px;
      color: #000;
    }
    .footer-section {
      margin-top: 20px;
      padding: 15px;
      background: #f0fdf4;
      border-radius: 8px;
      border: 1px solid #059669;
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
      color: #059669;
      border-top: 2px solid #059669;
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
    .signature-box h4 {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .signature-box .name {
      font-size: 14px;
      font-weight: bold;
      color: #1e293b;
      min-height: 20px;
    }
    .signature-line {
      border-top: 2px solid #000;
      margin-top: 40px;
      padding-top: 8px;
      font-size: 11px;
      color: #64748b;
    }
    .page-number {
      position: fixed;
      bottom: 10mm;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: #94a3b8;
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
    <h1>${translate("pdf.collection.title", lang)}</h1>
    <div class="header-info">
      <p><strong>${translate("pdf.common.invoiceNo", lang)}</strong> ${issue.id.slice(-8)}</p>
      <p><strong>${translate("pdf.common.date", lang)}</strong> ${dateStr}</p>
    </div>
    <div class="branch-badge">${issue.branchName}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 35px">${translate("pdf.collection.headers.index", lang)}</th>
        <th style="width: 50px">${translate("pdf.collection.headers.image", lang)}</th>
        <th style="width: 80px">${translate("pdf.collection.headers.code", lang)}</th>
        <th style="min-width: 120px">${translate("pdf.collection.headers.name", lang)}</th>
        ${settings.showUnit ? `<th style="width: 50px">${translate("pdf.collection.headers.unit", lang)}</th>` : ''}
        ${settings.showQuantity ? `<th style="width: 60px">${translate("pdf.collection.headers.qty", lang)}</th>` : ''}
        <th style="width: 60px">${translate("pdf.collection.headers.actualCount", lang)}</th>
        <th style="width: 50px">${translate("pdf.collection.headers.extractMark", lang)}</th>
        <th style="width: 50px">${translate("pdf.collection.headers.inspectMark", lang)}</th>
      </tr>
    </thead>
    <tbody>
      ${issue.products
      .map((product, index) => {
        let unit = product.unit
        if (!unit) {
          const currentProduct = allProducts.find(
            (p) => p.id === product.productId || p.productCode === product.productCode,
          )
          if (currentProduct) {
            unit = currentProduct.unit
          }
        }

        return `
        <tr>
          <td>${index + 1}</td>
          <td>
            ${product.image
            ? `<img src="${product.image}" alt="${product.productName}" class="product-image" />`
            : `<div class="no-image">${translate("pdf.common.noImage", lang)}</div>`
          }
          </td>
          <td>${product.productCode}</td>
          <td class="product-name">${product.productName}</td>
          ${settings.showUnit ? `<td>${unit || "-"}</td>` : ''}
          ${settings.showQuantity ? `<td class="quantity-cell">${product.quantity}</td>` : ''}
          <td class="empty-cell"></td>
          <td class="checkbox-cell"><div class="checkbox"></div></td>
          <td class="checkbox-cell"><div class="checkbox"></div></td>
        </tr>
      `
      })
      .join("")}
    </tbody>
  </table>

  <div class="footer-section">
    <div class="footer-row">
      <span>${translate("pdf.collection.totalItems", lang)}</span>
      <span>${issue.products.length}</span>
    </div>
    ${settings.showQuantity ? `
    <div class="footer-row total">
      <span>${translate("pdf.collection.totalRequestedQty", lang)}</span>
      <span>${issue.products.reduce((sum, p) => sum + p.quantity, 0)}</span>
    </div>
    ` : ''}
  </div>

  <div class="signature-section">
    <div class="signature-box">
      <h4>${translate("pdf.collection.extractor", lang)}</h4>
      <div class="name">${extractorName || ""}</div>
      <div class="signature-line">${translate("pdf.common.signature", lang)}</div>
    </div>
    <div class="signature-box">
      <h4>${translate("pdf.collection.inspector", lang)}</h4>
      <div class="name">${inspectorName || ""}</div>
      <div class="signature-line">${translate("pdf.common.signature", lang)}</div>
    </div>
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
