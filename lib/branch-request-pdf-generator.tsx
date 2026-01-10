import type { BranchRequest } from "./branch-request-types"
import { getInvoiceSettings } from "./invoice-settings-store"

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
  const title = isReturn ? `Return Invoice - ${request.branchName} / فاتورة مرتجع` : `Branch Request - ${request.branchName} / طلب فرع`

  const hasExceeded = !isReturn && request.items.some(
    (it) => typeof it.availableQuantity === "number" && it.requestedQuantity > (it.availableQuantity ?? 0),
  )

  const rows = request.items
    .map((it: any, idx) => {
      const exceeded = !isReturn && typeof it.availableQuantity === "number" && it.requestedQuantity > (it.availableQuantity ?? 0)
      const noteCell = hasExceeded
        ? `<td>${exceeded ? '<span class="note-warning">يتجاوز الكمية</span>' : ''}</td>`
        : ""

      const imageCell = isReturn
        ? `<td>${it.image ? `<img src="${it.image}" style="width:40px;height:40px;object-fit:cover;">` : ''}</td>`
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
    })
    .join("")

  const html = `
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial; margin: 24px; }
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px; }
        .brand { font-weight:700; font-size: 18px; }
        .meta { color:#4b5563; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; vertical-align: middle; }
        th { background: #f9fafb; text-align: center; }
        td { text-align: center; }
        .footer { margin-top: 24px; font-size: 12px; color:#6b7280; }
        .note-warning { color: #dc2626; font-weight: 600; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">مستودع ساحة المجد / Sahat Almajd Warehouse</div>
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