import type { Return } from "./types"
import { getProducts } from "@/lib/storage"
import { formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber, getSafeImageSrc } from "@/lib/utils"
import { getInvoiceSettings } from "./invoice-settings-store"
import { db } from "@/lib/db"

export async function generateReturnPDF(ret: Return) {
  const settings = await getInvoiceSettings()
  const allProducts = getProducts()
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'
  const stampUrl = ret.stampImageUrl || (typeof window !== 'undefined' ? `${window.location.origin}/placeholder-logo.png` : '/placeholder-logo.png')

  const returnNumber = ret.returnNumber || getNumericInvoiceNumber(ret.id, new Date(ret.createdAt))
  const dateStr = formatArabicGregorianDate(new Date(ret.createdAt), { year: "numeric", month: "long", day: "numeric" })
  const timeStr = formatArabicGregorianTime(new Date(ret.createdAt))

  const dateStrEn = new Date(ret.createdAt).toLocaleDateString('en-GB')
  const timeStrEn = new Date(ret.createdAt).toLocaleTimeString('en-GB')

  // Resolve images from DB
  const productsWithImages = await Promise.all(ret.products.map(async (p) => {
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
        console.error("Failed to load image for return PDF", e)
        imgSrc = ""
      }
    } else if (p.image) {
      imgSrc = getSafeImageSrc(p.image)
    }
    return { ...p, resolvedImage: imgSrc }
  }))

  // Create PDF content as Arabic HTML
  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة مرتجع ${returnNumber}</title>
  <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
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
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
    }
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
    .total-row.grand { font-size: 24px; font-weight: bold; color: #2563eb; border-top: 2px solid #cbd5e1; padding-top: 15px; margin-top: 15px; }
    .sign-section { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 40px; }
    .sign-box { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; min-height: 140px; }
    .sign-title { color: #64748b; font-size: 14px; margin-bottom: 10px; }
    .stamp-img { width: 100px; height: 100px; object-fit: contain; opacity: 0.7; }
    .footer { margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    @media print {
      body { padding: 20px; }
      .info-section { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
      <img src="${logoUrl}" alt="مستودع ساحة المجد" style="width:48px;height:48px;border-radius:6px;" onerror="this.style.display='none'"/>
      <div>
        <h1>فاتورة مرتجع<br><span style="font-size: 20px; font-weight: normal;">Return Invoice</span></h1>
        <p>مستودع ساحة المجد / Sahat Almajd Warehouse</p>
      </div>
    </div>
  </div>

  <div class="info-section">
    <div class="info-box">
      <h3>معلومات الفاتورة / Invoice Information</h3>
      <p><strong>رقم فاتورة المرتجع / Return Invoice No:</strong> ${returnNumber}</p>
      <p><strong>التاريخ / Date:</strong> ${dateStr} - ${dateStrEn}</p>
      <p><strong>الوقت / Time:</strong> ${timeStr} - ${timeStrEn}</p>
      ${ret.originalInvoiceNumber ? `<p><strong>رقم الفاتورة الأصلية / Original Invoice No:</strong> ${ret.originalInvoiceNumber}</p>` : ""}
    </div>
    <div class="info-box">
      <h3>معلومات العميل / Customer Information</h3>
      ${ret.customerName ? `<p><strong>الاسم / Name:</strong> ${ret.customerName}</p>` : `<p><strong>الاسم / Name:</strong> -</p>`}
      ${ret.customerPhone ? `<p><strong>الجوال / Mobile:</strong> ${ret.customerPhone}</p>` : `<p><strong>الجوال / Mobile:</strong> -</p>`}
      <p><strong>الفرع / Branch:</strong> ${ret.branchName}</p>
      <p><strong>طريقة الاسترداد / Refund Method:</strong> ${ret.refundMethod ? ret.refundMethod : '-'}</p>
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
        <th>الكمية<br>Quantity</th>
        <th>سعر الوحدة<br>Unit Price</th>
        <th>الإجمالي<br>Total</th>
        <th>السبب<br>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${productsWithImages
      .map((product, index) => {
        let unit = product.unit
        if (!unit) {
          const currentProduct = allProducts.find(p => p.id === product.productId || p.productCode === product.productCode)
          if (currentProduct) unit = currentProduct.unit
        }
        return `
        <tr>
          <td>${formatEnglishNumber(index + 1)}</td>
          <td>
            ${product.resolvedImage
            ? `<img src="${product.resolvedImage}" alt="${product.productName}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #e2e8f0;" />`
            : '<div style="width:50px;height:50px;background:#f1f5f9;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;border:1px solid #e2e8f0;">لا صورة</div>'
          }
          </td>
          <td>${product.productCode}</td>
          <td><strong>${product.productName}</strong></td>
          <td>${unit || "-"}</td>
          <td class="qty-cell" style="color:black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${product.quantity}</td>
          <td>${formatEnglishNumber(product.unitPrice.toFixed(2))} ريال</td>
          <td><strong>${formatEnglishNumber((product.totalPrice || product.unitPrice * product.quantity).toFixed(2))} ريال</strong></td>
          <td>${ret.reason}</td>
        </tr>
      `
      })
      .join("")}
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-row"><span>عدد المنتجات / Products Count:</span><span>${formatEnglishNumber(ret.products.length)}</span></div>
    <div class="total-row"><span>إجمالي القيمة / Total Value:</span><span>${formatEnglishNumber(ret.totalValue.toFixed(2))} ريال / SAR</span></div>
    <div class="total-row grand"><span>الإجمالي / Total:</span><span>${formatEnglishNumber(ret.totalValue.toFixed(2))} ريال / SAR</span></div>
  </div>

  <div class="sign-section">
    <div class="sign-box">
      <div class="sign-title">ختم / Stamp</div>
    </div>
    <div class="sign-box">
      <div class="sign-title">توقيع المسؤول / Manager Signature</div>
      ${ret.responsibleName ? `<p style="margin-top:10px; color:#1e293b; font-weight:600">${ret.responsibleName}</p>` : ''}
      ${ret.signatureImage ? `<img src="${ret.signatureImage}" alt="توقيع" style="width:180px;height:80px;object-fit:contain;" />` : '<p style="color:#94a3b8">______________________________</p>'}
    </div>
  </div>

  <div class="footer">
  </div>
</body>
</html>
`

  const printWindow = window.open("", "_blank")
  if (!printWindow) return
  printWindow.document.write(pdfContent)
  printWindow.document.close()
  printWindow.focus()
  // Delay print to ensure resources load
  setTimeout(() => {
    printWindow.print()
  }, 300)
}