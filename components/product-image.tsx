"use client"

import { useState, useEffect, useRef } from "react"
import { db } from "@/lib/db"
import { db as firestore } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { ImageIcon, Loader2, AlertCircle } from "lucide-react"
import { getSafeImageSrc, cn } from "@/lib/utils"
import { useLiveQuery } from "dexie-react-hooks"

interface ProductImageProps {
  product: { id: string; image?: string }
  className?: string
  onClick?: () => void
}

export function ProductImage({ product, className, onClick }: ProductImageProps) {
  // ... existing state ...
  const [isVisible, setIsVisible] = useState(false)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)
  const [localImageFound, setLocalImageFound] = useState(false)

  // ... (keep logic same) ...

  // (re-render component parts with cn)

  // ... existing useEffects ...

  useEffect(() => {
    setCloudError(false)
    setCloudLoading(false)
    setLocalImageFound(false)
  }, [product.id])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "50px" }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const dbImage = useLiveQuery(async () => {
    if (!isVisible) return undefined
    if (product.image === 'DB_IMAGE') {
      const rec = await db.productImages.get(product.id)
      if (rec?.data) {
        setCloudError(false)
        setCloudLoading(false)
        setLocalImageFound(true)
        return rec.data
      }
    }
    return undefined
  }, [product.id, product.image, isVisible])

  useEffect(() => {
    if (localImageFound) return
    if (isVisible && product.image === 'DB_IMAGE' && dbImage === undefined && !cloudLoading && !cloudError) {
      console.log(`[ProductImage] Missing local image for ${product.id}, fetching from cloud...`)
      setCloudLoading(true)
      const ref = doc(firestore, "product_images", product.id)
      getDoc(ref).then(snap => {
        if (snap.exists()) {
          const data = snap.data().data
          if (data) {
            console.log(`[ProductImage] Found cloud image for ${product.id}, size: ${data.length}`)
            db.productImages.put({ productId: product.id, data }).catch(console.error)
          } else {
            console.warn(`[ProductImage] Cloud doc exists but no data for ${product.id}`)
            setCloudError(true)
          }
        } else {
          console.warn(`[ProductImage] No cloud image found for ${product.id}`)
          setCloudError(true)
        }
      }).catch(err => {
        console.error(`[ProductImage] Fetch error for ${product.id}:`, err)
        setCloudError(true)
      }).finally(() => {
        setCloudLoading(false)
      })
    }
  }, [isVisible, product.image, product.id, dbImage, cloudLoading, cloudError])

  let src = ""
  if (product.image === 'DB_IMAGE') {
    if (dbImage) src = getSafeImageSrc(dbImage)
  } else if (product.image) {
    src = getSafeImageSrc(product.image)
  }

  if (!isVisible) {
    return <div ref={imgRef} className={cn("bg-muted rounded", className)} />
  }

  if (src) {
    return (
      <img
        src={src}
        alt="Product"
        className={cn("object-cover rounded", className)}
        onClick={onClick}
        onError={(e) => {
          console.error("Image load error:", src.substring(0, 50))
          e.currentTarget.style.display = 'none'
          if (!localImageFound && product.image === 'DB_IMAGE') {
            setCloudError(true)
          }
        }}
      />
    )
  }

  if (cloudError && !src) {
    return (
      <div className={cn("flex items-center justify-center bg-muted rounded", className)} title="Image missing from cloud">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }

  if (product.image === 'DB_IMAGE' && !src) {
    return (
      <div ref={imgRef} className={cn("bg-muted rounded flex items-center justify-center animate-pulse", className)} onClick={onClick}>
        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    )
  }

  return (
    <div ref={imgRef} className={cn("bg-muted rounded flex items-center justify-center", className)} onClick={onClick}>
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  )
}
