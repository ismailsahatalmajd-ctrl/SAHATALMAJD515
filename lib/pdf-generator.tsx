import type { Issue } from "@/lib/types"
import { db } from "@/lib/db"
import { getSafeImageSrc, formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber } from "@/lib/utils"
import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { getProducts } from "@/lib/storage"

export async function generateIssuePDF(issue: Issue) {
  const settings = await getInvoiceSettings()
  const allProducts = getProducts()
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'
  const invoiceNum = getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))

  // Resolve images
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

    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: ${settings.template === 'thermal' ? '10px' : '40px'};
      background: white;
      width: ${settings.template === 'thermal' ? '80mm' : 'auto'};
      margin: ${settings.template === 'thermal' ? '0 auto' : '0'};
    }

    /* Template: Classic (Restored Original - Perfect Match) */
    ${settings.template === 'classic' ? `
      .header { text-align: center; margin-bottom: 20px; border-bottom: 1px solid #3b82f6; padding-bottom: 20px; }
      .header h1 { color: #2563eb; font-size: 28px; margin-bottom: 5px; }
      .header p { color: #3b82f6; font-size: 16px; margin: 2px 0; }
      
      .info-section { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
      .info-box { flex: 1; padding: 20px; background: #f9fafb; border-radius: 12px; border-right: 4px solid #2563eb; position: relative; }
      .info-box h3 { font-size: 14px; margin-bottom: 10px; color: #4b5563; text-align: left; opacity: 0.8; }
      .info-box p { font-size: 14px; margin: 6px 0; line-height: 1.6; }
      .info-box strong { color: #1f2937; }

      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
      th { background: #2563eb; color: white; padding: 12px 8px; font-weight: bold; border: 1px solid #2563eb; }
      td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; }
      
      .product-image { width: 45px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid #f3f4f6; }
      .no-image { width: 45px; height: 45px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #9ca3af; border-radius: 4px; margin: 0 auto; }
      
      .total-section { margin-top: 40px; text-align: right; }
      .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 15px; margin-bottom: 8px; font-size: 14px; color: #4b5563; }
      .total-row.grand { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 15px; }
      .total-row.grand span:last-child { font-size: 24px; font-weight: bold; color: #2563eb; }
      .total-label { font-weight: bold; min-width: 200px; }

      .signatures-section { margin-top: 50px; display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
      .sig-box { flex: 1; text-align: center; }
      .sig-line { margin-top: 40px; border-top: 1px dashed #9ca3af; width: 80%; margin-left: auto; margin-right: auto; }
      .sig-label { font-size: 12px; color: #4b5563; margin-top: 5px; }
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
  </style>
</head>
<body>
  <div class="header">
    <h1>فاتورة صرف منتجات</h1>
    <p>Products Issue Invoice</p>
    ${settings.headerText ? `<p style="white-space: pre-line; margin-top: 5px;">${settings.headerText}</p>` : `<p>مستودع ساحة المجد</p><p>Sahat Almajd Warehouse</p>`}
  </div>

  <div class="info-section">
    <div class="info-box" style="text-align: right;">
      <h3 style="text-align: right;">معلومات الفرع<br>Branch Info</h3>
      <p><strong>اسم الفرع / Branch Name:</strong> ${issue.branchName}</p>
      <p><strong>عدد المنتجات / Products Count:</strong> ${issue.products.length} منتج</p>
      ${issue.notes ? `<p><strong>ملاحظات / Notes:</strong> ${issue.notes}</p>` : ""}
    </div>
    <div class="info-box" style="text-align: right;">
      <h3 style="text-align: left; position: absolute; left: 20px; top: 20px;">معلومات الفاتورة<br>Invoice Info</h3>
      <p><strong>رقم الفاتورة / Invoice No:</strong> ${invoiceNum}</p>
      <p><strong>التاريخ / Date:</strong> ${formatArabicGregorianDate(new Date(issue.createdAt), { year: "numeric", month: "long", day: "numeric" })}</p>
      <p><strong>الوقت / Time:</strong> ${formatArabicGregorianTime(new Date(issue.createdAt))}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 50px">#</th>
        <th>الصورة<br>Image</th>
        <th>كود المنتج<br>Product Code</th>
        <th>اسم المنتج<br>Product Name</th>
        ${settings.showUnit ? `<th>الوحدة<br>Unit</th>` : `<th>الوحدة<br>Unit</th>`}
        ${settings.showQuantity ? `<th>الكمية<br>Quantity</th>` : `<th>الكمية<br>Quantity</th>`}
        ${settings.showPrice ? `<th>سعر الوحدة<br>Unit Price</th>` : ''}
        ${settings.showTotal ? `<th>الإجمالي<br>Total</th>` : ''}
      </tr>
    </thead>
    <tbody>
      ${productsWithImages
      .map(
        (product, index) => {
          let unit = product.unit
          if (!unit) {
            const currentProduct = allProducts.find(p => p.id === product.productId || p.productCode === product.productCode)
            if (currentProduct) {
              unit = currentProduct.unit
            }
          }

          return `
        <tr>
          <td>${index + 1}</td>
          <td>
            ${product.resolvedImage
              ? `<img src="${product.resolvedImage}" alt="${product.productName}" class="product-image" />`
              : '<div class="no-image">لا صورة</div>'
            }
          </td>
          <td>${product.productCode}</td>
          <td><strong>${product.productName}</strong></td>
          ${settings.showUnit ? `<td>${unit || "-"}</td>` : `<td>${unit || "-"}</td>`}
          ${settings.showQuantity ? `<td class="qty-cell">${formatEnglishNumber(product.quantity)}</td>` : `<td class="qty-cell">${formatEnglishNumber(product.quantity)}</td>`}
          ${settings.showPrice ? `<td>${formatEnglishNumber(product.unitPrice.toFixed(2))} ريال</td>` : ''}
          ${settings.showTotal ? `<td><strong>${formatEnglishNumber(product.totalPrice.toFixed(2))} ريال</strong></td>` : ''}
        </tr>
      `
        },
      )
      .join("")}
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-row">
      <span class="total-label">عدد الأصناف / Items Count:</span>
      <span>${formatEnglishNumber(issue.products.length)}</span>
    </div>
    ${settings.showQuantity ? `
    <div class="total-row">
      <span class="total-label">إجمالي الكميات / Total Quantity:</span>
      <span>${formatEnglishNumber(issue.products.reduce((sum, p) => sum + p.quantity, 0))}</span>
    </div>
    ` : ''}
    ${settings.showTotal ? `
    <div class="total-row grand">
      <span class="total-label" style="font-size: 20px; color: #2563eb;">الإجمالي الكلي / Grand Total:</span>
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
      window.print();
    }
  </script>
</body>
</html>
  `

  // Open in new window and print
  const printWindow = window.open("", "_blank")
  if (printWindow) {
    printWindow.document.write(pdfContent)
    printWindow.document.close()
  }
}
