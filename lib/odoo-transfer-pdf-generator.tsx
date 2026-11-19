import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

export async function generateOdooTransferPDF(transfer: any, transferLines: any[]) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز الفاتورة للطباعة... (Preparing Invoice...)</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)

  let settings: any = { template: 'modern', showBarcode: true, showCompanyInfo: true, signatureText: 'التوقيع' }
  try {
    settings = await getInvoiceSettings()
  } catch(e) {}
  
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  const invoiceNum = transfer.name !== '/' ? transfer.name : "مسودة"
  const invoiceTypeTitle = "فاتورة تحويل داخلي"
  const category = transfer.category_id ? transfer.category_id[1] : "غير محدد"
  const owner = transfer.request_owner_id ? transfer.request_owner_id[1] : "غير محدد"
  const replenishmentType = transfer.replenishment_operation_type_id ? transfer.replenishment_operation_type_id[1] : "غير محدد"
  
  const translateState = (state: string) => {
      const states: Record<string, string> = {
          new: "مسودة",
          pending: "في الانتظار",
          approved: "تم الإرسال (مقبول)",
          refused: "مرفوض",
          cancel: "ملغي",
      }
      return states[state] || state
  }

  const dateStr = (transfer.date || transfer.create_date) ? new Date(transfer.date || transfer.create_date).toLocaleString('en-GB') : '-'

  // Fetch images for each line
  const linesWithImages = await Promise.all(transferLines.map(async (line: any) => {
    let imageUrl = '';
    let warehouseUnit = '';
    let quantityPerCarton = 1;
    let warehouseQty = line.quantity;
    try {
      const lineName = line.product_id ? line.product_id[1] : (line.description || '');
      const matchCode = lineName.match(/^\[(.*?)\]/);
      const odooCode = matchCode ? matchCode[1].trim() : undefined;
      
      if (odooCode) {
        const websiteProduct = await db.products.where('productCode').equals(odooCode).first();
        if (websiteProduct) {
          warehouseUnit = websiteProduct.unit || '';
          quantityPerCarton = websiteProduct.quantityPerCarton || 1;
          warehouseQty = line.quantity / quantityPerCarton;

          if (websiteProduct.image === 'DB_IMAGE') {
            const rec = await db.productImages.get(websiteProduct.id);
            if (rec?.data) {
              imageUrl = getSafeImageSrc(rec.data);
            } else {
              // Try fetching from Firebase directly for printing
              try {
                const { storage } = await import("@/lib/firebase");
                const { ref, getDownloadURL } = await import("firebase/storage");
                const storageRef = ref(storage, `product-images/${websiteProduct.id}`);
                const dl = await getDownloadURL(storageRef);
                imageUrl = dl;
                // Cache it for later
                await db.productImages.put({ productId: websiteProduct.id, data: dl }).catch(() => {});
              } catch(e) {}
            }
          } else if (websiteProduct.image) {
            imageUrl = getSafeImageSrc(websiteProduct.image);
          }
        }
      }
    } catch(e) {}
    
    return { ...line, imageUrl, warehouseUnit, warehouseQty, quantityPerCarton };
  }));

  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة تحويل ${invoiceNum}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: ${settings.template === 'modern' ? '#3b82f6' : (settings.template === 'thermal' ? '#000' : '#2563eb')};
      --text: #1e293b;
      --border: #e2e8f0;
      --bg-light: #f8fafc;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: var(--text);
      line-height: 1.3;
      padding: 10px;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--border);
    }
    .logo-container { width: 100px; height: auto; }
    .logo-container img { width: 100%; height: auto; object-fit: contain; }
    .company-details {
      text-align: left;
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 5px;
    }
    .invoice-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--primary);
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.7rem; }
    th {
      background: var(--primary);
      color: white;
      text-align: right;
      padding: 4px;
      font-weight: 600;
    }
    td {
      padding: 4px;
      border-bottom: 1px solid var(--border);
    }
    tbody tr:nth-child(even) { background: var(--bg-light); }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
    }
    
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 1cm; }
    }
  </style>
