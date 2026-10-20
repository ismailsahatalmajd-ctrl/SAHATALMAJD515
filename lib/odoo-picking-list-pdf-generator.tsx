import { fetchOdooApi } from "@/lib/odoo-client"
import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc, formatEnglishNumber } from "@/lib/utils"

export interface OdooPickingListColumnSettings {
  showImage: boolean
  showCode: boolean
  showOdooUnit: boolean
  showBranchesMatrix: boolean
  showBranchWhSubQty: boolean
  showTotalOdooQty: boolean
  showWhQty: boolean
  showWhUnit: boolean
  showDateLot: boolean
  showActual: boolean
  showPick: boolean
  showCheck: boolean
}

export const DEFAULT_ODOO_PICKING_COLUMNS: OdooPickingListColumnSettings = {
  showImage: true,
  showCode: true,
  showOdooUnit: true,
  showBranchesMatrix: true,
  showBranchWhSubQty: true,
  showTotalOdooQty: true,
  showWhQty: true,
  showWhUnit: true,
  showDateLot: true,
  showActual: true,
  showPick: true,
  showCheck: true,
}

export async function generateOdooPickingListPDF(
  aggregatedLines: any[],
  title: string = "قائمة تجميع (مفصلة) - Picking List",
  owners: string[] = [],
  orderIds: string[] = [],
  branchProductCounts: Record<string, number> = {},
  columnSettings?: Partial<OdooPickingListColumnSettings>
) {
  const cols: OdooPickingListColumnSettings = {
    ...DEFAULT_ODOO_PICKING_COLUMNS,
    ...(columnSettings || {}),
  }

  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز قائمة التجميع... (Preparing Picking List...)</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)

  let settings: any = { template: "modern", showBarcode: true, showCompanyInfo: true, signatureText: "المستلم" }
  try {
    settings = await getInvoiceSettings()
  } catch (e) {}

  const logoUrl = typeof window !== "undefined" ? `${window.location.origin}/sahat-almajd-logo.svg` : "/sahat-almajd-logo.svg"
  const dateStr = new Date().toLocaleString("en-GB")

  // Determine all branches present in aggregatedLines
  const branchCountsMap: Record<string, number> = { ...branchProductCounts }
  aggregatedLines.forEach((line: any) => {
    if (line.branchQuantities) {
      Object.keys(line.branchQuantities).forEach((bName) => {
        if (!(bName in branchCountsMap)) {
          branchCountsMap[bName] = 0
        }
        branchCountsMap[bName] += 1
      })
    }
  })

  // Sort branches ascending by product count (least products first -> rightmost in RTL, most products last -> leftmost in RTL)
  const sortedBranches = Object.keys(branchCountsMap).sort(
    (a, b) => (branchCountsMap[a] || 0) - (branchCountsMap[b] || 0)
  )
  const isMatrix = sortedBranches.length > 1 && cols.showBranchesMatrix

  // Fetch Lots from Odoo (only if Date/Lot column is enabled)
  const uniqueProductCodes = Array.from(new Set(aggregatedLines.map((p) => p.code).filter(Boolean)))
  let odooLotsData: Record<string, any[]> = {}
  if (cols.showDateLot && uniqueProductCodes.length > 0) {
    try {
      const res = await fetchOdooApi("/api/odoo/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCodes: uniqueProductCodes }),
      })
      const data = await res.json()
      if (data.success && data.lotsByProduct) {
        odooLotsData = data.lotsByProduct
      }
    } catch (e) {
      console.error("Failed to fetch Odoo lots for PDF", e)
    }
  }

  const enrichedLines = await Promise.all(
    aggregatedLines.map(async (line: any) => {
      let imageUrl = ""
      let warehouseUnit = ""
      let warehouseCategory = ""
      let itemNumber = ""
      let quantityPerCarton = 1
      let warehouseQty = line.quantity

      try {
        const odooCode = line.code
        if (odooCode) {
          const websiteProduct = await db.products.where("productCode").equals(odooCode).first()
          if (websiteProduct) {
            warehouseUnit = websiteProduct.unit || ""
            itemNumber = websiteProduct.itemNumber || ""
            quantityPerCarton = websiteProduct.quantityPerCarton || 1
            warehouseQty = line.quantity / quantityPerCarton

            if (websiteProduct.category) {
              const cat = await db.categories.get(websiteProduct.category)
              warehouseCategory = cat ? cat.name : websiteProduct.category
            }

            if (cols.showImage) {
              if (websiteProduct.image === "DB_IMAGE") {
                const imgData = await db.productImages.get(websiteProduct.id)
                if (imgData?.data) {
                  imageUrl = imgData.data
                }
              } else if (websiteProduct.image) {
                imageUrl = websiteProduct.image
              }
            }
          }
        }
      } catch (e) {}

      warehouseQty = Number.isInteger(warehouseQty) ? warehouseQty : Number(warehouseQty.toFixed(2))
      const odooQty = Number.isInteger(line.quantity) ? line.quantity : Number(line.quantity.toFixed(2))

      // Lot Allocation Logic (FEFO)
      const pLots = odooLotsData[line.code] || []
      let remainingQty = line.quantity
      const allocations: any[] = []

      if (pLots.length > 0) {
        for (const lot of pLots) {
          if (remainingQty <= 0) break
          if (lot.quantity > 0) {
            const take = Math.min(lot.quantity, remainingQty)
            const takeWH = take / quantityPerCarton
            allocations.push({ lotName: lot.lotName, date: lot.date, qty: take, whQty: takeWH })
            remainingQty -= take
            lot.quantity -= take
          }
        }
      }

      if (remainingQty > 0) {
        allocations.push({
          lotName: pLots.length > 0 ? "N/A" : "-",
          date: "-",
          qty: remainingQty,
          whQty: remainingQty / quantityPerCarton,
        })
      }

      return {
        ...line,
        imageUrl: imageUrl ? getSafeImageSrc(imageUrl) : "",
        warehouseUnit,
        warehouseCategory,
        itemNumber,
        quantityPerCarton,
        warehouseQty,
        odooQty,
        allocations,
      }
    })
  )

  // Sort products in Matrix mode exactly like /issues Matrix:
  // 1. Unshared products first, shared products second
  // 2. Minimum product count of requesting branches ascending
  // 3. Item number / code ascending
  if (isMatrix) {
    enrichedLines.sort((a: any, b: any) => {
      const aBranches = Object.keys(a.branchQuantities || {})
      const bBranches = Object.keys(b.branchQuantities || {})
      const aIsShared = aBranches.length > 1
      const bIsShared = bBranches.length > 1

      if (aIsShared !== bIsShared) {
        return aIsShared ? 1 : -1
      }

      const aMinCount = aBranches.length > 0 ? Math.min(...aBranches.map((name) => branchCountsMap[name] || 0)) : 0
      const bMinCount = bBranches.length > 0 ? Math.min(...bBranches.map((name) => branchCountsMap[name] || 0)) : 0
      if (aMinCount !== bMinCount) {
        return aMinCount - bMinCount
      }

      return (a.itemNumber || a.code || "").localeCompare(b.itemNumber || b.code || "", undefined, { numeric: true })
    })
  }

  // Calculate unit totals for footer
  const unitTotals: Record<string, number> = {}
  enrichedLines.forEach((p: any) => {
    const unitName = (p.uom || "Units").trim()
    unitTotals[unitName] = (unitTotals[unitName] || 0) + (Number(p.odooQty) || 0)
  })
  const totalDisplayHtml = Object.entries(unitTotals)
    .map(([unit, qty]) => {
      const formattedQty = formatEnglishNumber(parseFloat(qty.toFixed(3)))
      return `<span style="white-space:nowrap;" dir="rtl"><strong>${formattedQty}</strong> <bdi>${unit}</bdi></span>`
    })
    .join(' <span style="color:#22c55e;margin:0 4px;font-weight:normal;">|</span> ')

  const effectiveTitle = isMatrix ? "تجميع بضاعة (مصفوفة الفروع) - Matrix Picking List" : title

  // Count visible columns for colspan
  const totalCols =
    2 + // # and Product are always shown
    (cols.showImage ? 1 : 0) +
    (cols.showCode ? 1 : 0) +
    (cols.showOdooUnit ? 1 : 0) +
    (isMatrix ? sortedBranches.length : 0) +
    (cols.showTotalOdooQty ? 1 : 0) +
    (cols.showWhQty ? 1 : 0) +
    (cols.showWhUnit ? 1 : 0) +
    (cols.showDateLot ? 1 : 0) +
    (cols.showActual ? 1 : 0) +
    (cols.showPick ? 1 : 0) +
    (cols.showCheck ? 1 : 0)

  const pagesHtml = `
      <div class="page" style="display: block;">
        <table class="items-table" style="width: 100%;">
          <thead>
            <tr>
              <th colspan="${totalCols}" style="background: white; border: none; padding: 0; padding-bottom: 10px;">
                <div class="header" style="border-bottom: 2px solid #2563eb; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${logoUrl}" alt="Sahat Al Majd" class="logo" style="width: 45px; height: 45px; object-fit: contain;" onerror="this.style.display='none'">
                    <div style="text-align: right;">
                      <h1 class="invoice-title" style="margin: 0; color: #2563eb; font-size: 19px; font-weight: 800; line-height:1.2;">${effectiveTitle}</h1>
                      <div style="font-size: 11px; color: #64748b;">
                        ${isMatrix ? `Picking List - Multiple Branches (${sortedBranches.length})` : owners.length === 1 ? owners[0] : "Picking List"}
                      </div>
                    </div>
                  </div>
                  <div class="title-container" style="text-align: left;">
                    <div>
                      <span class="meta-box"><strong>التاريخ:</strong> ${dateStr}</span>
                      <span class="meta-box"><strong>الأصناف:</strong> ${enrichedLines.length}</span>
                    </div>
                    ${
                      orderIds.length > 0
                        ? `<div style="font-weight:bold; margin-top:4px; color:#334155; font-size:10px;">
                            أرقام العمليات: ${orderIds.join(" ، ")}
                          </div>`
                        : ""
                    }
                  </div>
                </div>
              </th>
            </tr>
            <tr>
              <th style="width:26px;">#</th>
              ${cols.showImage ? `<th style="width:45px;">صورة<br><span style="font-weight:normal;font-size:8px">Image</span></th>` : ""}
              ${cols.showCode ? `<th style="width:65px;">كود<br><span style="font-weight:normal;font-size:8px">Code</span></th>` : ""}
              <th style="min-width:140px;">المنتج<br><span style="font-weight:normal;font-size:8px">Product</span></th>
              ${cols.showOdooUnit ? `<th style="width:50px;">وحدة أودو<br><span style="font-weight:normal;font-size:8px">Odoo Unit</span></th>` : ""}
              ${
                isMatrix
                  ? sortedBranches
                      .map((b) => {
                        const isLong = b.length > 12
                        const styleStr = isLong
                          ? "font-size: 8px; line-height: 1.15; white-space: normal; word-wrap: break-word; max-width: 72px; background:#f8fafc;"
                          : "font-size: 10px; white-space: nowrap; background:#f8fafc;"
                        return `<th style="${styleStr}">${b}<br/><span style="font-weight:normal;font-size:7px;display:block;margin-top:2px;color:#64748b;">الكمية</span></th>`
                      })
                      .join("")
                  : ""
              }
              ${
                cols.showTotalOdooQty
                  ? isMatrix
                    ? `<th style="background:#dbeafe; color:#1e40af; font-size:10px; font-weight:bold; text-align:center; width:55px;">إجمالي الكمية<br/><span style="font-weight:normal;font-size:7px;display:block;margin-top:2px;">Total Qty</span></th>`
                    : `<th style="width:55px;">كمية أودو<br><span style="font-weight:normal;font-size:8px">Odoo Qty</span></th>`
                  : ""
              }
              ${cols.showWhQty ? `<th style="width:50px;">كمية الموقع<br><span style="font-weight:normal;font-size:8px">WH Qty</span></th>` : ""}
              ${cols.showWhUnit ? `<th style="width:55px;">وحدة الموقع<br><span style="font-weight:normal;font-size:8px">WH Unit</span></th>` : ""}
              ${cols.showDateLot ? `<th style="width:90px;">التاريخ / اللوت<br><span style="font-weight:normal;font-size:8px">DATE / LOT</span></th>` : ""}
              ${cols.showActual ? `<th style="width:36px;">فعلي<br><span style="font-weight:normal;font-size:8px">Actual</span></th>` : ""}
              ${cols.showPick ? `<th style="width:24px;">✔<br><span style="font-weight:normal;font-size:8px">Pick</span></th>` : ""}
              ${cols.showCheck ? `<th style="width:24px;">🔍<br><span style="font-weight:normal;font-size:8px">Check</span></th>` : ""}
            </tr>
          </thead>
          <tbody>
            ${enrichedLines
              .map((item: any, idx: number) => {
                const rowIndex = idx + 1
                let branchCellsHtml = ""

                if (isMatrix) {
                  let rowTotalQty = 0
                  sortedBranches.forEach((bName) => {
                    const bQty = item.branchQuantities?.[bName] || 0
                    if (bQty > 0) {
                      rowTotalQty += bQty
                      const formattedBQty = Number.isInteger(bQty) ? bQty : Number(bQty.toFixed(2))
                      const bWhQtyRaw = bQty / (item.quantityPerCarton || 1)
                      const bWhQty = Number.isInteger(bWhQtyRaw) ? bWhQtyRaw : Number(bWhQtyRaw.toFixed(2))
                      const showSubWh = cols.showBranchWhSubQty && item.quantityPerCarton && item.quantityPerCarton !== 1

                      branchCellsHtml += `
                        <td style="text-align:center; background:#f0fdf4; font-weight:bold; font-size:11px; padding:3px;">
                          <div style="font-size:13px; color:#16a34a;">${formatEnglishNumber(formattedBQty)}</div>
                          ${showSubWh ? `<div style="font-size:8px; color:#1d4ed8; font-weight:600; margin-top:1px;">(${formatEnglishNumber(bWhQty)} ${item.warehouseUnit || ""})</div>` : ""}
                        </td>
                      `
                    } else {
                      branchCellsHtml += `<td style="text-align:center; color:#cbd5e1; font-size:11px;">—</td>`
                    }
                  })

                  if (cols.showTotalOdooQty) {
                    const formattedRowTotal = Number.isInteger(rowTotalQty) ? rowTotalQty : Number(rowTotalQty.toFixed(2))
                    branchCellsHtml += `
                      <td style="text-align:center; background:#eff6ff; font-weight:bold; font-size:13px; color:#1d4ed8; border:1px solid #94a3b8;">
                        ${formatEnglishNumber(formattedRowTotal)}
                      </td>
                    `
                  }
                } else if (cols.showTotalOdooQty) {
                  branchCellsHtml = `
                    <td style="text-align:center; font-weight:bold; font-size:13px; color:#b91c1c; background:#fefce8; padding: 2px;">
                      ${item.odooQty.toLocaleString("en-US")}
                    </td>
                  `
                }

                return `
                <tr style="page-break-inside: avoid;">
                  <td style="text-align:center; color:#64748b; font-size:9px;">${rowIndex}</td>
                  ${cols.showImage ? `<td style="text-align:center; padding: 1px;">${item.imageUrl ? `<img src="${item.imageUrl}" style="width:38px; height:38px; object-fit:cover; border-radius:4px; display:block; margin:auto;">` : ""}</td>` : ""}
                  ${cols.showCode ? `<td style="text-align:center; font-family:monospace; font-weight:bold; font-size:10px; padding: 2px;">${item.code || "-"}</td>` : ""}
                  <td style="text-align:right; font-weight:600; font-size:10px; padding: 3px 5px; line-height:1.25;">${item.name || "-"}</td>
                  ${cols.showOdooUnit ? `<td style="text-align:center; font-size:9px; padding: 2px;">${item.uom || "-"}</td>` : ""}
                  ${branchCellsHtml}
                  ${cols.showWhQty ? `<td style="text-align:center; font-weight:bold; font-size:12px; color:#1d4ed8; padding: 2px;">${item.warehouseQty.toLocaleString("en-US")}</td>` : ""}
                  ${cols.showWhUnit ? `<td style="text-align:center; font-size:9px; padding: 2px;">${item.warehouseUnit || "-"}</td>` : ""}
                  ${
                    cols.showDateLot
                      ? `<td style="text-align:center; font-size:9px; padding:0; line-height: 1.2;">
                          ${item.allocations
                            .map((a: any, i: number) => {
                              const hasLot = a.lotName !== "-"
                              const qtyStr = Number.isInteger(a.whQty)
                                ? a.whQty.toLocaleString("en-US")
                                : Number(a.whQty.toFixed(2)).toLocaleString("en-US")
                              return `<div style="padding: 3px 2px; ${i < item.allocations.length - 1 ? "border-bottom: 1px solid #cbd5e1;" : ""}">
                              ${a.date !== "-" ? a.date : "---"} ${hasLot ? `<strong style="font-size:10px; color:#1d4ed8;">(${qtyStr})</strong>` : ""}
                              ${hasLot ? `<br><span style="font-size:7px; color:#64748b;">${a.lotName}</span>` : ""}
                            </div>`
                            })
                            .join("")}
                        </td>`
                      : ""
                  }
                  ${cols.showActual ? `<td></td>` : ""}
                  ${cols.showPick ? `<td></td>` : ""}
                  ${cols.showCheck ? `<td></td>` : ""}
                </tr>
              `
              })
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-flex">
            <div class="total-box">
              المجموع: ${totalDisplayHtml}
            </div>
            <div style="flex-grow:1; text-align:center;">
              المحضر: .................... &nbsp;&nbsp;|&nbsp;&nbsp; المراجع: ....................
            </div>
            <div>
              الأصناف: <strong>${enrichedLines.length}</strong>
            </div>
          </div>
        </div>
      </div>
  `

  const finalHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${effectiveTitle}</title>
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap");
        @page { size: A4; margin: 8mm; }
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        * { box-sizing: border-box; }
        .page { background: white; width: 100%; margin: 0 auto; padding: 0; }
        .meta-box { font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 8px; background: #f8fafc; display:inline-block; margin-left:5px; }
        .items-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .items-table th { background-color: #f1f5f9; border: 1px solid #94a3b8; color: #334155; font-size: 10px; padding: 3px 4px; font-weight: 700; text-align: center; white-space: nowrap; }
        .items-table td { border: 1px solid #94a3b8; padding: 3px 4px; font-size: 10px; color: #000; vertical-align: middle; }
        .footer { margin-top: 8px; page-break-inside: avoid; border-top: 2px solid #2563eb; padding-top: 5px; }
        .footer-flex { display: flex; justify-content: space-between; gap: 15px; font-size: 10px; align-items: center; }
        .total-box { background:#f0fdf4; border:1px solid #22c55e; padding:4px 10px; border-radius:4px; font-weight:bold; color:#15803d; line-height: 1.4; font-size: 11px; }
        @media print { 
          body { zoom: 95%; background: white; margin: 0; padding: 0; } 
          .page { margin: 0; padding: 0; box-shadow: none; max-width: 100%; } 
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
      <script>window.onload = () => { setTimeout(() => { window.print(); }, 500); }</script>
    </body>
    </html>
  `
  w.document.open()
  w.document.write(finalHtml)
  w.document.close()
}
