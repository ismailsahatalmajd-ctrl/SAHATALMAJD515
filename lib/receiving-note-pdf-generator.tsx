import type { ReceivingNote } from "./types"
import { getSafeImageSrc } from "@/lib/utils"
import { db } from "@/lib/db"

export async function generateReceivingNotePDF(note: ReceivingNote): Promise<string> {
  const dateStr = new Date(note.createdAt).toLocaleString("en-GB", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })

  // Resolve images (Batch fetch optimization)
  const itemsNeedingImage = note.items.filter(it => it.image === 'DB_IMAGE' && it.productId);
  const uniqueProductIds = Array.from(new Set(itemsNeedingImage.map(it => it.productId as string)));

  let imageMap = new Map<string, string>();
  if (uniqueProductIds.length > 0) {
    try {
      const images = await db.productImages.bulkGet(uniqueProductIds);
      images.forEach((img, idx) => {
        if (img && img.data) {
          imageMap.set(uniqueProductIds[idx], img.data);
        }
      });
    } catch (e) {
      console.error("Failed to fetch images for PDF", e);
    }
  }

  const itemsWithImages = note.items.map((it) => {
    let finalImage = it.image
    if (it.image === 'DB_IMAGE' && it.productId && imageMap.has(it.productId)) {
      finalImage = imageMap.get(it.productId) || it.image
    }
    return { ...it, resolvedImage: finalImage }
  })

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : 'https://sahatcom.cards/sahat-almajd-logo.svg'
  const placeholderSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e0" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`

  const rows = itemsWithImages.map((it, idx) => {
    let imageSrc = getSafeImageSrc(it.resolvedImage)
    if (imageSrc === '/placeholder.svg') {
      imageSrc = placeholderSvg
    }

    return `
      <tr>
        <td style="width: 35px; background: #f8fafc; font-weight: bold;">${idx + 1}</td>
        <td style="width: 65px">
            <img src="${imageSrc}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #edf2f7" onerror="this.src='${placeholderSvg}'">
        </td>
        <td style="text-align: right; padding: 10px 15px;">
            <div style="font-weight: bold; color: #1a202c;">${it.productName}</div>
            <div style="font-size: 10px; color: #718096; margin-top: 2px;">${it.productCode || '-'}</div>
        </td>
        <td style="width: 80px; text-transform: uppercase; font-size: 11px;">${it.unit}</td>
        <td style="width: 70px; font-weight: 800; font-size: 15px; color: #2b6cb0;">${it.quantity}</td>
        <td style="width: 90px; color: #4a5568;">${it.price ? it.price.toFixed(2) : '0.00'}</td>
        <td style="width: 100px; font-weight: bold; background: #f7fafc;">${it.total ? it.total.toFixed(2) : '0.00'}</td>
        <td style="text-align: right; font-size: 10px; color: #718096; padding-right: 15px; font-style: italic;">${it.notes || '-'}</td>
      </tr>
    `
  }).join("")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>سند استلام بضاعة - ${note.noteNumber}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
          
          @page { size: A4; margin: 12mm; }
          body { 
            font-family: 'Tajawal', 'Segoe UI', sans-serif; 
            color: #2d3748;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .container { max-width: 210mm; margin: 0 auto; }
          
          .header-grid {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            margin-bottom: 25px;
            border-bottom: 3px double #e2e8f0;
            padding-bottom: 15px;
          }

          .header-text-ar { text-align: right; }
          .header-text-en { text-align: left; direction: ltr; }
          .header-text-ar h2, .header-text-en h2 { margin: 0; color: #1a365d; font-size: 20px; font-weight: 900; }
          .header-text-ar p, .header-text-en p { margin: 2px 0 0 0; font-size: 12px; color: #718096; font-weight: 500; }

          .title-area {
            text-align: center;
            margin-top: 10px;
            margin-bottom: 25px;
          }
          .title-area h1 { 
            margin: 0; 
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .title-ar { font-size: 26px; font-weight: 900; color: #2d3748; }
          .title-en { font-size: 14px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 2px; }
          
          .main-info-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 8px 0;
            margin-bottom: 25px;
          }
          .info-cell {
            background: #f8fafc;
            border: 1px solid #edf2f7;
            border-radius: 12px;
            padding: 12px 18px;
            width: 33.33%;
          }
          .info-label-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
          }
          .info-label-ar { font-size: 11px; font-weight: 900; color: #4a5568; }
          .info-label-en { font-size: 9px; font-weight: 700; color: #a0aec0; text-transform: uppercase; }
          .info-value { font-size: 14px; font-weight: 700; color: #1a202c; }
          .info-value.serial { font-size: 18px; color: #3182ce; }

          table.data-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 5px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
          }
          table.data-table th { 
            background: #2d3748; 
            color: white; 
            padding: 12px 10px; 
            font-size: 12px;
            border: 1px solid #2d3748;
            font-weight: 700;
          }
          .th-sub { display: block; font-size: 9px; font-weight: 500; opacity: 0.8; margin-top: 2px; text-transform: uppercase; }
          
          table.data-table td { 
            border: 1px solid #e2e8f0; 
            padding: 8px 10px; 
            text-align: center; 
            font-size: 13px;
            vertical-align: middle;
          }

          .footer-section {
            margin-top: 45px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 25px;
            page-break-inside: avoid;
          }
          .signature-box {
            border: 1px solid #e2e8f0;
            border-radius: 15px;
            padding: 18px;
            position: relative;
            background: #fff;
          }
          .signature-box::after {
            content: '';
            position: absolute;
            bottom: 35px;
            left: 20px;
            right: 20px;
            border-bottom: 1px dashed #cbd5e0;
          }
          .signature-box h4 { 
            margin: 0 0 15px 0; 
            font-size: 13px; 
            font-weight: 900; 
            color: #4a5568;
            display: flex;
            flex-direction: column;
            border-bottom: 1px solid #f7fafc;
            padding-bottom: 8px;
          }
          .sig-en { font-size: 10px; font-weight: 500; color: #a0aec0; text-transform: uppercase; }
          .person-name { font-size: 14px; font-weight: 700; color: #1a202c; min-height: 25px; }
          .sig-label { position: absolute; bottom: 12px; width: calc(100% - 36px); text-align: center; font-size: 10px; font-weight: 700; color: #cbd5e0; }

          .stamp-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .official-stamp {
            width: 140px;
            height: 140px;
            border: 2px dashed #edf2f7;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #e2e8f0;
            font-size: 11px;
            font-weight: 900;
          }
          
          .disclaimer {
            margin-top: 50px;
            padding-top: 15px;
            border-top: 1px solid #edf2f7;
            text-align: center;
            color: #a0aec0;
            direction: rtl;
          }
          .disclaimer-ar { font-size: 11px; font-weight: 500; margin-bottom: 4px; }
          .disclaimer-en { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }

          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-35deg);
            font-size: 70px;
            font-weight: 900;
            color: rgba(0,0,0,0.02);
            z-index: -2;
            white-space: nowrap;
            pointer-events: none;
            letter-spacing: 15px;
          }
        </style>
      </head>
      <body>
        <div class="watermark">RECEIVING NOTE • ساحة المجد</div>
        
        <div class="container">
          <div class="header-grid">
            <div class="header-text-ar">
              <h2>${note.receivingCompany}</h2>
              <p>مستودع السلع والبضائع (المركز الرئيسي)</p>
            </div>
            <div class="header-logo">
              <img src="${logoUrl}" style="height: 85px;" onerror="this.style.display='none'"/>
            </div>
            <div class="header-text-en">
              <h2>SAHAT ALMAJD</h2>
              <p>Goods Warehouse (Main Distribution Center)</p>
            </div>
          </div>

          <div class="title-area">
            <h1>
              <span class="title-ar">سند استلام بضاعة (GRN)</span>
              <span class="title-en">Goods Receiving Note</span>
            </h1>
          </div>

          <table class="main-info-table">
            <tr>
               <td class="info-cell">
                 <div class="info-label-row">
                    <span class="info-label-ar">رقم السند</span>
                    <span class="info-label-en">Receipt No.</span>
                 </div>
                 <div class="info-value serial">${note.noteNumber}</div>
               </td>
               <td class="info-cell">
                 <div class="info-label-row">
                    <span class="info-label-ar">التاريخ والوقت</span>
                    <span class="info-label-en">Date & Time</span>
                 </div>
                 <div class="info-value">${dateStr}</div>
               </td>
               <td class="info-cell">
                 <div class="info-label-row">
                    <span class="info-label-ar">المورد</span>
                    <span class="info-label-en">Supplier</span>
                 </div>
                 <div class="info-value">${note.supplierName}</div>
               </td>
            </tr>
          </table>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width:30px">#</th>
                <th style="width:60px">الصور<span class="th-sub">Photo</span></th>
                <th>اسم المنتج وتفاصيل الصنف<span class="th-sub">Product & Item Details</span></th>
                <th style="width:80px">الوحدة<span class="th-sub">Unit</span></th>
                <th style="width:70px">العدد<span class="th-sub">Qty</span></th>
                <th style="width:90px">السعر<span class="th-sub">Price</span></th>
                <th style="width:100px">الإجمالي<span class="th-sub">Total</span></th>
                <th>ملاحظات<span class="th-sub">Notes</span></th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="footer-section">
            <div class="signature-box">
              <h4>
                <span>طرف الاستلام (ساحة المجد)</span>
                <span class="sig-en">Received by (Sahat Al Majd)</span>
              </h4>
              <div class="person-name">${note.receiverName || '-'}</div>
              <div class="sig-label">التوقيع / Signature</div>
            </div>
            
            <div class="signature-box">
              <h4>
                <span>طرف التسليم (المورد)</span>
                <span class="sig-en">Delivered by (Supplier Rep)</span>
              </h4>
              <div class="person-name">${note.driverName || '-'}</div>
              <div class="sig-label">التوقيع / Signature</div>
            </div>

            <div class="stamp-container">
              <div class="official-stamp">
                <span style="margin-bottom: 5px;">الختم الرسمي</span>
                <span style="font-size: 8px; opacity: 0.5;">OFFICIAL STAMP</span>
              </div>
            </div>
          </div>
          
          <div class="disclaimer">
            <div class="disclaimer-ar">يعتبر هذا السند إثباتاً لاستلام البضاعة فقط، ولا يعد مستنداً مالياً نهائياً للصرف أو السداد.</div>
            <div class="disclaimer-en">This receipt is proof of actual physical delivery only and does not constitute a final financial document for payment.</div>
          </div>
        </div>

        <script>
          window.print && setTimeout(() => window.print(), 800)
        </script>
      </body>
    </html>
  `
  const blob = new Blob([html], { type: "text/html" })
  return URL.createObjectURL(blob)
}
