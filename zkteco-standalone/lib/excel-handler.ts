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
  options: ExportOptions = { imageFormat: "url", includeImages: true },
) {
  const productsData = await Promise.all(
    products.map(async (product) => {
      let imageData = product.image || ""

      if (options.includeImages && imageData) {
        if (options.imageFormat === "png" || options.imageFormat === "jpeg") {
          imageData = await imageToBase64(imageData, options.imageFormat)
        }
      }

      return {
        الكود: product.productCode || "",
        الاسم: product.productName,
        الفئة: product.category,
        السعر: product.price,
        "المخزون الحالي": product.currentStock || 0,
        الوحدة: product.unit || "قطعة",
        الموقع: product.location || "",
        الصورة: imageData,
      }
    }),
  )

  const ws = XLSX.utils.json_to_sheet(productsData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "المنتجات")

  const cols = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 50 }]
  ws["!cols"] = cols

  XLSX.writeFile(wb, `المنتجات-${new Date().toISOString().split("T")[0]}.xlsx`)
}
