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
        let websiteProduct: any = null;
        if (odooCode) {
          websiteProduct = await db.products.where("productCode").equals(odooCode).first();
          if (!websiteProduct) {
            websiteProduct = await db.products.where("itemNumber").equals(odooCode).first();
          }
        }
        if (!websiteProduct && line.name) {
          websiteProduct = await db.products.where("productName").equals(line.name).first();
        }

        if (websiteProduct) {
          warehouseUnit = websiteProduct.unit || "";
          quantityPerCarton = Number(websiteProduct.quantityPerCarton) > 0 ? Number(websiteProduct.quantityPerCarton) : 1;
          warehouseQty = line.quantity / quantityPerCarton;
          
          if (websiteProduct.category) {
              const cat = await db.categories.get(websiteProduct.category);
              warehouseCategory = cat ? cat.name : websiteProduct.category;
          }
        }
      } catch (e) {}

      // Authoritative Price from Odoo (standard_price = cost per Odoo unit, list_price = sale price)
      // Note: Never read price from website db.products per user instructions
      const odooPrice = Number(line.odooPrice ?? line.standard_price ?? line.price_unit ?? line.list_price ?? 0);

      warehouseQty = Number.isInteger(warehouseQty) ? warehouseQty : Number(warehouseQty.toFixed(2));
      const odooQty = Number.isInteger(line.quantity) ? line.quantity : Number(line.quantity.toFixed(2));
      
      // Price per individual Odoo unit (piece, kg, etc.) from Odoo
      const piecePrice = odooPrice;
      
      // Carton price computed from Odoo unit price * quantityPerCarton
      const cartonPrice = quantityPerCarton > 1 ? Number((odooPrice * quantityPerCarton).toFixed(2)) : odooPrice;
      
      // Accurate total value calculated from Odoo price: odooQty * odooPrice (which equals warehouseQty * cartonPrice)
      const totalValue = Number((odooQty * odooPrice).toFixed(2));

      return { 
        ...line, 
        warehouseUnit, 
        warehouseCategory, 
        warehouseQty, 
        odooQty,
        quantityPerCarton,
        odooPrice,
        piecePrice,
        cartonPrice,
        totalValue
      };
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Picking List");

    // Define columns
    worksheet.columns = [
      { header: "#", key: "index", width: 5 },
      { header: "كود | Code", key: "code", width: 16 },
      { header: "المنتج | Product", key: "name", width: 45 },
      { header: "التصنيف | Category", key: "category", width: 25 },
      { header: "مرات الطلب | Order Count", key: "orderCount", width: 18 },
      { header: "كمية أودو | Odoo Qty", key: "odooQty", width: 18 },
      { header: "وحدة أودو | Odoo Unit", key: "uom", width: 18 },
      { header: "كمية الموقع | WH Qty", key: "warehouseQty", width: 18 },
      { header: "وحدة الموقع | WH Unit", key: "warehouseUnit", width: 20 },
      { header: "سعر أودو (الوحدة) | Odoo Unit Price", key: "piecePrice", width: 22 },
      { header: "سعر الكرتون | Carton Price", key: "cartonPrice", width: 22 },
      { header: "القيمة الإجمالية | Total Value", key: "totalValue", width: 24 }
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
        code: item.code ? String(item.code) : "-",
        name: item.name || "-",
        category: item.warehouseCategory || "-",
        orderCount: item.orderCount || 1,
        odooQty: item.odooQty,
        uom: item.uom || "-",
        warehouseQty: item.warehouseQty,
        warehouseUnit: item.warehouseUnit || "-",
        piecePrice: item.piecePrice || 0,
        cartonPrice: item.cartonPrice || 0,
        totalValue: item.totalValue || 0
      });
    });

    // Style rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: "middle", horizontal: "center" };
        row.getCell("name").alignment = { vertical: "middle", horizontal: "right" };
        const codeCell = row.getCell("code");
        codeCell.font = { bold: true };
        codeCell.numFmt = "@";
        row.getCell("orderCount").font = { bold: true };
        row.getCell("odooQty").font = { bold: true, color: { argb: "FFB91C1C" } };
        row.getCell("warehouseQty").font = { bold: true, color: { argb: "FF1D4ED8" } };
        row.getCell("piecePrice").font = { color: { argb: "FF475569" } };
        row.getCell("piecePrice").numFmt = "#,##0.00##";
        row.getCell("cartonPrice").font = { bold: true, color: { argb: "FF0F172A" } };
        row.getCell("cartonPrice").numFmt = "#,##0.00";
        row.getCell("totalValue").font = { bold: true, color: { argb: "FF047857" } };
        row.getCell("totalValue").numFmt = "#,##0.00";
      }
    });

    // Add Grand Total Row
    const grandTotalOdooQty = enrichedLines.reduce((acc, l) => acc + (l.odooQty || 0), 0);
    const grandTotalWhQty = enrichedLines.reduce((acc, l) => acc + (l.warehouseQty || 0), 0);
    const grandTotalValue = enrichedLines.reduce((acc, l) => acc + (l.totalValue || 0), 0);

    const totalRow = worksheet.addRow({
      index: "",
      code: "",
      name: "الإجمالي العام | Grand Total",
      category: "",
      orderCount: "",
      odooQty: grandTotalOdooQty,
      uom: "",
      warehouseQty: grandTotalWhQty,
      warehouseUnit: "",
      piecePrice: "",
      cartonPrice: "",
      totalValue: grandTotalValue
    });

    totalRow.alignment = { vertical: "middle", horizontal: "center" };
    totalRow.getCell("name").alignment = { vertical: "middle", horizontal: "right" };
    totalRow.font = { bold: true, size: 11 };
    totalRow.getCell("odooQty").font = { bold: true, color: { argb: "FFB91C1C" } };
    totalRow.getCell("warehouseQty").font = { bold: true, color: { argb: "FF1D4ED8" } };
    totalRow.getCell("totalValue").font = { bold: true, size: 12, color: { argb: "FF047857" } };
    totalRow.getCell("totalValue").numFmt = "#,##0.00";

    totalRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "double", color: { argb: "FF0F172A" } }
      };
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

