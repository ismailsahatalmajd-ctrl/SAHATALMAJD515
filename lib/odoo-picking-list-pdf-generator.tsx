import { fetchOdooApi } from "@/lib/odoo-client"

import { getInvoiceSettings } from "@/lib/invoice-settings-store"
import { db } from "@/lib/db"
import { getSafeImageSrc } from "@/lib/utils"

export async function generateOdooPickingListPDF(aggregatedLines: any[], title: string = "قائمة تجميع (مفصلة) - Picking List", owners: string[] = [], orderIds: string[] = []) {
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
  } catch(e) {}
  
  const logoUrl = typeof window !== "undefined" ? `${window.location.origin}/sahat-almajd-logo.svg` : "/sahat-almajd-logo.svg"
  const dateStr = new Date().toLocaleString("en-GB")

  // Fetch Lots from Odoo
  const uniqueProductCodes = Array.from(new Set(aggregatedLines.map(p => p.code).filter(Boolean)));
  let odooLotsData: Record<string, any[]> = {};
  if (uniqueProductCodes.length > 0) {
      try {
          const res = await fetchOdooApi("/api/odoo/lots", {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ productCodes: uniqueProductCodes })
          });
          const data = await res.json();
          if (data.success && data.lotsByProduct) {
              odooLotsData = data.lotsByProduct;
          }
      } catch (e) {
          console.error("Failed to fetch Odoo lots for PDF", e);
      }
  }

  const enrichedLines = await Promise.all(aggregatedLines.map(async (line: any) => {
    let imageUrl = "";
    let warehouseUnit = "";
    let warehouseCategory = "";
    let quantityPerCarton = 1;
    let warehouseQty = line.quantity;
    
    try {
      const odooCode = line.code;
      if (odooCode) {
        const websiteProduct = await db.products.where("productCode").equals(odooCode).first();
        if (websiteProduct) {
          warehouseUnit = websiteProduct.unit || "";
          quantityPerCarton = websiteProduct.quantityPerCarton || 1;
          warehouseQty = line.quantity / quantityPerCarton;

          if (websiteProduct.category) {
            const cat = await db.categories.get(websiteProduct.category);
            warehouseCategory = cat ? cat.name : websiteProduct.category;
          }

          if (websiteProduct.image === "DB_IMAGE") {
            const imgData = await db.productImages.get(websiteProduct.id);
            if (imgData?.data) {
              imageUrl = imgData.data;
            }
          } else if (websiteProduct.image) {
            imageUrl = websiteProduct.image;
          }
        }
      }
    } catch (e) {}

    warehouseQty = Number.isInteger(warehouseQty) ? warehouseQty : Number(warehouseQty.toFixed(2));
    const odooQty = Number.isInteger(line.quantity) ? line.quantity : Number(line.quantity.toFixed(2));
    
    // Lot Allocation Logic (FEFO)
    const pLots = odooLotsData[line.code] || [];
    let remainingQty = line.quantity; // We allocate based on Odoo Qty
    let allocations = [];

    if (pLots.length > 0) {
        for (const lot of pLots) {
            if (remainingQty <= 0) break;
            if (lot.quantity > 0) {
                const take = Math.min(lot.quantity, remainingQty);
                // WH qty proportion
                const takeWH = take / quantityPerCarton;
                allocations.push({ lotName: lot.lotName, date: lot.date, qty: take, whQty: takeWH });
                remainingQty -= take;
                lot.quantity -= take;
            }
        }
    }

    if (remainingQty > 0) {
        allocations.push({ lotName: pLots.length > 0 ? 'N/A' : '-', date: '-', qty: remainingQty, whQty: remainingQty / quantityPerCarton });
    }

    return { ...line, imageUrl: imageUrl ? getSafeImageSrc(imageUrl) : "", warehouseUnit, warehouseQty, odooQty, allocations }
  }));

  let pagesHtml = `
      <div class="page" style="display: block;">
        <table class="items-table" style="width: 100%;">
          <thead>
            <tr>
              <th colspan="9" style="background: white; border: none; padding: 0; padding-bottom: 15px;">
                <div class="header" style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                  <img src="${logoUrl}" alt="Sahat Al Majd" class="logo" style="max-width: 120px; max-height: 60px;" onerror="this.style.display='none'">
                  <div class="title-container" style="text-align: left;">
                    <h1 class="invoice-title" style="margin: 0; color: #1e3a8a; font-size: 20px; font-weight: 700;">${title}</h1>
                    <p class="date-text" style="margin: 5px 0 0; color: #64748b; font-size: 12px;">${dateStr}</p>
                    ${owners.length > 0 || orderIds.length > 0 ? `
                      <p class="date-text" style="font-weight:bold; margin-top:5px; color:#334155; font-size:11px;">
                        ${owners.length > 0 ? `المالك / أصحاب الطلب: ${owners.join(' ، ')}` : ''}
                        ${owners.length > 0 && orderIds.length > 0 ? ` &nbsp; | &nbsp; ` : ''}
                        ${orderIds.length > 0 ? `أرقام العمليات: ${orderIds.join(' ، ')}` : ''}
                      </p>
                    ` : ''}
                  </div>
                </div>
              </th>
            </tr>
            <tr>
              <th style="width:30px;">#</th>
              <th style="width:40px;">صورة<br>Image</th>
              <th style="width:60px;">كود<br>Code</th>
              <th>المنتج<br>Product</th>
              <th style="width:50px;">كمية أودو<br>Odoo Qty</th>
              <th style="width:50px;">وحدة أودو<br>Odoo Unit</th>
              <th style="width:50px;">كمية الموقع<br>WH Qty</th>
              <th style="width:60px;">وحدة الموقع<br>WH Unit</th>
              <th style="width:90px;">التاريخ<br>DATE</th>
            </tr>
          </thead>
          <tbody>
            ${enrichedLines.map((item: any, idx: number) => {
              const rowIndex = idx + 1;
              return `
                <tr style="page-break-inside: avoid;">
                  <td style="text-align:center;">${rowIndex}</td>
                  <td style="text-align:center; padding: 1px;">${item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:30px; max-height:30px; object-fit:contain; border-radius:4px;">` : ""}</td>
                  <td style="text-align:center; font-family:monospace; font-weight:bold; font-size:10px; padding: 2px;">${item.code || "-"}</td>
                  <td style="text-align:center; font-size:10px; padding: 2px;">${item.name || "-"}</td>
                  
                  <td style="text-align:center; font-weight:bold; font-size:12px; color:#b91c1c; padding: 2px;">
                    ${item.odooQty.toLocaleString("en-US")}
                  </td>
                  
                  <td style="text-align:center; font-size:9px; padding: 2px;">${item.uom || "-"}</td>
                  
                  <td style="text-align:center; font-weight:bold; font-size:12px; color:#1d4ed8; padding: 2px;">
                    ${item.warehouseQty.toLocaleString("en-US")}
                  </td>
                  
                  <td style="text-align:center; font-size:9px; padding: 2px;">${item.warehouseUnit || "-"}</td>
                  
                  <td style="text-align:center; font-size:9px; padding:0; line-height: 1.2;">
                    ${item.allocations.map((a: any, i: number) => {
                      const hasLot = a.lotName !== '-';
                      const qtyStr = Number.isInteger(a.whQty) ? a.whQty.toLocaleString("en-US") : Number(a.whQty.toFixed(2)).toLocaleString("en-US");
                      return `<div style="padding: 4px 2px; ${i < item.allocations.length - 1 ? 'border-bottom: 1px solid #cbd5e1;' : ''}">
                        ${a.date !== '-' ? a.date : '---'} ${hasLot ? `<strong style="font-size:10px; color:#1d4ed8;">(${qtyStr})</strong>` : ''}
                        ${hasLot ? `<br><span style="font-size:7px; color:#64748b;">${a.lotName}</span>` : ''}
                      </div>`;
                    }).join('')}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
  `;

  const finalHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap");
        body { margin: 0; padding: 0; font-family: "Cairo", sans-serif; background: #525659; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        * { box-sizing: border-box; }
        .page { background: white; max-width: 210mm; margin: 0 auto; margin-bottom: 20px; padding: 10mm; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; }
        .logo { max-width: 120px; max-height: 60px; }
        .title-container { text-align: left; }
        .invoice-title { margin: 0; color: #1e3a8a; font-size: 20px; font-weight: 700; }
        .date-text { margin: 5px 0 0; color: #64748b; font-size: 12px; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .items-table th { background-color: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-size: 11px; padding: 4px; font-weight: 700; text-align: center; white-space: nowrap; }
        .items-table td { border: 1px solid #cbd5e1; padding: 3px 4px; font-size: 11px; color: #1e293b; vertical-align: middle; }
        .items-table tr:nth-child(even) { background-color: #fdfdfd; }
        .footer { margin-top: 15px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print { 
          body { background: white; margin: 0; padding: 0; } 
          .page { margin: 0; padding: 5mm; box-shadow: none; max-width: 100%; } 
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr { page-break-inside: avoid; }
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

