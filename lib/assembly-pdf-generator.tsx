import type { Issue } from "./types"
import { getNumericInvoiceNumber, formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber } from "./utils"

import { getInvoiceSettings } from "./invoice-settings-store"


import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

// فاتورة تجميع للمستودع (قابلة للطباعة)
// تعتمد على بيانات عملية الصرف كأمر التجميع (قائمة الالتقاط)
export async function generateAssemblyPDF(issue: Issue) {
  const settings = await getInvoiceSettings()
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'
  const dateStr = formatArabicGregorianDate(new Date(issue.createdAt), { year: "numeric", month: "long", day: "numeric" })
  const timeStr = formatArabicGregorianTime(new Date(issue.createdAt))
  const invoiceNumber = getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))
  const totalItems = issue.products.length
  const totalRequestedQty = issue.products.reduce((sum, p) => sum + p.quantity, 0)

  // Resolve images
  const productsWithImages = await Promise.all(issue.products.map(async (p) => {
    let imgSrc = p.image || ""
    if (p.image === 'DB_IMAGE') {
      try {
        const rec = await db.productImages.get(p.productId)
        if (rec && rec.data) {
          imgSrc = getSafeImageSrc(rec.data)
        } else {
          imgSrc = ""
        }
      } catch (e) {
        imgSrc = ""
      }
    } else if (p.image) {
      imgSrc = getSafeImageSrc(p.image)
    }
    // Fallback placeholder logic was in original code map
    return { ...p, resolvedImage: imgSrc }
  }))

  const rowsHtml = productsWithImages
    .map((p, idx) => {
      const imgSrc = p.resolvedImage ? p.resolvedImage : (typeof window !== 'undefined' ? `${window.location.origin}/placeholder-logo.png` : '/placeholder-logo.png')
      return `
      <tr>
        <td class="row-index">${idx + 1}</td>
        <td class="image-cell"><img src="${imgSrc}" alt="${p.productName}" onerror="this.style.display='none'"/></td>
        <td>${p.productCode || '-'}</td>
        <td class="name-cell">${p.productName}</td>
        <td>${p.unit || '-'}</td>
        <td class="qty-cell">${formatEnglishNumber(p.quantity)}</td>
        <td class="actual-extract"></td>
        <td class="check-cell"><span class="checkbox"></span></td>
        <td class="inspect-mark"><span class="checkbox"></span></td>
      </tr>`
    })
    .join("")

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة تجميع للمستودع ${invoiceNumber}</title>
  <base href="${window.location.origin}/">
  <base href="${window.location.origin}/">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; color: #0f172a; padding: 28px; }
    .header { border-bottom: 3px solid #2563eb; padding-bottom: 14px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; }
    .title-group { display: flex; align-items: center; gap: 10px; }
    .title { color: #2563eb; font-size: 24px; font-weight: 700; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: 13px; color: #334155; }
    .info-section { background: #f8fafc; border-right: 4px solid #2563eb; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: right; font-size: 13px; }
    thead th { background: #f1f5f9; font-weight: 600; }
    .row-index { width: 36px; text-align: center; color: #475569; }
    .image-cell img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
    .name-cell { max-width: 260px; }
    .checkbox { display: inline-block; width: 16px; height: 16px; border: 1px solid #94a3b8; border-radius: 3px; }
    .qty-cell { color: #000 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .footer { margin-top: 16px; page-break-inside: avoid; }
    .footer-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .totals { background: #f8fafc; border-radius: 8px; padding: 12px; border-right: 4px solid #22c55e; }
    .names { background: #f8fafc; border-radius: 8px; padding: 12px; border-right: 4px solid #2563eb; }
    .names p { margin: 6px 0; }
    .notes { margin-top: 10px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px; min-height: 80px; }
    .page-footer { margin-top: 14px; text-align: center; color: #94a3b8; font-size: 12px; }
    @page { size: A4; margin: 18mm; }
    @media print {
      body { padding: 0; }
      .page-count::after { content: counter(page) " / " counter(pages); }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
  </head>
  <body>
    <div class="header">
      <div class="title-group">
        <img src="${logoUrl}" alt="ساحة المجد" style="width:48px;height:48px;border-radius:6px;object-fit:contain;" onerror="this.style.display='none'"/>
        <div class="title">فاتورة تجميع للمستودع<br><span style="font-size:16px; font-weight:normal;">Warehouse Assembly Invoice</span></div>
      </div>
      <div class="meta">
        <div><strong>رقم الفاتورة / Invoice No:</strong> ${invoiceNumber}</div>
        <div><strong>التاريخ / Date:</strong> ${dateStr} - ${timeStr}</div>
        <div><strong>الفرع / Branch:</strong> ${issue.branchName}</div>
      </div>
    </div>

    <div class="info-section">
      <div class="info-grid">
        <div><strong>عدد الأصناف / Items Count:</strong> ${formatEnglishNumber(totalItems)}</div>
        <div><strong>إجمالي الكميات المطلوبة / Total Requested Qty:</strong> ${formatEnglishNumber(totalRequestedQty)}</div>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>الصورة<br>Image</th>
          <th>الكود<br>Code</th>
          <th>اسم المنتج<br>Product Name</th>
          <th>الوحدة<br>Unit</th>
          <th>الكمية المطلوبة<br>Requested Qty</th>
          <th>العدد الفعلي المستخرج<br>Actual Extracted Qty</th>
          <th>علامة استخراج<br>Extraction Mark</th>
          <th>علامة فحص<br>Check Mark</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="footer">
      <div class="footer-grid">
        <div class="totals">
          <p><strong>إجمالي عدد الأصناف / Total Items:</strong> ${formatEnglishNumber(totalItems)}</p>
          <p><strong>إجمالي الكميات المطلوبة / Total Requested Qty:</strong> ${formatEnglishNumber(totalRequestedQty)}</p>
        </div>
        <div class="names">
          <p><strong>اسم مستخرج المنتجات / Product Extractor Name:</strong> ${issue.extractorName || "______________________________"}</p>
          <p><strong>اسم الفاحص / Inspector Name:</strong> ${issue.inspectorName || "______________________________"}</p>
        </div>
      </div>
      <div class="notes">
        <strong>ملاحظات / Notes:</strong>
        <div style="margin-top:8px; color:#64748b;">______________________________________________</div>
      </div>
      <div class="page-footer">
        صفحة / Page <span class="page-count"></span>
      </div>
    </div>

  </body>
  </html>
  `

  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
