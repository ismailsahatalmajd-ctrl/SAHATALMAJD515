import type { BranchRequest } from "./branch-request-types"
import { getInvoiceSettings } from "./invoice-settings-store"
import { db } from "@/lib/db"

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
    hour12: false
  })
  const title = isReturn ? `Return Invoice - ${request.branchName} / فاتورة مرتجع` : `Branch Request - ${request.branchName} / طلب فرع`

  const hasExceeded = !isReturn && request.items.some(
    (it) => typeof it.availableQuantity === "number" && it.requestedQuantity > (it.availableQuantity ?? 0),
  )

  const rows = (await Promise.all(request.items
    .map(async (it: any, idx) => {
      const exceeded = !isReturn && typeof it.availableQuantity === "number" && it.requestedQuantity > (it.availableQuantity ?? 0)
      const noteCell = hasExceeded
        ? `<td>${exceeded ? '<span class="note-warning">يتجاوز الكمية</span>' : ''}</td>`
        : ""

      let imageSrc = it.image
      if (imageSrc === 'DB_IMAGE') {
        try {
          // We need product ID... item usually doesn't have it directly?
          // branch-request items have productId usually.
          if (it.productId) {
            const imgData = await db.productImages.get(it.productId)
            if (imgData) imageSrc = imgData.data
          }
        } catch (e) { console.error(e) }
      }

      const imageCell = isReturn
        ? `<td>${imageSrc ? `<img src="${imageSrc}" style="width:40px;height:40px;object-fit:cover;">` : ''}</td>`
        : ''

      const reasonCell = isReturn
        ? `<td>${it.returnReason || ''}</td>`
        : ''

      const qty = it.requestedQuantity || it.quantity || 0
      // const unitPrice = it.unitPrice || it.price || 0
      // const totalPrice = unitPrice * qty

      return `
      <tr>
        <td>${idx + 1}</td>
        ${imageCell}
        <td>${it.productCode}</td>
        <td>${it.productName}</td>
        ${settings.showUnit ? `<td>${it.unit || ""}</td>` : ''}
        ${settings.showQuantity ? `<td>${qty}</td>` : ''}
        ${!isReturn ? `<td>${it.availableQuantity ?? "-"}</td>` : ''}
        ${reasonCell}
        ${noteCell}
      </tr>
    `
    })))
    .join("")

  const html = `
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/">
      <style>
        :root {
          /* Classic uses standard vars or hardcoded values. */
          --primary: ${settings.template === 'modern' ? '#3b82f6' : '#000'};
          --bg-header: ${settings.template === 'modern' ? '#eff6ff' : '#f9fafb'};
        }

        body { 
          font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial; 
          margin: ${settings.template === 'thermal' ? '0' : '24px'}; 
          padding: ${settings.template === 'thermal' ? '10px' : '0'};
          width: ${settings.template === 'thermal' ? '80mm' : 'auto'};
        }
        
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px; flex-direction: ${settings.template === 'thermal' ? 'column' : 'row'}; text-align: ${settings.template === 'thermal' ? 'center' : 'left'}; }
        .brand { font-weight:700; font-size: ${settings.template === 'thermal' ? '16px' : '18px'}; margin-bottom: ${settings.template === 'thermal' ? '10px' : '0'}; }
        .meta { color:#4b5563; font-size: ${settings.template === 'thermal' ? '12px' : '14px'}; }
        
        table { width: 100%; border-collapse: collapse; margin-top: ${settings.template === 'thermal' ? '10px' : '0'}; }
        th, td { border: 1px solid #e5e7eb; padding: ${settings.template === 'thermal' ? '4px 2px' : '8px'}; font-size: ${settings.template === 'thermal' ? '11px' : '13px'}; vertical-align: middle; }
        
        /* Modern Template */
        ${settings.template === 'modern' ? `
          th { background: var(--bg-header); color: #1e40af; border-color: #dbeafe; }
          .header { background: var(--bg-header); padding: 20px; border-radius: 12px; }
          table { border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
        ` : 'th { background: #f9fafb; text-align: center; }'}

        /* Thermal Template */
        ${settings.template === 'thermal' ? `
          th, td { border: none; border-bottom: 1px dashed #000; text-align: center; }
          .header { border-bottom: 1px dashed #000; padding-bottom: 10px; }
          img { display: none; } /* Hide images */
        ` : 'td { text-align: center; }'}

        .footer { margin-top: 24px; font-size: 10px; color:#6b7280; text-align: center; }
        .note-warning { color: #dc2626; font-weight: 600; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <div>مستودع ساحة المجد / Sahat Almajd Warehouse</div>
          ${settings.headerText ? `<div style="font-size: 14px; font-weight: normal; margin-top: 4px; white-space: pre-line;">${settings.headerText}</div>` : ''}
        </div>
        <div class="meta">
          <div>Request No / رقم الطلب: ${request.requestNumber || (request.id.startsWith('branch-') ? request.id : request.id.slice(0, 8))}</div>
          <div>Branch / الفرع: ${request.branchName}</div>
          <div>Date / التاريخ: ${dateStr}</div>
          <div>Type / النوع: ${isReturn ? 'Return / مرتجع' : 'Supply / توريد'}</div>
        </div>
      </div>

      <h2 style="margin-bottom: 8px;">${title}</h2>
      ${request.notes ? `<div style="margin-bottom: 12px;">Notes / ملاحظات: ${request.notes}</div>` : ""}

      <table>
        <thead>
          <tr>
            <th>#</th>
            ${isReturn ? '<th>Image / الصورة</th>' : ''}
            <th>Code / الكود</th>
            <th>Product Name / اسم المنتج</th>
            ${settings.showUnit ? `<th>Unit / الوحدة</th>` : ''}
            ${settings.showQuantity ? `<th>Qty / الكمية</th>` : ''}
            ${!isReturn ? '<th>Available / المتوفر</th>' : ''}
            ${isReturn ? '<th>Return Reason / سبب الارجاع</th>' : ''}
            ${hasExceeded ? '<th>Note / ملاحظة</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      ${settings.footerText ? `
      <div class="footer" style="text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
        <p style="white-space: pre-line; margin: 0;">${settings.footerText}</p>
      </div>
      ` : ''}

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