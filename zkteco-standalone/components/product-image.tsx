"use client"

import { useState, useEffect, useRef } from "react"
import { db } from "@/lib/db"
import { ImageIcon, Loader2, AlertCircle } from "lucide-react"
import { getSafeImageSrc, cn } from "@/lib/utils"
import { useLiveQuery } from "dexie-react-hooks"

interface ProductImageProps {
  product: { id: string; image?: string; productName?: string }
  className?: string
  onClick?: () => void
}

export function ProductImage({ product, className, onClick }: ProductImageProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)
  const [localImageFound, setLocalImageFound] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)

  // Reset state when product ID changes
  useEffect(() => {
    setCloudError(false)
    setCloudLoading(false)
    setLocalImageFound(false)
    setImageLoadFailed(false)
  }, [product.id])

  // Simple intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "100px" }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // Local IndexedDB check
  const dbImage = useLiveQuery(async () => {
    if (!isVisible) return undefined
    if (product.image === 'DB_IMAGE') {
      try {
        const rec = await db.productImages.get(product.id)
        if (rec?.data) {
          setLocalImageFound(true)
          return rec.data
        }
      } catch (e) {
        console.warn("[ProductImage] DB error", e)
      }
    }
    return undefined
  }, [product.id, product.image, isVisible])

  // Remote Firebase Storage check
  useEffect(() => {
    if (!isVisible || product.image !== 'DB_IMAGE' || localImageFound || cloudLoading || cloudError) return

    const fetchFromCloud = async () => {
      setCloudLoading(true)
      try {
        const { storage } = await import("@/lib/firebase")
        const { ref, getDownloadURL } = await import("firebase/storage")
        
        const storageRef = ref(storage, `product-images/${product.id}`)
        const downloadURL = await getDownloadURL(storageRef)
        
        if (downloadURL) {
          // Cache it locally
          await db.productImages.put({ productId: product.id, data: downloadURL }).catch(() => {})
          setLocalImageFound(true)
        } else {
          setCloudError(true)
        }
      } catch (error: any) {
        if (error?.code === 'storage/object-not-found') {
          // No image exists
        } else if (error?.status === 412 || error?.code === 'storage/unauthorized' || error?.message?.includes('service account')) {
          console.error(`[ProductImage] Firebase Storage permission issue (412). Visit console to re-link bucket.`)
          setCloudError(true)
        } else {
          console.error(`[ProductImage] Fetch error for ${product.id}:`, error)
          setCloudError(true)
        }
      } finally {
        setCloudLoading(false)
      }
    }

    fetchFromCloud()
  }, [isVisible, product.image, product.id, localImageFound, cloudLoading, cloudError])

  let src = ""
  if (product.image === 'DB_IMAGE') {
    if (dbImage) src = getSafeImageSrc(dbImage)
  } else if (product.image) {
    src = getSafeImageSrc(product.image)
  }

  // Pre-loading state
  if (!isVisible) {
    return <div ref={imgRef} className={cn("bg-muted rounded flex items-center justify-center", className)}>
      <ImageIcon className="h-4 w-4 text-muted-foreground/20" />
    </div>
  }

  // Main rendering
  if (src && !imageLoadFailed) {
    return (
      <div ref={imgRef} className={cn("relative overflow-hidden flex items-center justify-center", className)}>
        <img
          src={src}
          alt={product.productName || "Product"}
          className={cn("w-full h-full object-cover rounded transition-opacity duration-300", className)}
          onClick={onClick}
          onError={() => setImageLoadFailed(true)}
        />
        {cloudLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/5">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        )}
      </div>
    )
  }

  // Loading state fallback
  if (product.image === 'DB_IMAGE' && !src && cloudLoading) {
    return (
      <div ref={imgRef} className={cn("bg-muted rounded flex items-center justify-center animate-pulse", className)}>
        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    )
  }

  // Error/Missing state fallback
  return (
    <div 
      ref={imgRef} 
      className={cn("bg-muted rounded flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted/80 transition-colors", className)} 
      onClick={onClick}
    >
      {imageLoadFailed || cloudError ? (
        <AlertCircle className="h-5 w-5 text-amber-500" />
      ) : (
        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
      )}
      {(className?.includes('h-24') || className?.includes('h-20')) && product.productName && (
        <span className="text-[10px] text-muted-foreground px-1 text-center line-clamp-1">
          {product.productName}
        </span>
      )}
    </div>
  )
}
