"use client"

import type { Transaction, Product } from "./types"
import type { Lang } from "@/lib/i18n"
import { translate } from "@/lib/i18n"
import { formatArabicGregorianDateTime } from "@/lib/utils"
import { getInvoiceSettings } from "./invoice-settings-store"
import { getProducts } from "./storage"

export async function generatePurchaseTransactionPDF(transactions: Transaction[], lang: Lang = "ar") {
    if (transactions.length === 0) return

    const settings = await getInvoiceSettings()
    const products = getProducts()
    const firstTx = transactions[0]
    const dir = lang === "ar" ? "rtl" : "ltr"
    const htmlLang = lang === "ar" ? "ar" : "en"

    const dateStr = formatArabicGregorianDateTime(new Date(firstTx.createdAt))
    const operationNo = firstTx.operationNumber || firstTx.id.slice(-6)

    const totalAmount = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0)
    const totalQty = transactions.reduce((sum, tx) => sum + tx.quantity, 0)

    const pdfContent = `
<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>فاتورة مشتريات / Purchase Invoice #${operationNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', 'Segoe UI', serif; }
    body { padding: 30px; background: white; color: #1e293b; }
    
    .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
    .company-logo { font-size: 24px; font-weight: 800; color: #1e3a8a; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { color: #3b82f6; font-size: 22px; margin-bottom: 5px; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 13px; }
    .info-box { padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .info-label { color: #64748b; font-weight: 600; margin-bottom: 4px; display: block; }
    .info-value { color: #0f172a; font-weight: 700; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
    th { background: #3b82f6; color: white; padding: 12px 8px; text-align: center; }
    td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; }
    tr:nth-child(even) { background: #f1f5f9; }
    
    .product-cell { text-align: right; font-weight: 600; }
    .image-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; }
    
    .totals-section { display: flex; justify-content: flex-end; }
    .totals-table { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .totals-row.grand-total { border-bottom: none; color: #3b82f6; font-size: 16px; font-weight: 800; padding-top: 15px; }

    .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    
    @media print {
      body { padding: 0px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-logo">SAHAT AL MAJD / ساحة المجد</div>
    <div class="invoice-title">
      <h1>فاتورة مشتريات</h1>
      <p>Purchase Invoice</p>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <span class="info-label">المورد / Supplier</span>
      <span class="info-value">${firstTx.supplierName || "---"}</span>
    </div>
    <div class="info-box">
      <span class="info-label">رقم العملية / Operation No.</span>
      <span class="info-value">#${operationNo}</span>
    </div>
    <div class="info-box">
      <span class="info-label">تاريخ الفاتورة / Date</span>
      <span class="info-value">${dateStr}</span>
    </div>
    <div class="info-box">
      <span class="info-label">رقم فاتورة المورد / Supplier Inv No.</span>
      <span class="info-value">${firstTx.supplierInvoiceNumber || "---"}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 50px">#</th>
        <th style="width: 60px">صورة / Image</th>
        <th>المنتج / Product</th>
        <th style="width: 80px">الوحدة / Unit</th>
        <th style="width: 60px">الكمية / Qty</th>
        <th style="width: 100px">السعر / Unit Price</th>
        <th style="width: 120px">الإجمالي / Total</th>
      </tr>
    </thead>
    <tbody>
      ${transactions.map((tx, idx) => {
        const prod = products.find(p => p.id === tx.productId)
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>
              ${prod?.image ? `<img src="${prod.image}" class="image-thumb" />` : '-'}
            </td>
            <td class="product-cell">
              <div>${tx.productName}</div>
              <div style="font-size: 10px; color: #64748b; font-weight: normal;">${prod?.productCode || ""}</div>
            </td>
            <td>${prod?.unit || '-'}</td>
            <td style="font-weight: 700;">${tx.quantity}</td>
            <td>${tx.unitPrice.toFixed(2)}</td>
            <td style="font-weight: 700; color: #1e3a8a;">${tx.totalAmount.toFixed(2)}</td>
          </tr>
        `
    }).join('')}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-table">
      <div class="totals-row">
        <span>إجمالي الكمية / Total Qty:</span>
        <span style="font-weight: 700;">${totalQty}</span>
      </div>
      <div class="totals-row grand-total">
        <span>الإجمالي النهائي / Grand Total:</span>
        <span>${totalAmount.toFixed(2)} SAR</span>
      </div>
    </div>
  </div>

  <div class="footer">
    ${settings.footerText ? `<p style="margin-bottom: 10px;">${settings.footerText}</p>` : ''}
    <p>تم استخراج هذا المستند آلياً من نظام ساحة المجد</p>
    <p>Generated by Sahat Al Majd System</p>
  </div>

  <script>
    window.onload = function() {
      // window.print();
    }
  </script>
</body>
</html>
  `

    const printWindow = window.open("", "_blank")
    if (printWindow) {
        printWindow.document.write(pdfContent)
        printWindow.document.close()
        // Give time for images to load before printing
        setTimeout(() => {
            printWindow.print()
        }, 500)
    }
}
