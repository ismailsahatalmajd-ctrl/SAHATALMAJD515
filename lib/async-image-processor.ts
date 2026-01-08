export interface ImageProcessingProgress {
  processed: number
  total: number
  currentImage: string
}

export type ImageProcessingCallback = (progress: ImageProcessingProgress) => void

// Convert image URL to Base64 with error handling
async function urlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    if (!response.ok) return url // Return original URL if fetch fails

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read blob"))
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error("Error converting image:", error)
    return url // Return original URL on error
  }
}

// Process images in batches for better performance
export async function processImagesAsync(
  imageUrls: string[],
  onProgress?: ImageProcessingCallback,
  batchSize = 5,
): Promise<string[]> {
  const results: string[] = []
  const total = imageUrls.length

  for (let i = 0; i < imageUrls.length; i += batchSize) {
    const batch = imageUrls.slice(i, Math.min(i + batchSize, imageUrls.length))

    const batchResults = await Promise.all(
      batch.map(async (url, batchIndex) => {
        const currentIndex = i + batchIndex

        if (onProgress) {
          onProgress({
            processed: currentIndex,
            total,
            currentImage: url,
          })
        }

        // If already base64, skip conversion
        if (url.startsWith("data:")) {
          return url
        }

        // Convert URL to base64
        return await urlToBase64(url)
      }),
    )

    results.push(...batchResults)
  }

  if (onProgress) {
    onProgress({ processed: total, total, currentImage: "" })
  }

  return results
}

// Process a single product with image conversion
export async function processProductImages<T extends { image?: string }>(
  products: T[],
  onProgress?: ImageProcessingCallback,
): Promise<T[]> {
  const imageUrls = products.map((p) => p.image || "").filter(Boolean)

  if (imageUrls.length === 0) {
    return products
  }

  const processedImages = await processImagesAsync(imageUrls, onProgress)

  let imageIndex = 0
  return products.map((product) => {
    if (product.image && product.image.length > 0) {
      return {
        ...product,
        image: processedImages[imageIndex++],
      }
    }
    return product
  })
}
