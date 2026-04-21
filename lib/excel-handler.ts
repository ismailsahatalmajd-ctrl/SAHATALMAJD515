import * as XLSX from "xlsx"
import type { Product } from "./types"

export type ImageFormat = "url" | "png" | "jpeg"

interface ExportOptions {
  imageFormat: ImageFormat
  includeImages: boolean
}

// تحويل صورة إلى Base64
async function imageToBase64(url: string, format: "png" | "jpeg"): Promise<string> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error("[v0] Error converting image:", error)
    return url
  }
}

// تصدير المنتجات إلى Excel مع الصور
export async function exportProductsToExcel(
  products: Product[],
  visibleColumns: Record<string, boolean>,
  columnLabels: Record<string, string>,
  options: ExportOptions = { imageFormat: "url", includeImages: true },
) {
  // Define column order (same as table and PDF)
  const order = [
    'productCode', 'itemNumber', 'productName', 'location', 'category', 'unit', 'cartonDimensions',
    'openingStock', 'purchases', 'issues', 'returns', 'adjustments', 'inventoryCount', 'currentStock', 'difference',
    'price', 'averagePrice', 'currentStockValue', 'purchasesValue', 'issuesValue', 'returnsValue', 'adjustmentsValue', 'turnoverRate', 'status', 'stockStatus', 'lastActivity'
  ]

  const activeColumns = order.filter(key => visibleColumns[key])

  const productsData = await Promise.all(
    products.map(async (product) => {
      const row: Record<string, any> = {}

      activeColumns.forEach(col => {
        let value: any = (product as any)[col]
        const label = columnLabels[col] || col

        // Dynamic Calculations (Mirroring Table & PDF logic)
        if (col === 'currentStock') {
          const op = Number(product.openingStock) || 0
          const pu = Number(product.purchases) || 0
          const ret = Number(product.returns) || 0
          const adj = Number(product.adjustments) || 0
          const iss = Number(product.issues) || 0
          value = op + pu + ret + adj - iss
        }

        if (col === 'adjustmentsValue') {
          if (value === undefined) {
             const qty = Number(product.adjustments) || 0
             const price = Number(product.averagePrice || product.price || 0)
             value = qty * price
          }
        }

        // Format values
        if (['price', 'averagePrice', 'currentStockValue', 'issuesValue', 'purchasesValue', 'returnsValue', 'adjustmentsValue'].includes(col)) {
          value = Number(value || 0).toFixed(2)
        }

        row[label] = value
      })

      return row
    }),
  )

  const ws = XLSX.utils.json_to_sheet(productsData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "المنتجات")

  // Auto-fit columns (simplified)
  const COL_WIDTH = 20
  ws["!cols"] = activeColumns.map(() => ({ wch: COL_WIDTH }))

  XLSX.writeFile(wb, `المنتجات-${new Date().toISOString().split("T")[0]}.xlsx`)
}
