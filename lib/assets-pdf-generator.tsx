import { AssetRequestInvoice, AssetItem } from "@/lib/assets-types"
import { getAssetItems } from "@/lib/assets-storage"

export async function generateAssetsInventoryPDF(assets: AssetItem[]) {
  const w = window.open("", "_blank")
  if (!w) return

  const dateStr = new Date().toLocaleDateString('ar-SA')

  const rows = assets.map((item, index) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${index + 1}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.code}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.category === "ASSET" ? "أصل" : "مادة استهلاكية"}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.totalQuantity}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.expenses}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${item.totalQuantity - item.expenses}</td>
    </tr>
  `).join("")

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>تقرير مخزون الأصول والمواد</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #f8f9fa; padding: 10px; border: 1px solid #ddd; text-align: right; }
          h1 { text-align: center; color: #1e40af; }
          .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: left; margin-bottom: 10px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">طباعة</button>
        </div>
        <h1>تقرير مخزون الأصول والمواد</h1>
        <div class="header-info">
          <div>التاريخ: <strong>${dateStr}</strong></div>
          <div>إجمالي الأصناف: <strong>${assets.length}</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الكود</th>
              <th>الاسم</th>
              <th>التصنيف</th>
              <th>الكمية الإجمالية</th>
              <th>المنصرف</th>
              <th>المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `

  w.document.write(html)
  w.document.close()
}

