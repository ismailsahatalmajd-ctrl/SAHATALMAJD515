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
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 40px;
      background: white;
    }
    /* ... styles ... */
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #2563eb;
      font-size: 32px;
      margin-bottom: 10px;
    }
    .header p {
      color: #64748b;
      font-size: 14px;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
      gap: 20px;
    }
    .info-box {
      flex: 1;
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border-right: 4px solid #2563eb;
    }
    .info-box h3 {
      color: #1e293b;
      font-size: 14px;
      margin-bottom: 10px;
      font-weight: 600;
    }
    .info-box p {
      color: #475569;
      font-size: 16px;
      margin: 5px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    thead {
      background: #2563eb;
      color: white;
    }
    th {
      padding: 15px;
      text-align: right;
      font-weight: 600;
      font-size: 14px;
    }
    td {
      padding: 12px 15px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    .qty-cell { color: #000 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    tbody tr:hover {
      background: #f8fafc;
    }
    /* Added styles for product images in PDF */
    .product-image {
      width: 50px;
      height: 50px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .no-image {
      width: 50px;
      height: 50px;
      background: #f1f5f9;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #94a3b8;
      border: 1px solid #e2e8f0;
    }
    .total-section {
      margin-top: 30px;
      text-align: left;
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
      font-size: 18px;
    }
    .total-row.grand {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
      border-top: 2px solid #cbd5e1;
      padding-top: 15px;
      margin-top: 15px;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
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
        <h1>فاتورة صرف منتجات<br><span style="font-size:20px; font-weight:normal;">Products Issue Invoice</span></h1>
        <p>مستودع ساحة المجد<br>Sahat Almajd Warehouse</p>
      </div>
    </div>
  </div>

  <div class="info-section">
    <div class="info-box">
      <h3>معلومات الفاتورة<br>Invoice Info</h3>
      <p><strong>رقم الفاتورة / Invoice No:</strong> ${invoiceNum}</p>
      <p><strong>التاريخ / Date:</strong> ${formatArabicGregorianDate(new Date(issue.createdAt), { year: "numeric", month: "long", day: "numeric" })}</p>
      <p><strong>الوقت / Time:</strong> ${formatArabicGregorianTime(new Date(issue.createdAt))}</p>
    </div>
    <div class="info-box">
      <h3>معلومات الفرع<br>Branch Info</h3>
      <p><strong>اسم الفرع / Branch Name:</strong> ${issue.branchName}</p>
      <p><strong>عدد المنتجات / Products Count:</strong> ${issue.products.length} منتج</p>
      ${issue.notes ? `<p><strong>ملاحظات / Notes:</strong> ${issue.notes}</p>` : ""}
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
      <span>عدد الأصناف / Items Count:</span>
      <span>${formatEnglishNumber(issue.products.length)}</span>
    </div>
    ${settings.showQuantity ? `
    <div class="total-row">
      <span>إجمالي الكميات / Total Quantity:</span>
      <span>${formatEnglishNumber(issue.products.reduce((sum, p) => sum + p.quantity, 0))}</span>
    </div>
    ` : ''}
    ${settings.showTotal ? `
    <div class="total-row grand">
      <span>الإجمالي الكلي / Grand Total:</span>
      <span>${formatEnglishNumber(issue.totalValue.toFixed(2))} ريال</span>
    </div>
    ` : ''}
  </div>

  

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
