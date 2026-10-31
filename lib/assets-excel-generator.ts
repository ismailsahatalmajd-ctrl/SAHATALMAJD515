import * as XLSX from "xlsx"
import { AssetItem, AssetRequestInvoice } from "./assets-types"

export function exportAssetsToExcel(assets: AssetItem[]) {
  const data = assets.map(item => ({
    "الكود (Code)": item.code,
    "الاسم (Name)": item.name,
    "التصنيف (Category)": item.category === "ASSET" ? "أصل" : "مادة استهلاكية",
    "النوع (Type)": item.type === "PERMANENT" ? "أصل دائم" : item.type === "CONSUMABLE" ? "أصل استهلاكي" : "-",
    "السعر (Price)": item.price,
    "الكمية الكلية (Total Qty)": item.totalQuantity,
    "المنصرف (Expenses)": item.expenses,
    "المتبقي (Remaining)": item.totalQuantity - item.expenses,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "مخزون الأصول والمواد")

  // Generate date string for filename
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `Assets_Materials_Inventory_${dateStr}.xlsx`)
}

export function exportAssetInvoiceToExcel(invoice: AssetRequestInvoice) {
  const data = invoice.items.map(item => ({
    "الكود (Code)": item.code,
    "الاسم (Name)": item.name,
    "الكمية المطلوبة (Req Qty)": item.requestedQuantity,
    "المتبقي في الفرع (Branch Qty)": item.remainingInBranch,
    "الكمية المعتمدة (Approved Qty)": item.approvedQuantity || 0,
    "الحالة (Status)": item.status,
    "ملاحظات (Notes)": item.managerNotes || "-",
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "تفاصيل الفاتورة")

  XLSX.writeFile(wb, `Asset_Invoice_${invoice.invoiceNumber}.xlsx`)
}
