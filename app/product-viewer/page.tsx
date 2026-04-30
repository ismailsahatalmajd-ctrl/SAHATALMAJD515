"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { getProducts } from "@/lib/storage"
import { getSafeImageSrc } from "@/lib/utils"
import { db } from "@/lib/db"
import type { Product } from "@/lib/types"

export default function ProductViewerPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [resolvedImage, setResolvedImage] = useState("")
    
    // Get product code from URL params (e.g., /product-viewer?code=BOX-123)
    const productCode = searchParams.get("code")
    
    const allProducts = useMemo(() => getProducts(), [])
    
    const product = useMemo(() => {
        if (!productCode) return null
        return allProducts.find(p => 
            p.productCode === productCode || 
            p.barcode === productCode ||
            p.itemNumber === productCode
        ) || null
    }, [productCode, allProducts])
    
    // Resolve product image
    useEffect(() => {
        const resolveImage = async () => {
            if (!product?.image) {
                setResolvedImage("")
                return
            }
            
            if (product.image === "DB_IMAGE") {
                try {
                    const rec = await db.productImages.get(product.id)
                    setResolvedImage(rec?.data ? getSafeImageSrc(rec.data) : "")
                } catch {
                    setResolvedImage("")
                }
            } else {
                setResolvedImage(getSafeImageSrc(product.image))
            }
        }
        
        resolveImage()
    }, [product])
    
    if (!product) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-8 text-center shadow-lg">
                    <h2 className="text-2xl font-bold mb-2 text-slate-900">المنتج غير موجود</h2>
                    <p className="text-slate-600 mb-6">Product not found</p>
                    <Button onClick={() => router.push("/")} className="w-full gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        العودة للرئيسية / Go Home
                    </Button>
                </Card>
            </div>
        )
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <Button 
                        variant="outline" 
                        onClick={() => router.push("/")}
                        className="gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        عودة / Back
                    </Button>
                </div>
                
                {/* Product Card */}
                <Card className="shadow-2xl overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
                        {/* Product Image */}
                        <div className="flex items-center justify-center bg-slate-100 rounded-lg overflow-hidden h-80 md:h-auto">
                            {resolvedImage ? (
                                <img
                                    src={resolvedImage}
                                    alt={product.productName}
                                    className="w-full h-full object-contain p-4"
                                />
                            ) : (
                                <div className="text-center text-slate-400">
                                    <div className="text-6xl mb-2">📦</div>
                                    <p>No image</p>
                                </div>
                            )}
                        </div>
                        
                        {/* Product Details */}
                        <div className="flex flex-col justify-center space-y-6">
                            {/* Product Name */}
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                                    {product.productName}
                                </h1>
                                {product.englishName && (
                                    <p className="text-lg text-slate-600">
                                        {product.englishName}
                                    </p>
                                )}
                            </div>
                            
                            {/* Product Code */}
                            <div className="bg-indigo-50 rounded-lg p-4">
                                <p className="text-sm text-slate-600 mb-1">رمز المنتج / Product Code</p>
                                <p className="text-2xl font-mono font-bold text-indigo-600">
                                    {product.productCode}
                                </p>
                            </div>
                            
                            {/* Item Number */}
                            {product.itemNumber && (
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <p className="text-sm text-slate-600 mb-1">رقم الصنف / Item Number</p>
                                    <p className="text-2xl font-mono font-bold text-blue-600">
                                        {product.itemNumber}
                                    </p>
                                </div>
                            )}
                            
                            {/* Barcode */}
                            {product.barcode && (
                                <div className="bg-green-50 rounded-lg p-4">
                                    <p className="text-sm text-slate-600 mb-1">الباركود / Barcode</p>
                                    <p className="text-2xl font-mono font-bold text-green-600">
                                        {product.barcode}
                                    </p>
                                </div>
                            )}
                            
                            {/* Price */}
                            {product.price && (
                                <div className="bg-emerald-50 rounded-lg p-4">
                                    <p className="text-sm text-slate-600 mb-1">السعر / Price</p>
                                    <p className="text-3xl font-bold text-emerald-600">
                                        {product.price} <span className="text-lg">SAR</span>
                                    </p>
                                </div>
                            )}
                            
                            {/* Description */}
                            {product.description && (
                                <div className="bg-slate-100 rounded-lg p-4">
                                    <p className="text-sm text-slate-600 mb-2">الوصف / Description</p>
                                    <p className="text-slate-700 whitespace-pre-wrap">
                                        {product.description}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
                
                {/* Bottom Action */}
                <div className="mt-8 text-center">
                    <p className="text-slate-600 text-sm">
                        تم مسح رمز QR بنجاح | QR Code scanned successfully
                    </p>
                </div>
            </div>
        </div>
    )
}
