import * as XLSX from "xlsx"
import { BranchInventoryReport } from "./types"
import { format } from "date-fns"
import { db } from "./db"

export async function exportInventoryReportToExcel(report: BranchInventoryReport) {
  // Fetch current prices for items to show in Excel (as requested for admin)
  const itemsWithPrices = await Promise.all(
    report.items.map(async (item) => {
      const product = await db.products.get(item.productId)
      const currentPrice = product?.price || 0
      const itemPrice = item.price ?? currentPrice

      return {
        "Product Code / كود الصنف": item.productCode || "-",
        "Item Name / اسم الصنف": item.productName,
        "Base Unit / الوحدة": item.unit,
        "Optional Unit / الوحدة الإضافية": item.optionalUnit || "-",
        "Count / الكمية": item.quantity,
        "Unit Price / سعر الوحدة": itemPrice,
        "Total Value / الإجمالي": itemPrice * item.quantity,
        "Notes / ملاحظات": item.notes || "-"
      }
    })
  )

  const ws = XLSX.utils.json_to_sheet(itemsWithPrices)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Inventory Report")

  // Add summary info at the top
  const header = [
    ["Report Code / كود التقرير", report.reportCode],
    ["Branch / الفرع", report.branchName],
    ["Date / التاريخ", format(new Date(report.createdAt), "yyyy-MM-dd HH:mm")],
    ["Global Notes / ملاحظات عامة", report.notes || "-"],
    [], // Empty row
  ]
  XLSX.utils.sheet_add_aoa(ws, header, { origin: "A1" })

  // Re-add the data table below the header
  XLSX.utils.sheet_add_json(ws, itemsWithPrices, { origin: "A7", skipHeader: false })

  // Column widths
  ws["!cols"] = [
    { wch: 18 }, // Code
    { wch: 30 }, // Name
    { wch: 10 }, // Base Unit
    { wch: 15 }, // Optional Unit
    { wch: 10 }, // Count
    { wch: 12 }, // Price
    { wch: 15 }, // Total
    { wch: 30 }, // Notes
  ]

  const fileName = `Inventory_${report.branchName}_${report.reportCode}.xlsx`
  XLSX.writeFile(wb, fileName)
}
