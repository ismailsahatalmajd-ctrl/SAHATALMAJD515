import ExcelJS from "exceljs";
import { db } from "@/lib/db";

export async function generateOdooPickingListExcel(aggregatedLines: any[], title: string = "قائمة تجميع - Picking List") {
  try {
    const enrichedLines = await Promise.all(aggregatedLines.map(async (line: any) => {
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
          }
        }
      } catch (e) {}

      warehouseQty = Number.isInteger(warehouseQty) ? warehouseQty : Number(warehouseQty.toFixed(2));
      const odooQty = Number.isInteger(line.quantity) ? line.quantity : Number(line.quantity.toFixed(2));

      return { ...line, warehouseUnit, warehouseCategory, warehouseQty, odooQty }
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Picking List");

    // Define columns
    worksheet.columns = [
      { header: "#", key: "index", width: 5 },
      { header: "كود | Code", key: "code", width: 15 },
      { header: "المنتج | Product", key: "name", width: 45 },
      { header: "التصنيف | Category", key: "category", width: 25 },
      { header: "مرات الطلب | Order Count", key: "orderCount", width: 22 },
      { header: "كمية أودو | Odoo Qty", key: "odooQty", width: 18 },
      { header: "وحدة أودو | Odoo Unit", key: "uom", width: 20 },
      { header: "كمية الموقع | WH Qty", key: "warehouseQty", width: 20 },
      { header: "التاريخ | DATE", key: "date", width: 25 },
      { header: "وحدة الموقع | WH Unit", key: "warehouseUnit", width: 22 }
    ];

    // Style headers only on cells with content
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC09B12" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Add rows
    enrichedLines.forEach((item, idx) => {
      worksheet.addRow({
        index: idx + 1,
        code: (item.code && String(Number(item.code)) === item.code) ? Number(item.code) : (item.code || "-"),
        name: item.name || "-",
        category: item.warehouseCategory || "-",
        orderCount: item.orderCount || 1,
        date: item.date || "-",
        warehouseUnit: item.warehouseUnit || "-",
        odooQty: item.odooQty,
        uom: item.uom || "-",
        warehouseQty: item.warehouseQty,
        warehouseUnit: item.warehouseUnit || "-"
      });
    });

    // Style rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: "middle", horizontal: "center" };
        row.getCell("name").alignment = { vertical: "middle", horizontal: "right" };
        row.getCell("code").font = { bold: true };
        row.getCell("orderCount").font = { bold: true };
        row.getCell("odooQty").font = { bold: true, color: { argb: "FFB91C1C" } };
        row.getCell("date").font = { bold: true };
        row.getCell("warehouseQty").font = { bold: true, color: { argb: "FF1D4ED8" } };
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Download
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Picking_List_${new Date().getTime()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Error generating Excel:", error);
    throw error;
  }
}

