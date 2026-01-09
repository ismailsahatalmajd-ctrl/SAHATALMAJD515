import type { Return } from "./types"
import { getProducts } from "@/lib/storage"
import { formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber } from "@/lib/utils"
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

  // Create PDF content as Arabic HTML
  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة مرتجع ${returnNumber}</title>
  <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
  <style>
    /* Template Base Styles */
    :root {
      /* Classic uses #2563eb (Original). Modern uses #3b82f6. Thermal uses Black. */
      --primary: ${settings.template === 'modern' ? '#3b82f6' : (settings.template === 'thermal' ? '#000' : '#2563eb')};
      --bg-header: ${settings.template === 'modern' ? '#eff6ff' : (settings.template === 'thermal' ? '#fff' : '#2563eb')};
      --text-header: ${settings.template === 'modern' ? '#1e40af' : (settings.template === 'thermal' ? '#000' : '#fff')};
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: ${settings.template === 'thermal' ? '10px' : '40px'};
      background: white;
      width: ${settings.template === 'thermal' ? '80mm' : 'auto'};
      margin: ${settings.template === 'thermal' ? '0 auto' : '0'};
    }

    /* Template: Classic (Restored Original) */
    ${settings.template === 'classic' ? `
      .header { border-bottom: 3px solid #2563eb; }
      .header h1 { color: #2563eb; }
      .info-box { border-right: 4px solid #2563eb; background: #f8fafc; }
      thead { background: #2563eb; color: white; }
      .total-row.grand { color: #2563eb; border-top: 2px solid #cbd5e1; }
    ` : ''}

    /* Template: Modern */
    ${settings.template === 'modern' ? `
      .header { border-bottom: none; background: var(--bg-header); padding: 30px; border-radius: 12px; margin-bottom: 30px; }
      .header h1 { color: var(--primary); }
      .info-box { background: white; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
      .info-box h3 { color: var(--primary); }
      table { border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; }
      thead { background: var(--bg-header); color: var(--text-header); }
      th { font-weight: 800; }
      tr:nth-child(even) { background-color: #f8fafc; }
    ` : ''}

    /* Template: Thermal */
    ${settings.template === 'thermal' ? `
      .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
      .header h1 { font-size: 18px; margin-bottom: 5px; }
      .header p { font-size: 12px; }
      .info-section { display: block; margin-bottom: 10px; }
      .info-box { padding: 5px; margin-bottom: 5px; border: none; background: transparent; }
      .info-box h3 { font-size: 12px; border-bottom: 1px solid #eee; margin-bottom: 2px; }
      .info-box p { font-size: 12px; margin: 2px 0; }
      table { margin: 10px 0; font-size: 11px; width: 100%; }
      th, td { padding: 4px 2px; border: none; border-bottom: 1px dashed #ddd; text-align: center; }
      thead { background: transparent; color: black; border-bottom: 1px solid #000; }
      .product-image { display: none; } /* Hide images in thermal */
      .total-section { padding: 10px; border: 1px dashed #000; margin-top: 10px; }
      .total-row { font-size: 12px; }
      .total-row.grand { font-size: 16px; border-top: 1px dashed #000; }
      .footer { font-size: 10px; margin-top: 10px; }
      .sign-section { display: none; } /* No signature space on thermal usually */
    ` : ''}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
      <img src="${logoUrl}" alt="مستودع ساحة المجد" style="width:48px;height:48px;border-radius:6px;" onerror="this.style.display='none'"/>
      <div>
        <h1>فاتورة مرتجع<br><span style="font-size: 20px; font-weight: normal;">Return Invoice</span></h1>
        ${settings.headerText ? `<p style="white-space: pre-line; margin-top: 5px;">${settings.headerText}</p>` : `<p>مستودع ساحة المجد / Sahat Almajd Warehouse</p>`}
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
        <th style="width: 60px">الصورة<br>Image</th>
        <th>كود المنتج<br>Product Code</th>
        <th>اسم المنتج<br>Product Name</th>
        ${settings.showUnit ? `<th>الوحدة<br>Unit</th>` : ''}
        ${settings.showQuantity ? `<th>الكمية<br>Quantity</th>` : ''}
        ${settings.showPrice ? `<th>سعر الوحدة<br>Unit Price</th>` : ''}
        ${settings.showTotal ? `<th>الإجمالي<br>Total</th>` : ''}
        <th>السبب<br>Reason</th>
      </tr>
    </thead>
    <tbody>
    <tbody>
      ${(await Promise.all(ret.products.map(async (product, index) => {
    let unit = product.unit
    let finalImage = product.image

    // Try to resolve data from allProducts if missing in the line item
    const currentProduct = allProducts.find(p => p.id === product.productId || p.productCode === product.productCode)
    if (currentProduct) {
      if (!unit) unit = currentProduct.unit
      if (!finalImage) finalImage = currentProduct.image
    }

    // Resolve DB_IMAGE
    if (finalImage === 'DB_IMAGE') {
      try {
        const imgData = await db.productImages.get(product.productId || currentProduct?.id || '')
        if (imgData) finalImage = imgData.data
      } catch (e) {
        console.error("Failed to load image for print", e)
      }
    }

    const imageSrc = finalImage ? (finalImage.startsWith('data:') || finalImage.startsWith('http') ? finalImage : typeof window !== 'undefined' ? `${window.location.origin}${finalImage}` : finalImage) : '';

    return `
        <tr>
          <td>${formatEnglishNumber(index + 1)}</td>
          <td>${imageSrc ? `<img src="${imageSrc}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">` : ''}</td>
          <td>${product.productCode}</td>
          <td><strong>${product.productName}</strong></td>
          ${settings.showUnit ? `<td>${unit || "-"}</td>` : ''}
          ${settings.showQuantity ? `<td class="qty-cell" style="color:black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${product.quantity}</td>` : ''}
          ${settings.showPrice ? `<td>${formatEnglishNumber(product.unitPrice.toFixed(2))} ريال</td>` : ''}
          ${settings.showTotal ? `<td><strong>${formatEnglishNumber((product.totalPrice || product.unitPrice * product.quantity).toFixed(2))} ريال</strong></td>` : ''}
          <td>${ret.reason}</td>
        </tr>
      `
  }))).join("")}
    </tbody>
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
    ${settings.footerText ? `<p style="white-space: pre-line;">${settings.footerText}</p>` : ''}
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