import * as XLSX from "xlsx"

export type ImageFormat = "png" | "jpeg" | "url"

export async function exportExcelWithImages(data: any[], imageFormat: ImageFormat = "url"): Promise<Blob> {
  const processedData = await Promise.all(
    data.map(async (row) => {
      if (row.image) {
        switch (imageFormat) {
          case "url":
            return { ...row, image: row.image }
          case "png":
          case "jpeg":
            try {
              const base64 = await convertImageToBase64(row.image, imageFormat)
              return { ...row, image: base64 }
            } catch (error) {
              console.error("[v0] Error converting image:", error)
              return { ...row, image: row.image }
            }
          default:
            return row
        }
      }
      return row
    }),
  )

  const worksheet = XLSX.utils.json_to_sheet(processedData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "المنتجات")

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  return new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

async function convertImageToBase64(imageUrl: string, format: "png" | "jpeg"): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Failed to get canvas context"))
        return
      }

      ctx.drawImage(img, 0, 0)

      const mimeType = format === "png" ? "image/png" : "image/jpeg"
      const base64 = canvas.toDataURL(mimeType)
      resolve(base64)
    }

    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = imageUrl
  })
}

export async function importExcelWithImages(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        // Process images: convert base64 to blob URLs or keep URLs as is
        const processedData = jsonData.map((row: any) => {
          if (row.image && row.image.startsWith("data:image")) {
            // Convert base64 to blob URL for display
            try {
              const blob = base64ToBlob(row.image)
              row.image = URL.createObjectURL(blob)
            } catch (error) {
              console.error("[v0] Error processing image:", error)
            }
          }
          return row
        })

        resolve(processedData)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsBinaryString(file)
  })
}

function base64ToBlob(base64: string): Blob {
  const parts = base64.split(";base64,")
  const contentType = parts[0].split(":")[1]
  const raw = window.atob(parts[1])
  const rawLength = raw.length
  const uInt8Array = new Uint8Array(rawLength)

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i)
  }

  return new Blob([uInt8Array], { type: contentType })
}
