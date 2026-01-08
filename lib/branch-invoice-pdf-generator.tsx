import type { BranchInvoice } from "./branch-invoice-types"
import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

export async function generateBranchInvoicePDF(inv: BranchInvoice): Promise<string> {
  const settings = await getInvoiceSettings()
  const title = `Branch Invoice - ${inv.branchName} / فاتورة فرع`
  const dateStr = new Date(inv.createdAt).toLocaleString("en-GB", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })

  // Generate headers based on settings
  let headers = `<th style="width: 40px">#</th>`
  headers += `<th style="width: 60px">الصورة<br/><span style="font-size:10px;font-weight:normal">Image</span></th>`
  headers += `<th style="width: 100px">كود المنتج<br/><span style="font-size:10px;font-weight:normal">Product Code</span></th>`
  headers += `<th>اسم المنتج<br/><span style="font-size:10px;font-weight:normal">Product Name</span></th>`
  headers += `<th style="width: 80px">الوحدة<br/><span style="font-size:10px;font-weight:normal">Unit</span></th>`
  headers += `<th style="width: 80px">الكمية<br/><span style="font-size:10px;font-weight:normal">Quantity</span></th>`

  if (settings.showPrice) {
    headers += `<th style="width: 100px">سعر الوحدة<br/><span style="font-size:10px;font-weight:normal">Unit Price</span></th>`
  }

  if (settings.showTotal) {
    headers += `<th style="width: 100px">الإجمالي<br/><span style="font-size:10px;font-weight:normal">Total</span></th>`
  }

  // Resolve images
  const itemsWithImages = await Promise.all(inv.items.map(async (it) => {
    let finalImage = it.image
    if (it.image === 'DB_IMAGE') {
      try {
        const prodId = (it as any).productId
        if (prodId) {
          const rec = await db.productImages.get(prodId)
          if (rec?.data) finalImage = rec.data
        }
      } catch (e) { console.error(e) }
    }
    return { ...it, resolvedImage: finalImage }
  }))

  const rows = itemsWithImages
    .map(
      (it, idx) => {
        let row = `<tr>`
        const imageSrc = getSafeImageSrc(it.resolvedImage)

        row += `<td>${idx + 1}</td>`
        row += `<td>${imageSrc ? `<img src="${imageSrc}" style="width:40px;height:40px;object-fit:cover">` : ''}</td>`
        row += `<td>${it.productCode || "-"}</td>`
        row += `<td>${it.productName}</td>`
        row += `<td>${it.unit || ""}</td>`
        row += `<td>${it.quantity}</td>`

        if (settings.showPrice) {
          row += `<td>${it.unitPrice.toFixed(2)}</td>`
        }

        if (settings.showTotal) {
          row += `<td>${it.totalPrice.toFixed(2)}</td>`
        }

        row += `</tr>`
        return row
      }
    )
    .join("")

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, Segoe UI, Tahoma, sans-serif; padding: 20px; }
          h1 { font-size: 20px; margin: 0 0 8px; text-align: center; }
          .header-text { text-align: center; margin-bottom: 20px; color: #555; }
          .meta { margin: 6px 0 16px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #e5e7eb; padding: 10px; font-size: 13px; text-align: center; vertical-align: middle; }
          th { background: #2563eb; color: white; font-weight: bold; padding: 12px; }
          .totals { margin-top: 20px; font-weight: 600; text-align: left; padding: 10px; background: #f9f9f9; border-radius: 4px; }
          .footer-text { margin-top: 30px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        ${settings.headerText ? `<div class="header-text">${settings.headerText}</div>` : ""}
        <div style="text-align:center; margin-bottom:10px;">
          <img src="${logoUrl}" alt="مستودع ساحة المجد" style="width:48px;height:48px;border-radius:6px;display:inline-block;" onerror="this.style.display='none'"/>
          <div style="font-weight:bold; margin-top:4px;">مستودع ساحة المجد / Sahat Almajd Warehouse</div>
        </div>
        <h1>${title}</h1>
        <div class="meta">
          <div style="display:flex; justify-content:space-between;">
             <span><strong>Invoice No / رقم الفاتورة:</strong> ${inv.invoiceNumber || "—"}</span>
             <span><strong>Branch / اسم الفرع:</strong> ${inv.branchName}</span>
          </div>
          <div style="margin-top:4px;"><strong>Date / التاريخ:</strong> ${dateStr}</div>
        </div>
        <table>
          <thead>
            <tr>
              ${headers}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        
        ${settings.showTotal ? `<div class="totals">Total Amount / إجمالي الفاتورة: ${inv.totalValue.toFixed(2)}</div>` : ""}
        
        ${settings.footerText ? `<div class="footer-text">${settings.footerText}</div>` : ""}
        
        <script>
          window.print && setTimeout(() => window.print(), 200)
        </script>
      </body>
    </html>
  `

  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  return url
}
