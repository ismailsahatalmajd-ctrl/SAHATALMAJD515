import type { Issue } from "./types"
import { getNumericInvoiceNumber, formatArabicGregorianDate, formatEnglishNumber } from "./utils"
import { getInvoiceSettings } from "./invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

// فاتورة تجميع للمستودع (قابلة للطباعة)
// Warehouse Assembly Invoice (Printable)
export async function generateAssemblyPDF(
  input: Issue | Issue[],
  settingsOverride?: {
    mode: 'merged' | 'detailed',
    showImages: boolean,
    showPrice: boolean,
    showTotal: boolean,
    sortByItemNumber?: boolean
  }
) {
  const w = window.open("", "_blank")
  if (!w) return

  // Loading State
  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز قائمة التجميع... (Preparing Picking List...)</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)

  const issues = Array.isArray(input) ? input : [input]
  const assemblySettings = settingsOverride || {
    mode: 'detailed',
    showImages: true,
    showPrice: false,
    showTotal: false,
    sortByItemNumber: false
  }

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  // Pre-process Data
  const allDbProducts = await db.products.toArray();
  const dbProductsMap = new Map(allDbProducts.map(p => [p.id, p]));

  let groupedData: { branchName: string, products: any[] }[] = []
  const isMerged = assemblySettings.mode === 'merged'

  if (isMerged) {
    const acc = new Map<string, any>()
    for (const issue of issues) {
      for (const p of issue.products) {
        const existing = acc.get(p.productId)
        if (existing) {
          existing.quantity += p.quantity
          existing.totalPrice += p.totalPrice
          existing.notes = [existing.notes, (p as any).notes].filter(Boolean).join(' | ')
        } else {
          acc.set(p.productId, { ...p })
        }
      }
    }

    const mergedList = Array.from(acc.values()).map(p => ({
      ...p,
      itemNumber: dbProductsMap.get(p.productId)?.itemNumber || ""
    }));

    if (assemblySettings.sortByItemNumber) {
      mergedList.sort((a, b) => (a.itemNumber || "").localeCompare(b.itemNumber || "", undefined, { numeric: true }));
    }

    groupedData = [{ branchName: "All Branches / جميع الفروع", products: mergedList }]
  } else {
    // Detailed Mode: Group by Branch
    const branchMap = new Map<string, any[]>()

    // Sort issues by branch name first to ensure order
    const sortedIssues = [...issues].sort((a, b) => (a.branchName || "").localeCompare(b.branchName || ""))

    for (const issue of sortedIssues) {
      const bName = issue.branchName || "Unknown Branch"
      const items = issue.products.map(p => ({
        ...p,
        itemNumber: dbProductsMap.get(p.productId)?.itemNumber || "",
        branchName: bName,
        invoiceNum: getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))
      }))

      if (branchMap.has(bName)) {
        branchMap.get(bName)?.push(...items)
      } else {
        branchMap.set(bName, [...items])
      }
    }

    groupedData = Array.from(branchMap.entries()).map(([k, v]) => {
      if (assemblySettings.sortByItemNumber) {
        v.sort((a, b) => (a.itemNumber || "").localeCompare(b.itemNumber || "", undefined, { numeric: true }));
      }

      // Map current stock to each detailed item
      const mappedV = v.map(item => ({
        ...item,
        currentStock: dbProductsMap.get(item.productId)?.currentStock || 0
      }))

      return { branchName: k, products: mappedV };
    });
  }

  // Calculate Totals
  const allProductsFlat = groupedData.flatMap(g => g.products)
  const totalItemsCount = allProductsFlat.length
  const totalQty = allProductsFlat.reduce((sum, p) => sum + p.quantity, 0)
  const totalAmount = allProductsFlat.reduce((sum, p) => sum + (p.totalPrice || 0), 0)

  // OPTIMIZED: Resolve images (Batch by Unique ID) with STRICT TIMEOUT
  const productImagesMap = new Map<string, string>()
  const uniqueIds = Array.from(new Set(allProductsFlat.map(p => p.productId)))

  // Timeout wrapper
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000)); // 2 Seconds max for images

  const imageLoadPromise = Promise.all(uniqueIds.map(async (id) => {
    // Find one instance to check if it has a direct image (base64) or needs DB fetch
    const p = allProductsFlat.find(x => x.productId === id)
    if (!p) return

    let imgSrc = ""
    if (p.image === 'DB_IMAGE') {
      try {
        const rec = await db.productImages.get(id)
        if (rec && rec.data) imgSrc = getSafeImageSrc(rec.data)
      } catch (e) { }
    } else if (p.image) {
      imgSrc = getSafeImageSrc(p.image)
    }

    if (imgSrc) {
      productImagesMap.set(id, imgSrc)
    }
  }))

  // Race between image loading and timeout
  await Promise.race([imageLoadPromise, timeoutPromise])

  // Generate Table Rows
  let tableRowsHtml = ""
  let globalIndex = 1

  groupedData.forEach(group => {
    // Section Header (If Detailed and > 1 branch)
    const totalCols = 9
      + (assemblySettings.sortByItemNumber ? 1 : 0)
      + (assemblySettings.showImages ? 1 : 0)
      + (assemblySettings.showPrice ? 1 : 0)
      + (assemblySettings.showTotal ? 1 : 0);

    const showGroupHeader = !isMerged && groupedData.length > 1

    if (showGroupHeader) {
      tableRowsHtml += `
        <tr class="group-header">
          <td colspan="${totalCols}" style="background:#e0f2fe; color:#0369a1; font-weight:bold; text-align:right; font-size:14px; padding:6px 12px; border-top:2px solid #bae6fd;">
            فرع: ${group.branchName}
          </td>
        </tr>
      `
    }

    group.products.forEach(p => {
      // Fallback logic: check map first, then check p.image (if not DB_IMAGE)
      let imgSrc = productImagesMap.get(p.productId);
      if (!imgSrc && p.image && p.image !== 'DB_IMAGE') {
        imgSrc = getSafeImageSrc(p.image);
      }
      if (!imgSrc) {
        imgSrc = (typeof window !== 'undefined' ? `${window.location.origin}/placeholder-logo.png` : '/placeholder-logo.png');
      }

      tableRowsHtml += `
       <tr class="item-row">
         <td class="row-index">${globalIndex++}</td>
         ${assemblySettings.sortByItemNumber ? `<td style="text-align:center; font-weight:bold; color:#2563eb; width:40px;">${p.itemNumber || '-'}</td>` : ''}
         ${assemblySettings.showImages ? `<td class="image-cell"><img src="${imgSrc}" alt="" onerror="this.style.display='none'"/></td>` : ''}
         <td class="code-cell">${p.productCode || '-'}</td>
         <td class="name-cell">
           <div class="product-name">${p.productName}</div>
           ${!isMerged && !showGroupHeader && groupedData.length > 1 ? `<div class="branch-tag">${group.branchName}</div>` : ''} 
         </td>
         <td>${p.unit || '-'}</td>
         <td class="qty-cell">${formatEnglishNumber(p.quantity)}</td>
         <td class="notes-cell">${(p as any).notes || ""}</td>
         ${assemblySettings.showPrice ? `<td>${formatEnglishNumber((p.unitPrice || 0).toFixed(2))}</td>` : ''}
         ${assemblySettings.showTotal ? `<td class="subtotal">${formatEnglishNumber((p.totalPrice || 0).toFixed(2))}</td>` : ''}
         <td class="actual-extract"></td>
         <td class="check-cell"></td>
         <td class="inspect-mark"></td>
       </tr>`
    })
  })


  const titleStr = isMerged ? 'تجميع بضاعة (مدمج)' : 'قائمة تجميع (مفصلة)'
  const dateStr = formatArabicGregorianDate(new Date(), { year: "numeric", month: "numeric", day: "numeric" })

  // Single Branch Header Logic
  const singleBranchName = (!isMerged && groupedData.length === 1) ? groupedData[0].branchName : null

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>${titleStr}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 8mm; } /* Minimal Margins */
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; color: #000; padding: 0; margin: 0; }
    
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
    .title-group { display: flex; align-items: center; gap: 10px; }
    .title { color: #2563eb; font-size: 20px; font-weight: 800; line-height: 1.1; }
    .subtitle { font-size: 11px; color: #64748b; }
    
    .meta-box { font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 8px; background: #f8fafc; display:inline-block; margin-left:5px; }
    
    .table { width: 100%; border-collapse: collapse; font-size: 10px; } /* Compact Font */
    th, td { border: 1px solid #94a3b8; padding: 3px 4px; vertical-align: middle; } /* Compact Padding */
    thead th { background: #f1f5f9; font-weight: 700; color: #334155; text-align: center; white-space: nowrap; height: 25px; }
    
    .row-index { width: 25px; text-align: center; color: #64748b; font-size: 9px; }

    .image-cell { width: 60px; text-align: center; padding: 1px; }
    .image-cell img { width: 45px; height: 45px; object-fit: cover; border-radius: 4px; display: block; margin: auto; }
    
    .code-cell { font-family: monospace; font-weight: 600; width: 80px; text-align:center; }
    
    .name-cell { text-align: right; }
    .product-name { 
      font-weight: 600; font-size: 11px;
      overflow: hidden; 
      display: -webkit-box; 
      -webkit-line-clamp: 2; /* STRICT 2-line limit */
      -webkit-box-orient: vertical; 
      line-height: 1.25;
      max-height: 2.5em; /* Fallback height limit */
    }
    .branch-tag, .meta-tag { font-size: 8px; color: #64748b; display: inline-block; background: #f1f5f9; padding: 0 3px; border-radius: 2px; margin-top: 2px; border:1px solid #e2e8f0; }
    
    .qty-cell { font-size: 13px; font-weight: 900; background: #fefce8; text-align: center; width: 45px; }
    .notes-cell { color: #64748b; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    .actual-extract { width: 40px; }
    .check-cell, .inspect-mark { width: 25px; text-align: center; }
    
    .footer { margin-top: 8px; page-break-inside: avoid; border-top: 2px solid #2563eb; padding-top: 5px; }
    .footer-flex { display: flex; justify-content: space-between; gap: 15px; font-size: 10px; align-items:flex-end; }
    
    .total-box { background:#f0fdf4; border:1px solid #22c55e; padding:5px 10px; border-radius:4px; font-weight:bold; color:#15803d; }
    
    @media print {
      body { zoom: 95%; } 
      tr { break-inside: avoid; }
      .group-header { break-after: avoid; }
    }
  </style>
  </head>
  <body>
    <div class="header">
      <div class="title-group">
        <img src="${logoUrl}" alt="Logo" style="width:35px;height:35px;object-fit:contain;" onerror="this.style.display='none'"/>
        <div>
          <div class="title">${titleStr} ${singleBranchName ? `- <span style="color:#000;">${singleBranchName}</span>` : ''}</div>
          <div class="subtitle">Picking List ${singleBranchName ? '' : ' - Multiple Branches'}</div>
        </div>
      </div>
      <div style="text-align:left;">
        <span class="meta-box"><strong>التاريخ:</strong> ${dateStr}</span>
        <span class="meta-box"><strong>الأصناف:</strong> ${totalItemsCount}</span>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          ${assemblySettings.sortByItemNumber ? '<th>التسلسل<br/><span style="font-weight:normal;font-size:9px">No.</span></th>' : ''}
          ${assemblySettings.showImages ? '<th>صورة<br/><span style="font-weight:normal;font-size:9px">Image</span></th>' : ''}
          <th>كود<br/><span style="font-weight:normal;font-size:9px">Code</span></th>
          <th style="width:30%;">المنتج<br/><span style="font-weight:normal;font-size:9px">Product</span></th>
          <th>وحدة<br/><span style="font-weight:normal;font-size:9px">Unit</span></th>
          <th>الكمية<br/><span style="font-weight:normal;font-size:9px">Qty</span></th>
          <th style="max-width:80%; white-space: normal; word-wrap: break-word; overflow-wrap: break-word;">ملاحظات<br/><span style="font-weight:normal;font-size:9px">Notes</span></th>
          ${assemblySettings.showPrice ? '<th>سعر<br/><span style="font-weight:normal;font-size:9px">Price</span></th>' : ''}
          ${assemblySettings.showTotal ? '<th>إجمالي<br/><span style="font-weight:normal;font-size:9px">Total</span></th>' : ''}
          <th>فعلي<br/><span style="font-weight:normal;font-size:9px">Actual</span></th>
          <th>✔<br/><span style="font-weight:normal;font-size:9px">Pick</span></th>
          <th>🔍<br/><span style="font-weight:normal;font-size:9px">Check</span></th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <div class="footer">
      <div class="footer-flex">
        <div class="total-box">
          المجموع: ${formatEnglishNumber(totalQty)} قطعة
        </div>
        <div style="flex-grow:1; text-align:center;">
           المحضر: .................... &nbsp;&nbsp;|&nbsp;&nbsp; المراجع: ....................
        </div>
        <div>
           صفحة <span class="page-count"></span>
        </div>
      </div>
    </div>
    
  </body>
  </html>
  `

  w.document.open()
  w.document.write(html)
  w.document.close()

  // Wait for images to render (slightly longer than before to be safe, but data is ready)
  w.focus()
  setTimeout(() => w.print(), 500)
}