</head>
<body>
  <div class="header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:2px solid var(--border); padding-bottom:6px;">
    <div style="display:flex; flex-direction:column; gap:2px;">
      <h1 style="color:var(--primary); font-size:1.4rem; font-weight:800; margin:0;">${invoiceTypeTitle}</h1>
      <div style="font-size:1.1rem; font-weight:700; color:#334155;"># ${invoiceNum}</div>
    </div>
    <div style="text-align:center;">
      <img src="${logoUrl}" style="max-height:45px;" onerror="this.style.display='none'" />
    </div>
    ${settings.showCompanyInfo ? `
    <div style="font-size:0.65rem; color:#64748b; text-align:left; line-height:1.2;">
      <strong>شركة ساحات المجد التجارية</strong><br/>
      Sahat Al-Majd Trading Company
    </div>
    ` : '<div></div>'}
  </div>

  <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; background:var(--bg-light); padding:8px; border-radius:6px; margin-bottom:10px; text-align:center; border:1px solid var(--border);">
    <div>
      <div style="font-size:0.55rem; color:#64748b; text-transform:uppercase;">التاريخ (Date)</div>
      <div style="font-size:0.7rem; font-weight:700; direction:ltr;">${dateStr}</div>
    </div>
    <div>
      <div style="font-size:0.55rem; color:#64748b; text-transform:uppercase;">الطلب (Owner)</div>
      <div style="font-size:0.75rem; font-weight:700;">${owner}</div>
    </div>
    <div>
      <div style="font-size:0.55rem; color:#64748b; text-transform:uppercase;">الحالة (Status)</div>
      <div style="font-size:0.75rem; font-weight:700; color:var(--primary);">${translateState(transfer.request_status)}</div>
    </div>
    <div>
      <div style="font-size:0.55rem; color:#64748b; text-transform:uppercase;">نوع التحويل (Type)</div>
      <div style="font-size:0.65rem; font-weight:700; line-height:1.1;">${replenishmentType}</div>
    </div>
    <div>
      <div style="font-size:0.55rem; color:#64748b; text-transform:uppercase;">الفئة (Category)</div>
      <div style="font-size:0.6rem; font-weight:700; line-height:1.1;">${category}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="text-right">#</th>
        <th class="text-center" style="width: 60px;">الصورة</th>
        <th class="text-right">المنتج / الوصف (Product / Description)</th>
        <th class="text-center">كمية المستودع<br/><span style="font-size:0.75rem;">(Qty Warehouse)</span></th>
        <th class="text-center">الكمية المطلوبة<br/><span style="font-size:0.75rem;">(Qty Odoo)</span></th>
      </tr>
    </thead>
    <tbody>
      ${linesWithImages.map((line: any, index: number) => `
        <tr>
          <td class="text-right">${index + 1}</td>
          <td class="text-center" style="width: 35px;">
            ${line.imageUrl ? `<img src="${line.imageUrl}" style="width:30px; height:30px; object-fit:cover; border-radius:4px; border:1px solid #ddd;" />` : ''}
          </td>
          <td class="text-right font-medium" style="font-size:0.7rem;">
            ${line.product_id ? line.product_id[1] : line.description}
          </td>
          <td class="text-center font-bold text-blue-700 bg-blue-50/30" style="font-size:0.75rem;">
            ${(Number.isInteger(line.warehouseQty) ? line.warehouseQty : Number(line.warehouseQty.toFixed(2))).toLocaleString('en-US')}
            <br/>
            <span style="font-size:0.55rem; color:#64748b;">${line.warehouseUnit || '-'}</span>
          </td>
          <td class="text-center font-bold" style="font-size:0.75rem;">
            ${Number(line.quantity).toLocaleString('en-US')}
            <br/>
            <span style="font-size:0.55rem; color:#64748b;">${line.product_uom_id ? line.product_uom_id[1] : '-'}</span>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div>
      <p style="font-weight:bold;">${settings.signatureText || 'التوقيع / Signature'}: _________________</p>
    </div>
    <div class="text-left">
      <p>: _________________ توقيع السائق</p>
      <p>${new Date().toLocaleString('en-GB')}</p>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  </script>
</body>
</html>
  `

  w.document.open()
  w.document.write(pdfContent)
  w.document.close()
}
