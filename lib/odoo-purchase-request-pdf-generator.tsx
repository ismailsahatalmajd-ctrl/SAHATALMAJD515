import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

export interface PurchaseRequestPrintItem {
  prNumber: string
  requestDate: string
  requestStatus?: string
  vendorNote?: string
  productCode: string
  productName: string
  odooQty: number
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
      .replace(/^[\s\-/|–—:]+|[\s\-/|–—:]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    if (/[a-zA-Z]{2,}/.test(stripped)) {
      name = stripped
    }
  }
  return name || rawName
}

export async function generateOdooPurchaseRequestsPDF(
  items: PurchaseRequestPrintItem[],
  title: string = "PR Report"
) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.open()
  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #7c3aed; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز ملف PDF لطلبات المشتريات (PR)... / Preparing Purchase Requests PDF...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)
  w.document.close()

  let settings: any = {
    template: "modern",
    showBarcode: true,
    showCompanyInfo: true,
    signatureText: "اعتماد المشتريات / المستودع",
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
      const odooQty = Number(item.odooQty) || 0

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
            if (!imageUrl) {
              if (websiteProduct.image === "DB_IMAGE") {
                const rec = await db.productImages.get(websiteProduct.id)
                if (rec?.data) {
                  imageUrl = getSafeImageSrc(rec.data)
                } else {
                  try {
                    const { storage } = await import("@/lib/firebase")
                    const { ref, getDownloadURL } = await import(
                      "firebase/storage"
                    )
                    const storageRef = ref(
                      storage,
                      `product-images/${websiteProduct.id}`
                    )
                    const dl = await getDownloadURL(storageRef)
                    imageUrl = dl
                    await db.productImages
                      .put({ productId: websiteProduct.id, data: dl })
                      .catch(() => {})
                  } catch (e) {}
                }
              } else if (websiteProduct.image) {
                imageUrl = getSafeImageSrc(websiteProduct.image)
              }
            }
          }
        }
      } catch (e) {}

      if (!warehouseUnit) warehouseUnit = "كرتون / Carton"
      const warehouseQty =
        item.warehouseQty !== undefined
          ? item.warehouseQty
          : Number((odooQty / Math.max(1, quantityPerCarton)).toFixed(2))

      return {
        ...item,
        productName: extractCleanEnglishName(item.productName),
        imageUrl,
        warehouseUnit,
        quantityPerCarton,
        warehouseQty,
        odooQty: Number.isInteger(odooQty) ? odooQty : Number(odooQty.toFixed(2)),
      }
    })
  )

  const distinctPrNumbers = Array.from(
    new Set(enrichedItems.map((i) => i.prNumber).filter(Boolean))
  )

  const rowsHtml = enrichedItems
    .map((item, idx) => {
      const prev = idx > 0 ? enrichedItems[idx - 1] : null
      const isSamePrAsPrev = prev && prev.prNumber === item.prNumber

      return `
        <tr class="${isSamePrAsPrev ? "same-pr-row" : "new-pr-row"}">
          <td class="text-center font-bold">${idx + 1}</td>
          <td class="text-center">
            ${
              item.imageUrl
                ? `<img src="${item.imageUrl}" class="prod-img" alt="img" crossorigin="anonymous" />`
                : `<div class="no-img">No Image</div>`
            }
          </td>
          <td class="text-center">
            <div class="pr-badge">${item.prNumber || "مسودة / Draft"}</div>
            ${
              item.vendorNote
                ? `<div class="vendor-note">${item.vendorNote}</div>`
                : ""
            }
          </td>
          <td class="text-center" dir="ltr">
            <div class="prod-name">${item.productName}</div>
            ${
              item.productCode
                ? `<span class="code-badge">[${item.productCode}]</span>`
                : ""
            }
          </td>
          <td class="text-center font-bold" style="color:#475569;">
            ${item.quantityPerCarton}
          </td>
          <td class="text-center wh-qty-cell">
            <div class="qty-num" style="color:#1e40af;">${item.warehouseQty}</div>
            <div class="unit-label" style="color:#2563eb;">${item.warehouseUnit}</div>
          </td>
          <td class="text-center odoo-qty-cell">
            <div class="qty-num" style="color:#065f46;">${item.odooQty}</div>
            <div class="unit-label" style="color:#059669;">${item.odooUnit || "Units"}</div>
          </td>
          <td class="text-center" dir="ltr" style="font-family:monospace; font-size:0.75rem; font-weight:600; color:#334155;">
            ${item.requestDate || "-"}
          </td>
        </tr>
      `
    })
    .join("")

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1e293b;
      background: #fff;
      padding: 16px;
      line-height: 1.35;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .title-area h1 {
      font-size: 1.35rem;
      font-weight: 800;
      color: #000;
      margin-bottom: 4px;
    }
    .title-area p {
      font-size: 0.78rem;
      color: #000;
    }
    .summary-badges {
      display: flex;
      gap: 10px;
      margin-top: 8px;
    }
    .badge {
      background: #fff;
      border: 1px solid #cbd5e1;
      color: #000;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .logo-container {
      width: 110px;
      text-align: left;
    }
    .logo-container img {
      width: 100%;
      height: auto;
      object-fit: contain;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      margin-bottom: 20px;
    }
    th {
      background: #fff;
      color: #000;
      padding: 8px 6px;
      font-weight: 700;
      border: 1px solid #cbd5e1;
      text-align: center;
    }
    th .en-sub {
      display: block;
      font-size: 0.65rem;
      font-weight: 600;
      color: #000;
      margin-top: 2px;
    }
    td {
      padding: 7px 6px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
      background: #fff;
      color: #000;
    }
    tr.new-pr-row {
      border-top: 2px solid #94a3b8;
    }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .pr-badge {
      display: inline-block;
      background: #fff;
      color: #000;
      border: none;
      font-family: monospace;
      font-size: 0.88rem;
      font-weight: 800;
      padding: 2px 4px;
    }
    .vendor-note {
      font-size: 0.68rem;
      color: #000;
      margin-top: 3px;
      font-weight: 600;
    }
    .prod-img {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      background: #fff;
      display: block;
      margin: 0 auto;
    }
    .no-img {
      width: 44px;
      height: 44px;
      border-radius: 6px;
      border: 1px dashed #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      color: #94a3b8;
      margin: 0 auto;
    }
    .prod-name {
      font-weight: 700;
      color: #000;
      font-size: 0.82rem;
      line-height: 1.3;
      margin-bottom: 3px;
    }
    .code-badge {
      display: inline-block;
      background: #fff;
      color: #000;
      font-family: monospace;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 1px 6px;
    }
    .wh-qty-cell {
      background: #fff !important;
    }
    .odoo-qty-cell {
      background: #fff !important;
    }
    .qty-num {
      font-size: 0.95rem;
      font-weight: 800;
    }
    .unit-label {
      font-size: 0.68rem;
      font-weight: 600;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
    }
    @media print {
      body { padding: 6px; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-area">
      <p>تاريخ الطباعة / Print Date: <span dir="ltr">${printDateStr}</span></p>
      <div class="summary-badges">
        <div class="badge">إجمالي الأصناف / Total Items: ${enrichedItems.length}</div>
      </div>
    </div>
    <div class="logo-container">
      <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'" />
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 36px;">#</th>
        <th style="width: 60px;">
          الصورة
          <span class="en-sub">Image</span>
        </th>
        <th style="width: 120px;">
          رقم الطلب (PR)
          <span class="en-sub">PR Number</span>
        </th>
        <th>
          المنتج (الاسم الإنجليزي والكود)
          <span class="en-sub">Product Name & Code</span>
        </th>
        <th style="width: 85px;">
          حبة/كرتون
          <span class="en-sub">Carton Size</span>
        </th>
        <th style="width: 115px;">
          كمية المستودع
          <span class="en-sub">Warehouse Qty & Unit</span>
        </th>
        <th style="width: 115px;">
          كمية أودو
          <span class="en-sub">Odoo Qty & Unit</span>
        </th>
        <th style="width: 130px;">
          تاريخ الطلب
          <span class="en-sub">Request Date</span>
        </th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <div>مسؤول المستودع / Warehouse: ________________________</div>
    <div>قسم المشتريات / Purchasing: ________________________</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>
  `

  w.document.open()
  w.document.write(html)
  w.document.close()
}
