import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

export interface POReceiptPrintItem {
  receiptNumber: string
  poNumber: string
  vendorName: string
  scheduledDate: string
  effectiveDate?: string
  receiptStatus?: string
  productCode: string
  productName: string
  demandQty: number
  receivedQty: number
  odooUnit: string
  quantityPerCarton?: number
  warehouseQty?: number
  warehouseUnit?: string
  imageUrl?: string
}

function extractCleanEnglishName(rawName: string): string {
  if (!rawName) return ""
  let name = rawName.replace(/^\[.*?\]\s*/, "").trim()
  const hasLatin = /[a-zA-Z]/.test(name)
  const hasArabic = /[\u0600-\u06FF]/.test(name)
  if (hasLatin && hasArabic) {
    const stripped = name
      .replace(/[\u0600-\u06FF]+/g, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\[\s*\]/g, " ")
      .replace(/^[\s\-/|–—:*]+|[\s\-/|–—:*]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    const withoutUnits = stripped
      .replace(/\b(?:kg|gm|g|ml|l|ltr|pcs|pc|box|ctn|pack|oz|cm|mm)\b/gi, "")
      .trim()
    if (/[a-zA-Z]{3,}/.test(withoutUnits)) {
      name = stripped
    }
  }
  return name || rawName
}

export async function generateOdooPOReceiptPDF(
  items: POReceiptPrintItem[],
  title: string = "سند استلام المشتريات / Goods Receipt"
) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.open()
  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:16px; color:#64748b;" dir="rtl">
      <div style="width:36px; height:36px; border:3px solid #e2e8f0; border-top:3px solid #475569; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="font-size:12px;">جاري إعداد السند للطباعة...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)
  w.document.close()

  let settings: any = {
    template: "modern",
    showBarcode: true,
    showCompanyInfo: true,
  }
  try {
    settings = await getInvoiceSettings()
  } catch (e) {}

  const logoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/sahat-almajd-logo.svg`
      : "/sahat-almajd-logo.svg"
  const printDateStr = new Date().toLocaleString("en-GB")

  // Enrich items with website product image, carton size, and warehouse unit if not already set
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      let imageUrl = item.imageUrl || ""
      let warehouseUnit = item.warehouseUnit || ""
      let quantityPerCarton = item.quantityPerCarton || 1
      const receivedQty = Number(item.receivedQty) || 0

      try {
        const cleanCode = (item.productCode || "").trim()
        if (cleanCode) {
          const websiteProduct = await db.products
            .where("productCode")
            .equals(cleanCode)
            .first()
          if (websiteProduct) {
            if (!warehouseUnit) warehouseUnit = websiteProduct.unit || "Carton"
            if (!item.quantityPerCarton) {
              quantityPerCarton = Math.max(
                1,
                Number(websiteProduct.quantityPerCarton) || 1
              )
            }
            if (!imageUrl && websiteProduct.image) {
              if (websiteProduct.image === "DB_IMAGE") {
                const rec = await db.productImages.get(websiteProduct.id)
                if (rec?.data) imageUrl = getSafeImageSrc(rec.data)
              } else {
                imageUrl = getSafeImageSrc(websiteProduct.image)
              }
            }
          }
        }
      } catch (e) {}

      const warehouseQty =
        item.warehouseQty !== undefined
          ? item.warehouseQty
          : Number((receivedQty / Math.max(1, quantityPerCarton)).toFixed(2))

      return {
        ...item,
        imageUrl,
        quantityPerCarton,
        warehouseQty,
        warehouseUnit: warehouseUnit || item.odooUnit || "Carton",
        productName: extractCleanEnglishName(item.productName),
      }
    })
  )

  const distinctReceipts = Array.from(
    new Set(enrichedItems.map((i) => i.receiptNumber))
  )

  const totalDemandUnits = enrichedItems.reduce(
    (sum, i) => sum + (Number(i.demandQty) || 0),
    0
  )
  const totalReceivedUnits = enrichedItems.reduce(
    (sum, i) => sum + (Number(i.receivedQty) || 0),
    0
  )
  const totalReceivedWhQty = enrichedItems.reduce(
    (sum, i) => sum + (Number(i.warehouseQty) || 0),
    0
  )

  const rowsHtml = enrichedItems
    .map((item, idx) => {
      const imgCell = item.imageUrl
        ? `<img src="${item.imageUrl}" style="width:34px; height:34px; object-fit:cover; border-radius:3px; border:1px solid #e2e8f0; display:inline-block;" onerror="this.style.display='none'" />`
        : `<div style="width:34px; height:34px; border-radius:3px; border:1px dashed #e2e8f0; display:inline-flex; align-items:center; justify-content:center; font-size:8px; color:#94a3b8; margin:auto;">No Img</div>`

      const codeBadge = item.productCode
        ? `<span style="font-family:monospace; font-size:8.5px; font-weight:600; background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:1px 4px; border-radius:3px;">[${item.productCode}]</span>`
        : ""

      const packBadge =
        item.quantityPerCarton && item.quantityPerCarton > 1
          ? `<span style="font-size:8.5px; color:#64748b;">(Pack: ${item.quantityPerCarton})</span>`
          : ""

      const statusBadge = item.receiptStatus
        ? `<span style="font-size:8.5px; font-weight:600; padding:1px 5px; border-radius:3px; border:1px solid #cbd5e1; color:#475569; background:#f8fafc;">${item.receiptStatus.toUpperCase()}</span>`
        : ""

      const rawDate = item.effectiveDate || item.scheduledDate || "-"
      const dateDisplay = rawDate !== "-" ? rawDate.split(" ")[0] : "-"

      return `
      <tr style="border-bottom:1px solid #f1f5f9; page-break-inside:avoid; background:${
        idx % 2 === 0 ? "#ffffff" : "#fafafa"
      };">
        <td style="padding:4px 3px; text-align:center; font-weight:600; color:#64748b; font-size:9.5px; border-left:1px solid #f1f5f9; vertical-align:middle;">${
          idx + 1
        }</td>
        <td style="padding:3px; text-align:center; border-left:1px solid #f1f5f9; vertical-align:middle;">${imgCell}</td>
        <td style="padding:4px 6px; text-align:right; border-left:1px solid #f1f5f9; vertical-align:middle;">
          <div style="font-weight:600; color:#1e293b; font-size:10px; line-height:1.2; text-align:right;">${item.productName}</div>
          <div style="display:flex; align-items:center; justify-content:flex-start; gap:4px; margin-top:2px; flex-wrap:wrap;">
            ${codeBadge}
            ${packBadge}
          </div>
        </td>
        <td style="padding:4px 3px; text-align:center; font-family:monospace; font-weight:600; font-size:8.5px; color:#1e293b; border-left:1px solid #f1f5f9; vertical-align:middle; white-space:nowrap;" dir="ltr">
          ${item.receiptNumber || "-"}
        </td>
        <td style="padding:4px 3px; text-align:center; font-family:monospace; font-weight:600; font-size:9px; color:#1e293b; border-left:1px solid #f1f5f9; vertical-align:middle; white-space:nowrap;" dir="ltr">
          ${item.poNumber || "-"}
        </td>
        <td style="padding:4px 3px; text-align:center; font-weight:600; color:#1e293b; font-size:10px; border-left:1px solid #f1f5f9; vertical-align:middle;">
          ${item.demandQty} <span style="font-size:8px; color:#64748b; font-weight:normal;">${item.odooUnit}</span>
        </td>
        <td style="padding:4px 3px; text-align:center; font-weight:600; color:#1e293b; font-size:10px; border-left:1px solid #f1f5f9; vertical-align:middle;">
          ${item.receivedQty} <span style="font-size:8px; color:#64748b; font-weight:normal;">${item.odooUnit}</span>
        </td>
        <td style="padding:4px 3px; text-align:center; font-weight:600; color:#1e293b; font-size:10px; border-left:1px solid #f1f5f9; vertical-align:middle;">
          ${item.warehouseQty} <span style="font-size:8px; color:#64748b; font-weight:normal;">${item.warehouseUnit}</span>
        </td>
        <td style="padding:4px 2px; text-align:center; border-left:1px solid #f1f5f9; vertical-align:middle;">${statusBadge}</td>
        <td style="padding:4px 3px; text-align:center; font-size:8.5px; color:#475569; border-left:1px solid #f1f5f9; vertical-align:middle; font-family:sans-serif; white-space:nowrap;" dir="ltr">
          ${dateDisplay}
        </td>
        <td style="padding:3px 5px; text-align:center; font-size:8px; line-height:1.2; color:#334155; font-weight:500; vertical-align:middle; max-width:130px; word-break:break-word;">
          ${item.vendorName || "-"}
        </td>
      </tr>
    `
    })
    .join("")

  const html = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>${title} - ${distinctReceipts.join(", ")}</title>
      <style>
        @page { size: auto; margin: 6mm 6mm 8mm 6mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Tahoma", sans-serif; direction: rtl; margin:0; padding:8px; color:#1e293b; font-size:10px; background:#ffffff; }
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; direction: rtl; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body dir="rtl">
      <!-- Top Action Bar (Hidden on Print) -->
      <div class="no-print" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px 12px; border-radius:4px; border:1px solid #e2e8f0;">
        <span style="font-weight:600; color:#334155; font-size:11px;">ملخص سندات الاستلام (${enrichedItems.length} صنف)</span>
        <button onclick="window.print()" style="padding:5px 14px; background:#1e293b; color:#fff; border:none; border-radius:4px; font-weight:600; cursor:pointer; font-size:11px;">🖨️ طباعة المستند</button>
      </div>

      <!-- Light Minimal Header Box -->
      <div style="border:1px solid #e2e8f0; border-radius:4px; padding:6px 12px; margin-bottom:8px; background:#fafafa;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div style="display:flex; gap:16px; font-size:10px; color:#64748b; align-items:center;">
              <span>تاريخ الطباعة: <strong style="color:#1e293b;" dir="ltr">${printDateStr}</strong></span>
              <span>عدد الأصناف: <strong style="color:#1e293b;">${enrichedItems.length}</strong></span>
            </div>
          </div>
          <div style="text-align:left;">
            <img src="${logoUrl}" style="height:26px; object-fit:contain; opacity:0.85;" onerror="this.style.display='none'" />
          </div>
        </div>
      </div>

      <!-- Main Products Table (RTL, Soft Neutral Grayscale Tones) -->
      <table style="width:100%; border:1px solid #e2e8f0; border-radius:4px; overflow:hidden;" dir="rtl">
        <thead>
          <tr style="background:#f8fafc; border-bottom:1.5px solid #cbd5e1; color:#475569;">
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:22px; border-left:1px solid #e2e8f0;">#</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:38px; border-left:1px solid #e2e8f0;">الصورة</th>
            <th style="padding:5px 6px; font-size:9px; font-weight:600; text-align:right; border-left:1px solid #e2e8f0;">اسم ووصف المنتج</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:95px; border-left:1px solid #e2e8f0;">رقم السند (Receipt #)</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:60px; border-left:1px solid #e2e8f0;">رقم الطلب (PO #)</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:70px; border-left:1px solid #e2e8f0;">المطلوب</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:72px; border-left:1px solid #e2e8f0;">المستلم (أودو)</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:82px; border-left:1px solid #e2e8f0;">المستلم (كرتون)</th>
            <th style="padding:5px 2px; font-size:9px; font-weight:600; text-align:center; width:50px; border-left:1px solid #e2e8f0;">الحالة</th>
            <th style="padding:5px 3px; font-size:9px; font-weight:600; text-align:center; width:68px; border-left:1px solid #e2e8f0;">التاريخ</th>
            <th style="padding:5px 5px; font-size:9px; font-weight:600; text-align:center; width:125px;">اسم الشركة / المورد</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f8fafc; border-top:1.5px solid #cbd5e1; font-weight:600; font-size:9.5px; color:#1e293b;">
            <td colspan="5" style="padding:5px 8px; text-align:left; border-left:1px solid #e2e8f0; color:#64748b;">الإجمالي:</td>
            <td style="padding:5px 3px; text-align:center; border-left:1px solid #e2e8f0;">${totalDemandUnits.toFixed(2)}</td>
            <td style="padding:5px 3px; text-align:center; border-left:1px solid #e2e8f0;">${totalReceivedUnits.toFixed(2)}</td>
            <td style="padding:5px 3px; text-align:center; border-left:1px solid #e2e8f0;">${totalReceivedWhQty.toFixed(2)} Boxes</td>
            <td colspan="3" style="padding:5px; text-align:center; color:#64748b; font-size:8.5px;">${enrichedItems.length} صنف</td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `

  w.document.open()
  w.document.write(html)
  w.document.close()
}
