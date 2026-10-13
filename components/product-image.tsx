"use client"

import { useState, useEffect, useRef } from "react"
import { db } from "@/lib/db"
import { ImageIcon, Loader2, AlertCircle } from "lucide-react"
import { getSafeImageSrc, cn } from "@/lib/utils"
import { useLiveQuery } from "dexie-react-hooks"
import { getProductImageFromCloud, syncProductImageToCloud } from "@/lib/firebase-sync-engine"

interface ProductImageProps {
  product: { id: string; image?: string; productName?: string; productCode?: string }
  className?: string
  onClick?: () => void
  odooCode?: string // Link to website product by Odoo default_code
  hideOnMissing?: boolean // Return null if no image is found
}

export function ProductImage({ product, className, onClick, odooCode, hideOnMissing }: ProductImageProps) {
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

  // Local IndexedDB check & Odoo Website Link mapping
  const dbImage = useLiveQuery(async () => {
    if (!isVisible) return undefined
    
    let targetId = product.id;
    let isDbImage = product.image === 'DB_IMAGE';

    // If this is an Odoo product, we look up the website product by odooCode
    if (odooCode) {
      try {
        const websiteProduct = await db.products.where('productCode').equals(odooCode).first();
        if (websiteProduct) {
          targetId = websiteProduct.id;
          if (websiteProduct.image === 'DB_IMAGE') {
            isDbImage = true;
          } else if (websiteProduct.image) {
             // Return the normal URL immediately if it's not DB_IMAGE
             return websiteProduct.image;
          }
        }
      } catch(e) {
        console.warn("[ProductImage] Error finding website product by odooCode", e);
      }
    }

    if (isDbImage) {
      try {
        const rec = await db.productImages.get(targetId)
        if (rec?.data) {
          setLocalImageFound(true)
          return rec.data
        }
      } catch (e) {
        console.warn("[ProductImage] DB error", e)
      }
    }
    return undefined
  }, [product.id, product.image, isVisible, odooCode])

  // In Odoo mode, product.image won't be DB_IMAGE initially, so we check if dbImage resolved it.
  const isDbImageExpected = product.image === 'DB_IMAGE' || !!odooCode;
  
  // Remote Base64 image check, with a legacy URL fallback.
  useEffect(() => {
    if (!isVisible || !isDbImageExpected || localImageFound || cloudLoading || cloudError || dbImage) return

    const fetchFromCloud = async () => {
      setCloudLoading(true)
      try {
        let targetId = product.id;
        
        // Find mapped ID if using Odoo code
        if (odooCode) {
           const p = await db.products.where('productCode').equals(odooCode).first();
           if (p && p.image === 'DB_IMAGE') {
               targetId = p.id;
           } else {
               // Fast fail if product not found or has no cloud image
               setCloudError(true);
               setCloudLoading(false);
               return;
           }
        }

        const downloadURL = await getProductImageFromCloud(targetId)
        
        if (downloadURL) {
          let imageData = downloadURL
          if (/^https?:\/\//i.test(downloadURL)) {
            const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(downloadURL)}`)
            if (!response.ok) throw new Error(`Legacy image download failed: ${response.status}`)
            const blob = await response.blob()
            imageData = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(String(reader.result || ''))
              reader.onerror = () => reject(new Error('Could not convert legacy image'))
              reader.readAsDataURL(blob)
            })
            await syncProductImageToCloud(targetId, imageData)
          }
          if (imageData.startsWith('data:image/')) {
            await db.productImages.put({ productId: targetId, data: imageData }).catch(() => {})
          }
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
  }, [isVisible, isDbImageExpected, product.id, localImageFound, cloudLoading, cloudError, odooCode, dbImage])

  let src = ""
  if (dbImage && dbImage !== 'DB_IMAGE') {
    src = getSafeImageSrc(dbImage)
  } else if (product.image === 'DB_IMAGE') {
    // If it's still loading from dbImage
  } else if (product.image) {
    src = getSafeImageSrc(product.image)
  }

  // Pre-loading state
  if (!isVisible) {
    return <div ref={imgRef} className={cn("bg-muted rounded flex items-center justify-center", className)}>
      <img src="/sahat-almajd-logo.svg" alt="logo" className="h-5 w-5 opacity-20 grayscale" />
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
  if (isDbImageExpected && !src && cloudLoading) {
    return (
      <div ref={imgRef} className={cn("bg-muted rounded flex items-center justify-center animate-pulse", className)}>
        <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    )
  }

  // Error/Missing state fallback
  if (hideOnMissing) return null;

  return (
    <div 
      ref={imgRef} 
      className={cn("bg-slate-50 border rounded flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors text-center p-1", className)} 
      onClick={onClick}
    >
      <span className="text-[0.55rem] leading-tight text-slate-400 font-medium">الصورة<br/>غير متوفرة</span>
    </div>
  )
}