export async function generateAssetInvoicePDF(invoice: AssetRequestInvoice) {
  const w = window.open("", "_blank")
  if (!w) return

  const assetItems = await getAssetItems()

  const reqDate = new Date(invoice.requestedAt)
  const dateStr = reqDate.toLocaleDateString('en-GB')
  const timeStr = reqDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Calculate totals
  let totalQty = 0
  let grandTotal = 0
  
  const rows = invoice.items.map((item, index) => {
    const qty = item.approvedQuantity || item.requestedQuantity || 0
    const asset = assetItems.find(a => a.id === item.assetId)
    const price = item.price || (asset?.price || 0)
    const total = qty * price
    totalQty += qty
    grandTotal += total

    return `
    <tr>
      <td style="text-align: center;">${index + 1}</td>
      <td style="text-align: center;">
        <div style="width: 40px; height: 40px; margin: 0 auto; background: #f1f1f1; border-radius: 4px; overflow: hidden;">
          <img src="${item.image || ''}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'" />
        </div>
      </td>
      <td style="text-align: center; color: #555;">${item.code}</td>
      <td style="font-weight: bold;">${item.name}</td>
      <td style="text-align: center; font-size: 11px;">${item.unit || "حبة - pcs"}</td>
      <td style="text-align: center; font-weight: bold; font-size: 16px;">${qty}</td>
      <td style="text-align: center;">${price.toFixed(2)}</td>
      <td style="text-align: center; font-weight: bold;">${total.toFixed(2)}</td>
    </tr>
    `
  }).join("")

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>فاتورة صرف منتجات #${invoice.invoiceNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          @font-face {
            font-family: 'Libre Barcode 39 Extended Text';
            font-style: normal;
            font-weight: 400;
            font-display: swap;
            src: url(https://fonts.gstatic.com/s/librebarcode39extendedtext/v22/s_ndnsJ003wQ14b8A0V5-1v500H6wY_O_hT0zBq03wzT.woff2) format('woff2');
          }
          body { 
            font-family: 'Cairo', sans-serif; 
            padding: 20px; 
            color: #333; 
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            color: #2563eb;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
          .header h2 { margin: 5px 0 0; font-size: 14px; font-weight: 400; color: #3b82f6; }
          
          .info-box {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 15px;
          }
          .info-col {
            flex: 1;
          }
          .info-col.left { text-align: left; direction: ltr; border-right: 2px solid #3b82f6; padding-right: 15px; }
          .info-col.right { text-align: right; padding-left: 15px; }
          
          .info-row { margin-bottom: 5px; font-size: 14px; }
          .info-row strong { color: #1e3a8a; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th { border: 1px solid #3b82f6; padding: 10px 5px; text-align: center; color: #3b82f6; font-weight: 700; background: #fff; }
          td { border: 1px solid #ddd; padding: 8px 5px; vertical-align: middle; }
          th .eng { display: block; font-size: 9px; font-weight: normal; color: #94a3b8; margin-top: 2px; }
          
          .totals-bar {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #ddd;
            padding: 10px 0;
            margin-top: 10px;
            font-size: 14px;
            color: #64748b;
          }
          .grand-total {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            color: #2563eb;
            margin: 20px 0;
          }
          
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            text-align: center;
            font-size: 14px;
          }
          .sig-box { width: 30%; }
          .sig-box strong { display: block; margin-bottom: 5px; color: #1e293b; }
          .sig-box .eng { font-size: 11px; color: #64748b; margin-bottom: 40px; }
          .sig-line { border-top: 1px dashed #94a3b8; padding-top: 5px; color: #94a3b8; font-size: 12px; }
          
          @media print {
            button { display: none; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: left; margin-bottom: 10px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Cairo', sans-serif;">طباعة</button>
        </div>
        
        <div class="header">
          <h1>Products Issue Invoice / فاتورة صرف منتجات</h1>
          <h2>مستودع ساحة المجد / Sahat Almajd Warehouse</h2>
        </div>

        <div class="info-box">
          <div class="info-col right">
            <div class="info-row" style="color: #64748b; font-weight: bold; margin-bottom: 10px;">معلومات الفرع<br/><span style="font-size:10px;">Branch Info</span></div>
            <div class="info-row"><strong>اسم الفرع / Branch Name:</strong> ${invoice.branchName}</div>
            <div class="info-row"><strong>رقم الجوال / Phone:</strong> -</div>
            <div class="info-row"><strong>عدد المنتجات / Products Count:</strong> ${invoice.items.length}</div>
            <div class="info-row"><strong>الحالة / Status:</strong> ${invoice.status}</div>
            <div class="info-row"><strong>ملاحظات / Notes:</strong> ${invoice.generalNotes || 'فاتورة صرف'}</div>
          </div>
          <div class="info-col left">
            <div class="info-row" style="color: #64748b; font-weight: bold; margin-bottom: 10px; text-align:right;">معلومات الفاتورة<br/><span style="font-size:10px;">Invoice Info</span></div>
            <div class="info-row"><strong>Invoice No:</strong> ${invoice.invoiceNumber} <strong style="float:right;">رقم الفاتورة /</strong></div>
            <div class="info-row"><strong>Date:</strong> ${dateStr} <strong style="float:right;">التاريخ /</strong></div>
            <div class="info-row"><strong>Time:</strong> ${timeStr} <strong style="float:right;">الوقت /</strong></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th style="width:50px;">الصورة<span class="eng">Image</span></th>
              <th style="width:80px;">كود المنتج<span class="eng">Product Code</span></th>
              <th>اسم المنتج<span class="eng">Product Name</span></th>
              <th style="width:60px;">الوحدة<span class="eng">Unit</span></th>
              <th style="width:60px;">الكمية<span class="eng">Qty</span></th>
              <th style="width:70px;">سعر الوحدة<span class="eng">Price</span></th>
              <th style="width:80px;">الإجمالي<span class="eng">Total</span></th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        
        <div class="totals-bar">
          <div>إجمالي الكميات / Total Quantity: <strong>${totalQty}</strong></div>
          <div>عدد الأصناف / Items Count: <strong>${invoice.items.length}</strong></div>
        </div>

        <div class="grand-total">
          الإجمالي الكلي / Grand Total: ${grandTotal.toFixed(2)} ريال
        </div>

        <div class="signatures">
          <div class="sig-box">
            <strong>المستلم من الفرع</strong>
            <div class="eng">Branch Receiver</div>
            <div class="sig-line">الاسم والتوقيع / Name & Signature</div>
          </div>
          <div class="sig-box">
            <strong>السائق</strong>
            <div class="eng">Driver</div>
            <div class="sig-line">الاسم والتوقيع / Name & Signature</div>
          </div>
          <div class="sig-box">
            <strong>المرسل من المستودع</strong>
            <div class="eng">Warehouse Dispatcher</div>
            <div class="sig-line">الاسم والتوقيع / Name & Signature</div>
          </div>
        </div>
        
        <script>
          setTimeout(() => { window.print() }, 800)
        </script>
      </body>
    </html>
  `

  w.document.write(html)
  w.document.close()
}

export async function generateAssetAssemblyPDF(
  invoices: AssetRequestInvoice[],
  options: {
    mode: 'merged' | 'detailed',
    showImages: boolean,
    showPrices: boolean,
    showTotal: boolean,
    sortByItemNumber: boolean
  }
) {
  const w = window.open("", "_blank")
  if (!w) return

  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز قائمة التجميع...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)

  let html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>قائمة تجميع الصرف</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          body { 
            font-family: 'Cairo', sans-serif; 
            padding: 20px; 
            color: #333; 
            max-width: 900px;
            margin: 0 auto;
          }
          
          .top-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .title-area h1 {
            color: #2563eb;
            font-size: 24px;
            margin: 0;
          }
          .title-area h2 {
            color: #3b82f6;
            font-size: 12px;
            margin: 0;
            font-weight: normal;
          }
          .meta-badges {
            display: flex;
            gap: 10px;
          }
          .badge {
            border: 1px solid #cbd5e1;
            padding: 5px 15px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
          }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th { border: 1px solid #2563eb; padding: 5px; text-align: center; font-weight: 700; color: #1e3a8a; }
          td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: middle; }
          
          th .eng { display: block; font-size: 9px; font-weight: normal; color: #64748b; margin-top: 2px; }
          
          .branch-row td {
            background-color: #eff6ff;
            color: #1e40af;
            font-weight: bold;
            font-size: 14px;
            text-align: right;
            padding: 8px 10px;
            border: 1px solid #2563eb;
          }

          .box-col {
            width: 30px;
          }
          
          .bottom-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            border-top: 1px solid #cbd5e1;
            padding-top: 15px;
            font-size: 14px;
            color: #475569;
          }
          .total-badge {
            border: 2px solid #22c55e;
            color: #16a34a;
            padding: 5px 20px;
            border-radius: 6px;
            font-weight: bold;
            font-size: 16px;
          }
          
          @media print {
            button { display: none; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: left; margin-bottom: 10px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: 'Cairo', sans-serif;">طباعة Print</button>
        </div>
  `

  const assetItems = await getAssetItems()
  const todayStr = new Date().toLocaleDateString('en-GB')

  const tableHeader = `
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        ${options.showImages ? '<th style="width:60px;">صورة<span class="eng">Image</span></th>' : ''}
        <th style="width:80px;">كود<span class="eng">Code</span></th>
        <th>المنتج<span class="eng">Product</span></th>
        <th style="width:80px;">وحدة<span class="eng">Unit</span></th>
        <th style="width:50px;">الكمية<span class="eng">Qty</span></th>
        <th style="width:100px;">ملاحظات<span class="eng">Notes</span></th>
        <th class="box-col">فعلي<span class="eng">Actual</span></th>
        <th class="box-col">✔<span class="eng">Pick</span></th>
        <th class="box-col">🔍<span class="eng">Check</span></th>
      </tr>
    </thead>
  `

  if (options.mode === 'merged') {
    const itemsMap: Record<string, { code: string, name: string, qty: number, price: number, image?: string, unit?: string }> = {}
    
    for (const inv of invoices) {
      for (const item of inv.items) {
        if (item.status === 'REJECTED') continue
        const qty = item.approvedQuantity || item.requestedQuantity
        const asset = assetItems.find(a => a.id === item.assetId)
        const price = item.price || (asset?.price || 0)
        const unit = item.unit || asset?.unit || "حبة - pcs"

        if (!itemsMap[item.assetId]) {
          itemsMap[item.assetId] = { code: item.code, name: item.name, qty: 0, price: price, image: item.image, unit }
        }
        itemsMap[item.assetId].qty += qty
      }
    }

    const allItems = Object.values(itemsMap)
    if (options.sortByItemNumber) {
      allItems.sort((a, b) => a.code.localeCompare(b.code))
    }
    
    let totalQty = 0
    allItems.forEach(i => totalQty += i.qty)

    html += `
        <div class="top-header">
          <div class="title-area">
            <h1>تجميع بضاعة (مدمج)</h1>
            <h2>Picking List - Multiple Branches</h2>
          </div>
          <div class="meta-badges">
            <div class="badge">التاريخ: ${todayStr}</div>
            <div class="badge">الأصناف: ${allItems.length}</div>
          </div>
        </div>

        <table>
          ${tableHeader}
          <tbody>
            ${allItems.map((item, idx) => `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                ${options.showImages ? `<td style="text-align:center;"><div style="width:40px; height:40px; background:#f1f1f1; margin:auto;"><img src="${item.image || ''}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'"/></div></td>` : ''}
                <td style="text-align:center;">${item.code}</td>
                <td style="font-weight:bold;">${item.name}</td>
                <td style="text-align:center;">${item.unit}</td>
                <td style="text-align:center; font-size:16px; font-weight:bold;">${item.qty}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="bottom-bar">
          <div class="total-badge">المجموع: ${totalQty} قطعة</div>
          <div>المحضر: ...................... | المراجع: ......................</div>
          <div>صفحة 1</div>
        </div>
    `

  } else {
    // Detailed Mode
    let totalItemsCount = 0
    
    html += `
        <div class="top-header">
          <div class="title-area">
            <h1>قائمة تجميع (مفصلة)</h1>
            <h2>Picking List - Multiple Branches</h2>
          </div>
          <div class="meta-badges">
            <div class="badge">التاريخ: ${todayStr}</div>
            <div class="badge">عدد الفواتير: ${invoices.length}</div>
          </div>
        </div>
        <table>
          ${tableHeader}
          <tbody>
    `

    for (const inv of invoices) {
      let items = [...inv.items].filter(i => i.status !== 'REJECTED')
      if (options.sortByItemNumber) {
        items.sort((a, b) => a.code.localeCompare(b.code))
      }
      totalItemsCount += items.length
      
      html += `
            <tr class="branch-row">
              <td colspan="${options.showImages ? 10 : 9}">فرع / ${inv.branchName}</td>
            </tr>
            ${items.map((item, idx) => {
              const qty = item.approvedQuantity || item.requestedQuantity
              const asset = assetItems.find(a => a.id === item.assetId)
              const unit = item.unit || asset?.unit || "حبة - pcs"
              return `
              <tr>
                <td style="text-align:center;">${idx + 1}</td>
                ${options.showImages ? `<td style="text-align:center;"><div style="width:40px; height:40px; background:#f1f1f1; margin:auto;"><img src="${item.image || ''}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'"/></div></td>` : ''}
                <td style="text-align:center;">${item.code}</td>
                <td style="font-weight:bold;">${item.name}</td>
                <td style="text-align:center;">${unit}</td>
                <td style="text-align:center; font-size:16px; font-weight:bold;">${qty}</td>
                <td style="color:#64748b; font-size:10px;">${item.managerNotes || item.notes || ''}</td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            `}).join('')}
      `
    }
    
    html += `
          </tbody>
        </table>
        <div class="bottom-bar">
          <div class="total-badge">إجمالي الأصناف: ${totalItemsCount}</div>
          <div>المحضر: ...................... | المراجع: ......................</div>
          <div>صفحة 1</div>
        </div>
    `
  }

  html += `
      </body>
    </html>
  `

  setTimeout(() => {
    w.document.open()
    w.document.write(html)
    w.document.close()
  }, 500)
}

export async function generateAssetBranchRequestPDF(invoice: AssetRequestInvoice) {
  if (typeof window === "undefined") return

  const w = window.open("", "_blank")
  if (!w) return

  const dateStr = new Date(invoice.requestedAt || Date.now()).toLocaleString("en-GB", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })

  const requestNo = invoice.invoiceNumber
  const title = `Branch Request - ${invoice.branchName} / طلب اصول و مواد`

  const logoUrl = `${window.location.origin}/sahat-almajd-logo.svg`

  const rows = invoice.items.map((it, idx) => {
    const qty = it.requestedQuantity || 0

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${it.image && it.image !== 'DB_IMAGE' ? `<img src="${it.image}" style="width:40px;height:40px;object-fit:cover">` : ''}</td>
        <td>${it.code || "-"}</td>
        <td>${it.name}</td>
        <td>${it.unit || "حبة - pcs"}</td>
        <td>${qty}</td>
        <td style="color:#555;">${it.notes || "—"}</td>
      </tr>
    `
  }).join("")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          @page { size: A4; margin: 10mm; }
          body { font-family: 'Cairo', system-ui, sans-serif; padding: 20px; max-width: 210mm; margin: 0 auto; color: #333; }
          @media print {
            body { padding: 0; width: 100%; max-width: none; }
            table { font-size: 12px; }
            th, td { padding: 6px; }
          }
          h1, h2, h3 { text-align: center; margin: 0; }
          .header-container { text-align: center; margin-bottom: 30px; }
          .logo { width: 50px; height: 50px; object-fit: contain; margin-bottom: 10px; }
          .meta-container { 
            display: flex; justify-content: space-between; align-items: flex-end; 
            margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 15px; font-size: 14px;
          }
          .meta-right { text-align: right; }
          .meta-left { text-align: left; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: center; vertical-align: middle; }
          th { background: #2563eb; color: white; font-weight: bold; }
          .footer-text { margin-top: 30px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
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
             <div style="margin-bottom: 5px;"><strong>Request No / رقم الطلب:</strong> <span style="font-size: 16px; font-weight: bold;">${requestNo}</span></div>
             <div style="font-size: 12px; color: #777;">ID: ${invoice.id.slice(0, 8)}</div>
          </div>
          <div class="meta-left" dir="ltr">
             <div style="margin-bottom: 5px;"><strong>Date / التاريخ:</strong> ${dateStr}</div>
             <div><strong>Branch / اسم الفرع:</strong> ${invoice.branchName}</div>
             <div><strong>Type / النوع:</strong> أصول ومواد - Assets & Materials</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th style="width:60px;">الصورة<br/>Image</th>
              <th style="width:100px;">كود المنتج<br/>Code</th>
              <th>اسم المنتج<br/>Product Name</th>
              <th style="width:80px;">الوحدة<br/>Unit</th>
              <th style="width:80px;">الكمية<br/>Quantity</th>
              <th style="width:150px;">ملاحظات<br/>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        ${invoice.generalNotes ? `
        <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
          <h3 style="font-size: 14px; margin-bottom: 8px; color: #4b5563; text-align: right;">ملاحظات عامة / General Notes:</h3>
          <p style="margin: 0; font-size: 13px; color: #1f2937;">${invoice.generalNotes}</p>
        </div>
        ` : ""}
        
        <script>
           setTimeout(() => {
             window.print();
           }, 800);
        </script>
      </body>
    </html>
  `

  setTimeout(() => {
    w.document.open()
    w.document.write(html)
    w.document.close()
  }, 100)
}

export function getAssetDispenseHtmlSnippet(invoice: AssetRequestInvoice, includeWrapper: boolean = true): string {
  const reqDate = new Date(invoice.dispensedAt || invoice.requestedAt || new Date())
  const dateStr = reqDate.toLocaleDateString('en-GB')
  const timeStr = reqDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const dispensedItems = invoice.items.filter(i => (i.dispenseQty || 0) > 0);
  const purchasedItems = invoice.items.filter(i => (i.purchaseQty || 0) > 0);
  const rejectedItems = invoice.items.filter(i => (i.dispenseQty || 0) === 0 && (i.purchaseQty || 0) === 0);

  let totalQty = 0;
  let grandTotal = 0;
  
  const renderTable = (items: typeof dispensedItems, columns: {title: string, eng: string}[], rowRenderer: (item: any, idx: number) => string) => {
    return `
      <table>
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            ${columns.map(c => `<th>${c.title}<span class="eng">${c.eng}</span></th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => rowRenderer(item, idx)).join('')}
        </tbody>
      </table>
    `;
  };

  const dispensedTable = dispensedItems.length > 0 ? `
    <h3 style="margin-top: 20px; color: #1e3a8a; font-family: 'Cairo', sans-serif;">المنتجات المصروفة (مرفقة مع هذا السند)</h3>
    ${renderTable(
      dispensedItems, 
      [
        {title: "كود المنتج", eng: "Product Code"}, 
        {title: "اسم المنتج", eng: "Product Name"}, 
        {title: "الكمية المصروفة", eng: "Dispensed Qty"},
        {title: "سعر الوحدة", eng: "Unit Price"},
        {title: "الإجمالي", eng: "Total"}
      ],
      (item, idx) => {
        const total = (item.dispenseQty || 0) * (item.price || 0);
        totalQty += (item.dispenseQty || 0);
        grandTotal += total;
        return `
          <tr>
            <td>${idx + 1}</td>
            <td style="font-size: 10px; font-family: monospace;">${item.code || '-'}</td>
            <td style="font-weight: bold; text-align: right;">${item.name}</td>
            <td style="font-weight: bold; font-size: 16px;">${item.dispenseQty}</td>
            <td>${(item.price || 0).toFixed(2)}</td>
            <td style="font-weight: bold;">${total.toFixed(2)}</td>
          </tr>
        `;
      }
    )}
  ` : '<p style="text-align: center; color: #64748b; margin-top: 20px;">لا يوجد منتجات مصروفة من المستودع.</p>';

  const purchasedTable = purchasedItems.length > 0 ? `
    <h3 style="margin-top: 30px; color: #d97706; font-family: 'Cairo', sans-serif;">منتجات بانتظار الشراء (سيتم توفيرها لاحقاً)</h3>
    ${renderTable(
      purchasedItems,
      [
        {title: "كود المنتج", eng: "Product Code"}, 
        {title: "اسم المنتج", eng: "Product Name"}, 
        {title: "الكمية المطلوبة", eng: "Requested Qty"}
      ],
      (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td style="font-size: 10px; font-family: monospace;">${item.code || '-'}</td>
          <td style="font-weight: bold; text-align: right;">${item.name}</td>
          <td style="font-weight: bold; color: #d97706;">${item.purchaseQty}</td>
        </tr>
      `
    )}
  ` : '';

  const rejectedTable = rejectedItems.length > 0 ? `
    <h3 style="margin-top: 30px; color: #dc2626; font-family: 'Cairo', sans-serif;">منتجات معتذر عنها (مرفوضة)</h3>
    ${renderTable(
      rejectedItems,
      [
        {title: "كود المنتج", eng: "Product Code"}, 
        {title: "اسم المنتج", eng: "Product Name"}, 
        {title: "سبب الرفض / الاعتذار", eng: "Rejection Reason"}
      ],
      (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td style="font-size: 10px; font-family: monospace;">${item.code || '-'}</td>
          <td style="font-weight: bold; text-align: right;">${item.name}</td>
          <td style="color: #dc2626; font-weight: bold;">${item.rejectionReason || 'غير متوفر'}</td>
        </tr>
      `
    )}
  ` : '';

  const innerContent = `
    <div class="invoice-page">
      <div class="header">
        <h1>فاتورة صرف طلب فرع / Branch Dispense Invoice</h1>
        <h2>مستودع ساحة المجد / Sahat Almajd Warehouse</h2>
      </div>

      <div class="info-box">
        <div class="info-col right">
          <div class="info-row" style="color: #64748b; font-weight: bold; margin-bottom: 10px;">معلومات الفرع<br/><span style="font-size:10px;">Branch Info</span></div>
          <div class="info-row"><strong>اسم الفرع / Branch Name:</strong> ${invoice.branchName}</div>
          <div class="info-row"><strong>عدد المنتجات / Products Count:</strong> ${invoice.items.length}</div>
          <div class="info-row"><strong>الحالة / Status:</strong> APPROVED</div>
          <div class="info-row"><strong>ملاحظات / Notes:</strong> ${invoice.generalNotes || 'فاتورة صرف'}</div>
        </div>
        <div class="info-col left">
          <div class="info-row" style="color: #64748b; font-weight: bold; margin-bottom: 10px; text-align:right;">معلومات الفاتورة<br/><span style="font-size:10px;">Invoice Info</span></div>
          <div class="info-row"><strong>Invoice No:</strong> ${invoice.invoiceNumber} <strong style="float:right;">رقم الفاتورة /</strong></div>
          <div class="info-row"><strong>Date:</strong> ${dateStr} <strong style="float:right;">التاريخ /</strong></div>
          <div class="info-row"><strong>Time:</strong> ${timeStr} <strong style="float:right;">الوقت /</strong></div>
        </div>
      </div>

      ${dispensedTable}
      ${purchasedTable}
      ${rejectedTable}
      
      <div class="totals-bar">
        <div>إجمالي الكميات المصروفة / Total Dispensed Qty: <strong>${totalQty}</strong></div>
        <div>عدد الأصناف / Items Count: <strong>${invoice.items.length}</strong></div>
      </div>

      <div class="grand-total">
        الإجمالي الكلي / Grand Total: ${grandTotal.toFixed(2)} ريال
      </div>

      <div class="signatures">
        <div class="sig-box">
          <strong>المستلم من الفرع</strong>
          <div class="eng">Branch Receiver</div>
          <div class="sig-line">الاسم والتوقيع / Name & Signature</div>
        </div>
        <div class="sig-box">
          <strong>السائق</strong>
          <div class="eng">Driver</div>
          <div class="sig-line">الاسم والتوقيع / Name & Signature</div>
        </div>
        <div class="sig-box">
          <strong>المرسل من المستودع</strong>
          <div class="eng">Warehouse Dispatcher</div>
          <div class="sig-line">الاسم والتوقيع / Name & Signature</div>
        </div>
      </div>
    </div>
  `;

  if (!includeWrapper) return innerContent;

  return `
    <html dir="rtl" lang="ar">
      <head>
        <title>فاتورة صرف - ${invoice.invoiceNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          body { 
            font-family: 'Cairo', sans-serif; 
            padding: 20px; 
            color: #333; 
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            color: #2563eb;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
          .header h2 { margin: 5px 0 0; font-size: 14px; font-weight: 400; color: #3b82f6; }
          
          .info-box {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 15px;
          }
          .info-col { flex: 1; }
          .info-col.left { text-align: left; direction: ltr; border-right: 2px solid #3b82f6; padding-right: 15px; }
          .info-col.right { text-align: right; padding-left: 15px; }
          
          .info-row { margin-bottom: 5px; font-size: 14px; }
          .info-row strong { color: #1e3a8a; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th { border: 1px solid #3b82f6; padding: 10px 5px; text-align: center; color: #3b82f6; font-weight: 700; background: #fff; }
          td { border: 1px solid #ddd; padding: 8px 5px; vertical-align: middle; text-align: center; }
          th .eng { display: block; font-size: 9px; font-weight: normal; color: #94a3b8; margin-top: 2px; }
          
          .totals-bar {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #ddd;
            padding: 10px 0;
            margin-top: 10px;
            font-size: 14px;
            color: #64748b;
          }
          .grand-total {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            color: #2563eb;
            margin: 20px 0;
          }
          
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            text-align: center;
            font-size: 14px;
            page-break-inside: avoid;
          }
          .sig-box { width: 30%; }
          .sig-box strong { display: block; margin-bottom: 5px; color: #1e293b; }
          .sig-box .eng { font-size: 11px; color: #64748b; margin-bottom: 40px; }
          .sig-line { border-top: 1px dashed #94a3b8; padding-top: 5px; color: #94a3b8; font-size: 12px; }
          
          @media print {
            body { padding: 0; max-width: 100%; }
            .invoice-page { page-break-after: always; padding-bottom: 30px; margin-bottom: 30px; }
            .invoice-page:last-child { page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        ${innerContent}
        <script>setTimeout(() => { window.print() }, 800)</script>
      </body>
    </html>
  `;
}

export function getAssetPurchaseOrderHtmlSnippet(po: any, includeWrapper: boolean = true): string {
  const reqDate = new Date(po.createdAt || new Date())
  const dateStr = reqDate.toLocaleDateString('en-GB')
  
  const innerContent = `
    <div class="invoice-page">
      <div class="header" style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px;">
        <div class="company-logo" style="font-size: 24px; font-weight: 800; color: #1e3a8a;">SAHAT AL MAJD / ساحة المجد</div>
        <div class="invoice-title" style="text-align: right;">
          <h1 style="color: #3b82f6; font-size: 22px; margin-bottom: 5px;">فاتورة مشتريات</h1>
          <p style="color: #64748b; font-size: 14px;">Purchase Invoice</p>
        </div>
      </div>

      <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 13px;">
        <div class="info-box" style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; text-align: right;">
          <span class="info-label" style="color: #64748b; font-weight: 600; margin-bottom: 4px; display: block;">المورد / Supplier</span>
          <span class="info-value" style="color: #0f172a; font-weight: 700;">${po.supplierName || "---"}</span>
        </div>
        <div class="info-box" style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; text-align: right;">
          <span class="info-label" style="color: #64748b; font-weight: 600; margin-bottom: 4px; display: block;">رقم العملية / Operation No.</span>
          <span class="info-value" style="color: #0f172a; font-weight: 700; font-family: monospace;">#${po.poNumber}</span>
        </div>
        <div class="info-box" style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; text-align: right;">
          <span class="info-label" style="color: #64748b; font-weight: 600; margin-bottom: 4px; display: block;">تاريخ الفاتورة / Date</span>
          <span class="info-value" style="color: #0f172a; font-weight: 700;">${dateStr}</span>
        </div>
        <div class="info-box" style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; text-align: right;">
          <span class="info-label" style="color: #64748b; font-weight: 600; margin-bottom: 4px; display: block;">رقم فاتورة المورد / Supplier Inv No.</span>
          <span class="info-value" style="color: #0f172a; font-weight: 700;">---</span>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px;">
        <thead>
          <tr>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: center; width: 50px;">#</th>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: center; width: 60px;">صورة / Image</th>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: right;">المنتج / Product</th>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: center;">الوجهة / Routing</th>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: center;">الكمية / Qty</th>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: center;">السعر / Unit Price</th>
            <th style="background: #3b82f6; color: white; padding: 12px 8px; text-align: center;">الإجمالي / Total</th>
          </tr>
        </thead>
        <tbody>
          ${po.items.map((item: any, index: number) => `
            <tr style="background: ${index % 2 === 0 ? '#fff' : '#f1f5f9'};">
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${index + 1}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                ${item.image ? `<img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" />` : ''}
              </td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">
                ${item.name}
                <div style="font-size: 10px; color: #64748b; font-family: monospace; margin-top: 2px;">${item.code || ''}</div>
              </td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                ${item.routing === 'WAREHOUSE' ? 'المستودع' : (item.branchName || 'فرع مباشر')}
              </td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${item.quantity}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${(item.unitPrice || 0).toFixed(2)}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #1e3a8a;">${(item.totalPrice || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display: flex; justify-content: flex-end;">
        <div style="width: 250px;">
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="color: #64748b;">إجمالي الكمية / Total Qty:</span>
            <strong style="color: #0f172a;">${po.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 15px 0 8px 0; color: #3b82f6; font-size: 16px; font-weight: 800;">
            <span>الإجمالي النهائي / Grand Total:</span>
            <span>${(po.totalValue || 0).toFixed(2)} SAR</span>
          </div>
        </div>
      </div>
      
      ${po.invoiceImages && po.invoiceImages.length > 0 ? `
      <div style="margin-top: 40px; page-break-inside: avoid;">
        <h3 style="color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">صور الفاتورة المرفقة / Attached Invoice Images</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 15px;">
          ${po.invoiceImages.map((img: string) => `
            <img src="${img}" style="max-width: 100%; max-height: 400px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 8px;" />
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="footer" style="margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; color: #0f172a;">
          <div>
            <strong>توقيع المندوب / Rep Signature</strong>
            <div style="margin-top: 30px; border-top: 1px dashed #94a3b8; width: 200px; padding-top: 5px;"></div>
          </div>
          <div>
            <strong>توقيع أمين المستودع / Storekeeper Signature</strong>
            <div style="margin-top: 30px; border-top: 1px dashed #94a3b8; width: 200px; padding-top: 5px;"></div>
          </div>
        </div>
        <p>تم استخراج هذا المستند آلياً من نظام ساحة المجد</p>
        <p>Generated by Sahat Al Majd System</p>
      </div>
    </div>
  `;

  if (!includeWrapper) return innerContent;

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>فاتورة مشتريات / Purchase Invoice #${po.poNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', 'Segoe UI', serif; }
          body { padding: 30px; background: white; color: #1e293b; max-width: 900px; margin: 0 auto; }
          @media print {
            body { padding: 0px; max-width: 100%; }
            .invoice-page { page-break-after: always; padding-bottom: 20px; margin-bottom: 20px; }
            .invoice-page:last-child { page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        ${innerContent}
        <script>setTimeout(() => { window.print() }, 800)</script>
      </body>
    </html>
  `;
}
