import type { PurchaseRequest } from "./purchase-request-types"
import { getProducts } from "@/lib/storage"
import { formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber, getSafeImageSrc } from "@/lib/utils"
import type { Lang } from "@/lib/i18n"
import { translate } from "@/lib/i18n"
import { getInvoiceSettings } from "./invoice-settings-store"

import type { Product } from "@/lib/types"

import { db } from "@/lib/db"

export async function generatePurchaseRequestPDF(req: PurchaseRequest, lang: Lang = "ar", productsList?: Product[]) {
  const settings = getInvoiceSettings()
  const allProducts = productsList || getProducts()
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'
  const requestNumber = req.requestNumber || getNumericInvoiceNumber(req.id, new Date(req.createdAt))
  const dateStr = lang === "ar"
    ? formatArabicGregorianDate(new Date(req.createdAt), { year: "numeric", month: "long", day: "numeric" })
    : new Date(req.createdAt).toLocaleDateString("en-GB")
  const timeStr = lang === "ar"
    ? formatArabicGregorianTime(new Date(req.createdAt))
    : new Date(req.createdAt).toLocaleTimeString("en-GB")
  const dir = lang === "ar" ? "rtl" : "ltr"
  const htmlLang = lang === "ar" ? "ar" : "en"
  const statusLabel = req.status === "draft"
    ? translate("purchaseRequests.status.draft", lang)
    : req.status === "submitted"
      ? translate("purchaseRequests.status.submitted", lang)
      : req.status === "received"
        ? translate("purchaseRequests.status.received", lang)
        : req.status

  const dateStrEn = new Date(req.createdAt).toLocaleDateString("en-GB")
  const timeStrEn = new Date(req.createdAt).toLocaleTimeString("en-GB")

  // Resolve images beforehand
  const itemsWithImages = await Promise.all(req.items.map(async (item) => {
    const p = allProducts.find(pp => pp.productCode === item.productCode || pp.id === item.productId)
    let img = getSafeImageSrc(item.image || (p ? p.image : undefined))

    // Check for DB_IMAGE
    const rawImage = item.image || (p ? p.image : undefined)
    if (rawImage === 'DB_IMAGE' && p) {
      try {
        const rec = await db.productImages.get(p.id)
        if (rec?.data) img = rec.data
      } catch { }
    }

    return { ...item, productRef: p, finalImage: img }
  }))

  const pdfContent = `
<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <title>Purchase Request #${req.requestNumber}</title>
  <base href="${window.location.origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background: white; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
    .header h1 { color: #2563eb; font-size: 32px; margin-bottom: 10px; }
    .header p { color: #64748b; font-size: 14px; }
    .info-section { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
    .info-box { background: #f8fafc; padding: 20px; border-radius: 8px; border-right: 4px solid #2563eb; }
    .info-box h3 { color: #1e293b; font-size: 14px; margin-bottom: 10px; font-weight: 600; }
    .info-box p { color: #475569; font-size: 16px; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    thead { background: #2563eb; color: white; }
    th { padding: 15px; text-align: right; font-weight: 600; font-size: 14px; }
    td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    tbody tr:hover { background: #f8fafc; }
    .total-section { margin-top: 30px; text-align: left; background: #f8fafc; padding: 20px; border-radius: 8px; }
    .total-row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 18px; }
    .status { margin-top: 10px; font-weight: 600; color: #2563eb; }
    @media print { body { padding: 20px; } }
  </style>
  </head>
  <body>
    <div class="header">
      <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
        <img src="${logoUrl}" alt="المخزن" style="width:48px;height:48px;border-radius:6px;" onerror="this.style.display='none'"/>
        <div>
          <h1>طلب شراء<br><span style="font-size:20px; font-weight:normal;">Purchase Request</span></h1>
          <p>إدارة طلبات الشراء / Purchase Requests Management</p>
        </div>
      </div>
    </div>

    <div class="info-section">
      <div class="info-box">
        <h3>معلومات الطلب / Request Info</h3>
        <p><strong>رقم الطلب / Request No:</strong> ${requestNumber}</p>
        <p><strong>الحالة / Status:</strong> ${statusLabel}</p>
        <p><strong>التاريخ / Date:</strong> ${dateStr} - ${dateStrEn}</p>
        <p><strong>الوقت / Time:</strong> ${timeStr} - ${timeStrEn}</p>
      </div>
      <div class="info-box">
        <h3>ملاحظات / Notes</h3>
        <p>${req.notes ? req.notes : '-'}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 50px">#</th>
          <th>الصورة<br>Image</th>
          <th>كود المنتج<br>Product Code</th>
          <th>اسم المنتج<br>Product Name</th>
          <th>الوحدة<br>Unit</th>
          <th>الكمية المطلوبة<br>Requested Qty</th>
          <th>الكمية المتبقية<br>Remaining Qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemsWithImages.map((item, index) => {
    const p = item.productRef
    const unit = item.unit || (p ? p.unit : '')
    const img = item.finalImage
    return `
            <tr>
              <td>${formatEnglishNumber(index + 1)}</td>
              <td>
                ${img ? `<img src="${img}" alt="${item.productName}" style="width:40px;height:40px;object-fit:cover;border-radius:6px" onerror="this.style.display='none'"/>` : `<div style="width:40px;height:40px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;border:1px solid #e2e8f0;">${translate("pdf.common.noImage", lang)}</div>`}
              </td>
              <td>${item.productCode}</td>
              <td><strong>${item.productName}</strong></td>
              <td>${unit || '-'}</td>
              <td>${formatEnglishNumber(item.requestedQuantity)}</td>
              <td>${formatEnglishNumber(item.availableQuantity ?? 0)}</td>
            </tr>
          `
  }).join("")}
      </tbody>
    </table>

    <div class="total-section">
      <div class="total-row"><span>عدد الأصناف / Items Count:</span><span>${formatEnglishNumber(req.items.length)}</span></div>
      <div class="total-row"><span>إجمالي الكمية المطلوبة / Total Requested Qty:</span><span>${formatEnglishNumber(req.items.reduce((s, i) => s + i.requestedQuantity, 0))}</span></div>
      <div class="status">الحالة / Status: ${statusLabel}</div>
    </div>

    <div class="footer" style="margin-top:30px; text-align:center; color:#94a3b8; font-size:12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
    </div>
  </body>
  </html>
  `

  const printWindow = window.open("", "_blank")
  if (!printWindow) return
  printWindow.document.write(pdfContent)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => { printWindow.print() }, 300)
}