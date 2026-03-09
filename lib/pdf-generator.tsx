import type { Issue } from "@/lib/types"
import { db } from "@/lib/db"
import { getSafeImageSrc, formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber } from "@/lib/utils"
import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { getProducts } from "@/lib/storage"
import { formatInvoiceNumber, formatOrderNumber } from "@/lib/id-generator" // Import generator
import JsBarcode from "jsbarcode" // Ensure we can use JsBarcode if installed, or just use text for now. (assuming native browser print doesn't run jsbarcode easily without script ref, using script tag in template)

export async function generateIssuePDF(issue: Issue) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز الفاتورة... (Preparing Invoice...)</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)

  const settings = await getInvoiceSettings()
  const allProducts = getProducts()
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  // Logic for new codes
  let invoiceCode = issue.invoiceCode
  let orderCode = issue.orderCode

  // Generate if missing (Lazy generation on print)
  // Generate if missing (Lazy generation on print)
  let updated = false
  if (!invoiceCode) {
    invoiceCode = await formatInvoiceNumber("IS", issue.branchId)
    updated = true
  }
  if (!orderCode) {
    orderCode = await formatOrderNumber(issue.branchId)
    updated = true
  }

  // Persist the generated codes to the DB (Transformation Step)
  if (updated) {
    try {
      await db.issues.update(issue.id, { invoiceCode, orderCode })
      // Update local object ref
      issue.invoiceCode = invoiceCode
      issue.orderCode = orderCode
    } catch (e) {
      console.error("Failed to persist generated codes during PDF generation", e)
    }
  }

  const invoiceNum = invoiceCode || getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))

  // Resolve images
  // Fetch branch phone
  let branchPhone = ""
  try {
    if (issue.branchId) {
      const branch = await db.branches.get(issue.branchId)
      if (branch?.phone) branchPhone = branch.phone
    }
  } catch (e) {
    console.error("Failed to fetch branch phone", e)
  }

  const productsWithImages = await Promise.all(issue.products.map(async (p) => {
    let imgSrc = p.image || ""
    if (p.image === 'DB_IMAGE') {
      try {
        const rec = await db.productImages.get(p.productId)
        if (rec && rec.data) {
          imgSrc = getSafeImageSrc(rec.data)
        } else {
          // Try cloud? Or just fallback for now to avoid complexity in this sync function
          // Use placeholder or keep empty
          imgSrc = ""
        }
      } catch (e) {
        console.error("Failed to load image for PDF", e)
        imgSrc = ""
      }
    } else if (p.image) {
      imgSrc = getSafeImageSrc(p.image)
    }
    return { ...p, resolvedImage: imgSrc }
  }))

  // Create PDF content as HTML
  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة صرف ${invoiceNum}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    /* Template Base Styles */
    :root {
      /* Classic (Original) uses #2563eb. Modern uses #3b82f6. Thermal uses Black. */
      --primary: ${settings.template === 'modern' ? '#3b82f6' : (settings.template === 'thermal' ? '#000' : '#2563eb')};
      --bg-header: ${settings.template === 'modern' ? '#eff6ff' : (settings.template === 'thermal' ? '#fff' : '#2563eb')};
      --text-header: ${settings.template === 'modern' ? '#1e40af' : (settings.template === 'thermal' ? '#000' : '#fff')};
    }

    @page { margin: 5mm 10mm; }

    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: ${settings.template === 'thermal' ? '5px' : '5px 15px 15px 15px'};
      background: white;
      width: ${settings.template === 'thermal' ? '80mm' : 'auto'};
      margin: ${settings.template === 'thermal' ? '0 auto' : '0'};
    }

    /* Template: Classic (Restored Original - Perfect Match) */
    ${settings.template === 'classic' ? `
      .header { text-align: center; margin-bottom: 5px; border-bottom: 1px solid #3b82f6; padding-bottom: 5px; }
      .header h1 { color: #2563eb; font-size: 22px; margin-bottom: 2px; }
      .header p { color: #3b82f6; font-size: 13px; margin: 1px 0; }
      
      .info-section { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
      .info-box { flex: 1; padding: 10px; background: #f9fafb; border-radius: 8px; border-right: 4px solid #2563eb; position: relative; }
      .info-box h3 { font-size: 13px; margin-bottom: 5px; color: #4b5563; text-align: left; opacity: 0.8; line-height: 1; }
      .info-box p { font-size: 13px; margin: 3px 0; line-height: 1.2; }
      .info-box strong { color: #1f2937; }

      table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 12px; }
      th { background: #2563eb; color: white; padding: 6px 4px; font-weight: bold; border: 1px solid #2563eb; font-size: 11px; }
      td { padding: 4px 4px; border-bottom: 1px solid #e5e7eb; text-align: center; line-height: 1.1; }
      
      .product-image { width: 35px; height: 35px; object-fit: cover; border-radius: 4px; border: 1px solid #f3f4f6; }
      .no-image { width: 35px; height: 35px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #9ca3af; border-radius: 4px; margin: 0 auto; }
      
      .total-section { margin-top: 15px; text-align: left; direction: ltr; }
      .stats-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #4b5563; }
      .stat-item { display: flex; align-items: center; gap: 8px; }
      .total-row { display: flex; justify-content: flex-start; align-items: center; gap: 10px; margin-bottom: 4px; font-size: 13px; color: #4b5563; }
      .total-row.grand { margin-top: 10px; border-top: 1px solid #e5e7eb; padding-top: 10px; }
      .total-row.grand span:last-child { font-size: 18px; font-weight: bold; color: #2563eb; }
      .total-label { font-weight: bold; min-width: auto; text-align: right; }

      .signatures-section { margin-top: 20px; display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #e5e7eb; padding-top: 10px; }
      .sig-box { flex: 1; text-align: center; }
      .sig-line { margin-top: 25px; border-top: 1px dashed #9ca3af; width: 70%; margin-left: auto; margin-right: auto; }
      .sig-label { font-size: 11px; color: #4b5563; margin-top: 3px; }
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
    ` : ''}

    /* Common Overrides */
    .qty-cell { font-weight: bold; }
    .qty-cell { font-weight: bold; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>
</head>
<body>
  <div class="header">
    <h1>فاتورة صرف منتجات / Products Issue Invoice</h1>
    ${settings.headerText ? `<p style="white-space: pre-line; margin-top: 5px;">${settings.headerText}</p>` : `<p>مستودع ساحة المجد / Sahat Almajd Warehouse</p>`}
  </div>

  <div class="info-section">
    <div class="info-box" style="text-align: right;">
      <h3 style="text-align: right;">معلومات الفرع<br>Branch Info</h3>
      <p><strong>اسم الفرع / Branch Name:</strong> ${issue.branchName}</p>
      ${branchPhone ? `<p><strong>رقم الجوال / Phone:</strong> ${branchPhone}</p>` : ''}
      <p><strong>عدد المنتجات / Products Count:</strong> ${issue.products.length} منتج</p>
      <p style="margin-top: 5px; color: #2563eb;"><strong>رقم الطلب / Order Ref:</strong> ${orderCode}</p>
      ${issue.notes ? `<p><strong>ملاحظات / Notes:</strong> ${issue.notes}</p>` : ""}
    </div>
    <div class="info-box" style="text-align: right;">
      <h3 style="text-align: left; position: absolute; left: 20px; top: 20px;">معلومات الفاتورة<br>Invoice Info</h3>
      <p><strong>رقم الفاتورة / Invoice No:</strong> <span style="font-family: monospace; font-size: 16px;">${invoiceNum}</span></p>
      <p><strong>التاريخ / Date:</strong> ${formatArabicGregorianDate(new Date(issue.createdAt), { year: "numeric", month: "long", day: "numeric" })}</p>
      <p><strong>الوقت / Time:</strong> ${formatArabicGregorianTime(new Date(issue.createdAt))}</p>
      <div style="margin-top: 10px; text-align: center;">
        <svg id="barcode"></svg>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px; white-space: nowrap;">#</th>
        <th style="width: 80px; white-space: nowrap;">الصورة / <span style="font-size:9px">Image</span></th>
        <th style="white-space: nowrap;">كود المنتج / <span style="font-size:9px">Product Code</span></th>
        <th style="width: 40%">اسم المنتج / <span style="font-size:9px">Product Name</span></th>
        ${settings.showUnit ? `<th>الوحدة / <span style="font-size:9px">Unit</span></th>` : ''}
        ${settings.showQuantity ? `<th>الكمية / <span style="font-size:9px">Qty</span></th>` : ''}
        ${settings.showPrice ? `<th>سعر الوحدة / <span style="font-size:9px">Price</span></th>` : ''}
        ${settings.showTotal ? `<th>الإجمالي / <span style="font-size:9px">Total</span></th>` : ''}
        ${settings.showNotes ? `<th>الملاحظات / <span style="font-size:9px">Notes</span></th>` : ''}
      </tr>
    </thead>
    <tbody>
      ${productsWithImages
      .map(
        (product, index) => {
          let unit = product.unit
          if (!unit) {
            const currentProduct = allProducts.find(p => p.id === product.productId)
            if (currentProduct) {
              unit = currentProduct.unit
            }
          }

          return `
        <tr>
          <td>${index + 1}</td>
          <td>
            ${product.resolvedImage
              ? `<img src="${product.resolvedImage}" alt="" class="product-image" />`
              : '<div class="no-image">لا صورة</div>'
            }
          </td>
          <td style="font-size: 10px; font-family: monospace;">${product.productCode}</td>
          <td style="text-align: right;"><strong>${product.productName}</strong></td>
          ${settings.showUnit ? `<td>${unit || "-"}</td>` : ''}
          ${settings.showQuantity ? `<td class="qty-cell">${formatEnglishNumber(product.quantity)}</td>` : ''}
          ${settings.showPrice ? `<td>${formatEnglishNumber(product.unitPrice.toFixed(2))}</td>` : ''}
          ${settings.showTotal ? `<td><strong>${formatEnglishNumber(product.totalPrice.toFixed(2))}</strong></td>` : ''}
          ${settings.showNotes ? `<td style="text-align:right; font-size:10px; color:#555;">${(product as any).notes || "—"}</td>` : ''}
        </tr>
      `
        },
      )
      .join("")}
    </tbody>
  </table>

  <div class="total-section" style="direction: rtl;">
    <div class="stats-row" style="margin-bottom: 10px;">
      <div class="stat-item" style="display: flex; gap: 5px; align-items: center;">
        <span class="total-label" style="text-align: right; font-weight: bold; min-width: auto; margin-left: 5px;">عدد الأصناف / Items Count:</span>
        <span style="font-weight: normal;">${formatEnglishNumber(issue.products.length)}</span>
      </div>
      ${settings.showQuantity ? `
      <div class="stat-item" style="display: flex; gap: 5px; align-items: center;">
        <span class="total-label" style="text-align: right; font-weight: bold; min-width: auto; margin-left: 5px;">إجمالي الكميات / Total Quantity:</span>
        <span style="font-weight: normal;">${formatEnglishNumber(issue.products.reduce((sum, p) => sum + p.quantity, 0))}</span>
      </div>
      ` : ''}
    </div>
    ${settings.showTotal ? `
    <div class="total-row grand" style="display: flex; justify-content: flex-start; gap: 10px;">
      <span class="total-label" style="font-size: 20px; color: #2563eb; min-width: auto; margin-left:10px;">الإجمالي الكلي / Grand Total:</span>
      <span>${formatEnglishNumber(issue.totalValue.toFixed(2))} ريال</span>
    </div>
    ` : ''}
  </div>

  <div class="signatures-section">
    <div class="sig-box">
      <p><strong>المرسل من المستودع</strong></p>
      <p style="font-size: 11px; color: #6b7280;">Warehouse Dispatcher</p>
      <div class="sig-line"></div>
      <p class="sig-label">الاسم والتوقيع / Name & Signature</p>
    </div>
    <div class="sig-box">
      <p><strong>السائق</strong></p>
      <p style="font-size: 11px; color: #6b7280;">Driver</p>
      <div class="sig-line"></div>
      <p class="sig-label">الاسم والتوقيع / Name & Signature</p>
    </div>
    <div class="sig-box">
      <p><strong>المستلم من الفرع</strong></p>
      <p style="font-size: 11px; color: #6b7280;">Branch Receiver</p>
      <div class="sig-line"></div>
      <p class="sig-label">الاسم والتوقيع / Name & Signature</p>
    </div>
  </div>

  ${settings.footerText ? `
  <div class="footer">
    <p style="white-space: pre-line;">${settings.footerText}</p>
  </div>
  ` : ''}

  

  <script>
    window.onload = function() {
      try {
        JsBarcode("#barcode", "${invoiceCode || invoiceNum}", {
          format: "CODE128",
          width: 1.5,
          height: 40,
          displayValue: false
        });
      } catch (e) { console.error(e); }
      setTimeout(function() { window.print(); }, 500);
    }
  </script>
</body>
</html>
  `

  w.document.open()
  w.document.write(pdfContent)
  w.document.close()
}
