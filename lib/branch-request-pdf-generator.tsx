import type { BranchRequest } from "./branch-request-types"
import { getInvoiceSettings } from "./invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

export async function generateBranchRequestPDF(request: BranchRequest): Promise<void> {
  const settings = await getInvoiceSettings()
  if (typeof window === "undefined") return

  const w = window.open("", "_blank")
  if (!w) return

  const isReturn = request.type === 'return'
  const dateStr = new Date(request.createdAt).toLocaleString("en-GB", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })

  // Use more formal English/Arabic titles similar to Invoice
  const title = isReturn ? `Branch Return - ${request.branchName} / مرتجع فرع` : `Branch Request - ${request.branchName} / طلب فرع`

  const hasExceeded = !isReturn && request.items.some(
    (it) => typeof it.availableQuantity === "number" && it.requestedQuantity > (it.availableQuantity ?? 0),
  )

  // Resolve images (Batch fetch optimization)
  const itemsNeedingImage = request.items.filter(it => it.image === 'DB_IMAGE' && it.productId);
  const uniqueProductIds = Array.from(new Set(itemsNeedingImage.map(it => it.productId as string)));

  let imageMap = new Map<string, string>();
  if (uniqueProductIds.length > 0) {
    const chunkSize = 20;
    for (let i = 0; i < uniqueProductIds.length; i += chunkSize) {
      const chunk = uniqueProductIds.slice(i, i + chunkSize);
      try {
        const images = await db.productImages.bulkGet(chunk);
        images.forEach((img, idx) => {
          if (img && img.data) {
            imageMap.set(chunk[idx], img.data);
          }
        });
      } catch (e) {
        console.error("Failed to batch fetch images chunk", e);
      }
    }
  }

  // Helper to resolve info
  // Fetch branch details if needed (phone) - request object usually has basic branchName
  // We can try to fetch more info if we want to be exact, but the request might not have it.

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  const rows = request.items.map((it: any, idx) => {
    let imageSrc = it.image
    if (imageSrc === 'DB_IMAGE' && it.productId && imageMap.has(it.productId)) {
      imageSrc = imageMap.get(it.productId)
    }
    const safeImg = getSafeImageSrc(imageSrc)

    const qty = it.requestedQuantity || it.quantity || 0

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${safeImg ? `<img src="${safeImg}" style="width:40px;height:40px;object-fit:cover">` : ''}</td>
        <td>${it.productCode || "-"}</td>
        <td>${it.productName}</td>
        <td>${it.unit || (it as any).selectedUnitName || "-"}</td>
        <td>${qty}</td>
        <td style="color:#555;">${it.notes || (isReturn ? it.returnReason : "") || "—"}</td>
      </tr>
    `
  }).join("")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          /* A4 Print Settings */
          @page { size: A4; margin: 10mm; }
          
          body { font-family: system-ui, -apple-system, Segoe UI, Tahoma, sans-serif; padding: 20px; max-width: 210mm; margin: 0 auto; }
          
          @media print {
            body { padding: 0; width: 100%; max-width: none; }
            table { font-size: 12px; }
            th, td { padding: 6px; }
          }
          
          h1, h2, h3 { text-align: center; margin: 0; }
          .header-container { text-align: center; margin-bottom: 30px; }
          .logo { width: 50px; height: 50px; object-fit: contain; margin-bottom: 10px; }
          
          .meta-container { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-end; 
            margin-bottom: 20px; 
            border-bottom: 1px solid #ddd; 
            padding-bottom: 15px;
            font-size: 14px;
          }
          
          .meta-right { text-align: right; } /* RTL Start */
          .meta-left { text-align: left; }   /* RTL End */
          
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: center; vertical-align: middle; }
          th { background: #2563eb; color: white; font-weight: bold; }
          
          /* Column sizing */
          .col-id { width: 40px; }
          .col-img { width: 60px; }
          .col-code { width: 100px; }
          .col-name { }
          .col-unit { width: 80px; }
          .col-qty { width: 80px; }
          .col-notes { width: 150px; }
          
          .footer-text { margin-top: 30px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px; page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <img src="${logoUrl}" class="logo" alt="Logo" onerror="this.style.display='none'"/>
          <h2 style="font-size: 18px; margin-bottom: 5px;">مستودع ساحة المجد / Sahat Almajd Warehouse</h2>
          <h1 style="font-size: 22px;">${title}</h1>
        </div>

        <div class="meta-container">
          <div class="meta-right">
             <div style="margin-bottom: 5px;"><strong>Request No / رقم الطلب:</strong> <span style="font-size: 16px;">${request.requestNumber || (request.id.startsWith('branch-') ? request.id : request.id.slice(0, 8))}</span></div>
             <div><strong>Date / التاريخ:</strong> ${dateStr}</div>
          </div>
          <div class="meta-left">
             <div style="margin-bottom: 5px;"><strong>Branch / اسم الفرع:</strong> ${request.branchName}</div>
             <div><strong>Type / النوع:</strong> ${isReturn ? 'Return / مرتجع' : 'Supply / توريد'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="col-id">#</th>
              <th class="col-img">الصورة<br/>Image</th>
              <th class="col-code">كود المنتج<br/>Product Code</th>
              <th class="col-name">اسم المنتج<br/>Product Name</th>
              <th class="col-unit">الوحدة<br/>Unit</th>
              <th class="col-qty">الكمية<br/>Quantity</th>
              <th class="col-notes">ملاحظات<br/>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        
        ${settings.footerText ? `<div class="footer-text">${settings.footerText}</div>` : ""}
        
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `

  w.document.write(html)
  w.document.close()
  w.focus()
}