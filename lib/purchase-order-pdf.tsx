import type { PurchaseOrder } from "./storage"
import type { Lang } from "@/lib/i18n"
import { translate } from "@/lib/i18n"
import { formatArabicGregorianDate } from "@/lib/utils"
import { getInvoiceSettings } from "./invoice-settings-store"

export async function generatePurchaseOrderPDF(order: PurchaseOrder, lang: Lang = "ar") {
  const settings = await getInvoiceSettings()
  const dir = lang === "ar" ? "rtl" : "ltr"
  const htmlLang = lang === "ar" ? "ar" : "en"
  const dateStr = lang === "ar"
    ? formatArabicGregorianDate(new Date(order.createdAt))
    : new Date(order.createdAt).toLocaleDateString("en-GB")
  const statusLabel = order.status === "draft"
    ? translate("pdf.purchaseOrder.status.draft", lang)
    : order.status === "submitted"
      ? translate("pdf.purchaseOrder.status.submitted", lang)
      : order.status === "approved"
        ? translate("pdf.purchaseOrder.status.approved", lang)
        : translate("pdf.purchaseOrder.status.completed", lang)
  const pdfContent = `
<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>${translate("pdf.purchaseOrder.title", lang)} ${order.id.slice(-8)}</title>
  <base href="${window.location.origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 40px;
      background: white;
      direction: ${dir};
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #7c3aed;
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header-info {
      display: flex;
      justify-content: space-between;
      margin-top: 15px;
      font-size: 14px;
    }
    .header-info p {
      color: #475569;
    }
    .status-badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 12px;
      background: ${order.status === "draft" ? "#fef3c7" : order.status === "submitted" ? "#dbeafe" : order.status === "approved" ? "#dcfce7" : "#f3e8ff"};
      color: ${order.status === "draft" ? "#92400e" : order.status === "submitted" ? "#1e40af" : order.status === "approved" ? "#166534" : "#7c3aed"};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
      font-size: 12px;
    }
    thead {
      background: #7c3aed;
      color: white;
    }
    th {
      padding: 12px 8px;
      text-align: center;
      font-weight: 600;
    }
    td {
      padding: 10px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #000;
      text-align: center;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) {
      background: #f5f3ff;
    }
    .product-image {
      width: 45px;
      height: 45px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .no-image {
      width: 45px;
      height: 45px;
      background: #f1f5f9;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #94a3b8;
    }
    .product-name {
      text-align: right;
      font-weight: 500;
      max-width: 180px;
    }
    .summary-section {
      margin-top: 25px;
      padding: 20px;
      background: #f5f3ff;
      border-radius: 8px;
      border: 1px solid #7c3aed;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin: 8px 0;
      font-size: 14px;
    }
    .summary-row.total {
      font-size: 18px;
      font-weight: bold;
      color: #7c3aed;
      border-top: 2px solid #7c3aed;
      padding-top: 12px;
      margin-top: 12px;
    }
    .notes-section {
      margin-top: 20px;
      padding: 15px;
      background: #fefce8;
      border-radius: 8px;
      border-right: 4px solid #eab308;
    }
    .notes-section h3 {
      font-size: 14px;
      color: #854d0e;
      margin-bottom: 8px;
    }
    .notes-section p {
      font-size: 13px;
      color: #713f12;
    }
    .signature-section {
      margin-top: 40px;
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
    }
    .signature-line {
      border-top: 2px solid #000;
      margin-top: 50px;
      padding-top: 8px;
      font-size: 12px;
      color: #64748b;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      color: #94a3b8;
      font-size: 11px;
      border-top: 1px solid #e2e8f0;
      padding-top: 15px;
    }
    @media print {
      body { padding: 15px; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${translate("pdf.purchaseOrder.title", lang)}</h1>
    <span class="status-badge">${statusLabel}</span>
    <div class="header-info">
      <p><strong>${translate("pdf.purchaseOrder.orderNo", lang)}</strong> ${order.id.slice(-8)}</p>
      <p><strong>${translate("pdf.common.date", lang)}</strong> ${dateStr}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40px">${translate("pdf.common.headers.index", lang)}</th>
        <th style="width: 55px">${translate("pdf.common.headers.image", lang)}</th>
        <th style="width: 90px">${translate("pdf.common.headers.code", lang)}</th>
        <th>${translate("pdf.common.headers.name", lang)}</th>
        <th style="width: 70px">الوحدة<br>Unit</th>
        <th style="width: 90px">الكمية المطلوبة<br>Requested Qty</th>
        <th style="width: 90px">الكمية المتبقية<br>Remaining Qty</th>
      </tr>
    </thead>
    <tbody>
      ${order.items
      .map(
        (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>
            ${item.image ? `<img src="${item.image}" alt="${item.productName}" class="product-image" />` : `<div class="no-image">${translate("pdf.common.noImage", lang)}</div>`}
          </td>
          <td>${item.productCode}</td>
          <td class="product-name">${item.productName}</td>
          <td>${item.unit || '-'}</td>
          <td style="font-weight: bold; color: #7c3aed;">${item.requestedQuantity}</td>
          <td>${item.availableQuantity}</td>
        </tr>
      `,
      )
      .join("")}
    </tbody>
  </table>

  <div class="summary-section">
    <div class="summary-row">
      <span>${translate("pdf.common.totals.totalItems", lang)}</span>
      <span>${order.items.length}</span>
    </div>
    <div class="summary-row total">
      <span>${translate("pdf.purchaseOrder.totalRequestedQty", lang)}</span>
      <span>${order.items.reduce((sum, item) => sum + item.requestedQuantity, 0)}</span>
    </div>
  </div>

  ${order.notes
      ? `
  <div class="notes-section">
    <h3>${translate("pdf.common.notes", lang)}</h3>
    <p>${order.notes}</p>
  </div>
  `
      : ""
    }

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line">${translate("pdf.purchaseOrder.signature.preparer", lang)}</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">${translate("pdf.purchaseOrder.signature.manager", lang)}</div>
    </div>
  </div>

  <div class="footer">
    <p>${translate("pdf.purchaseOrder.footer.system", lang)}</p>
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
