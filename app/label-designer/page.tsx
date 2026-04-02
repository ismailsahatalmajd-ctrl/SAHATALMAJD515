"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Printer, Layout, Tag, Type, Barcode, ArrowLeft } from "lucide-react"
import { jsPDF } from "jspdf"
import BarcodeDisplay from "@/components/barcode-display"

export default function LabelDesignerPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    
    // Check if this is bulk printing
    const isBulkPrinting = searchParams.get('bulk') === 'true'
    const productCount = parseInt(searchParams.get('count') || '1')
    
    // Parse multiple products for bulk printing
    const bulkProducts = useMemo(() => {
        if (!isBulkPrinting) return []
        
        const products = []
        for (let i = 0; i < productCount; i++) {
            products.push({
                id: searchParams.get(`product_${i}_id`) || '',
                productCode: searchParams.get(`product_${i}_productCode`) || '',
                itemNumber: searchParams.get(`product_${i}_itemNumber`) || '',
                productName: searchParams.get(`product_${i}_productName`) || '',
                barcode: searchParams.get(`product_${i}_barcode`) || '',
                price: searchParams.get(`product_${i}_price`) || '0'
            })
        }
        return products
    }, [isBulkPrinting, productCount, searchParams])
    
    // Label Settings
    const [width, setWidth] = useState(60) // mm
    const [height, setHeight] = useState(40) // mm

    // Element Toggles - set defaults based on whether product data is provided
    const hasProductData = searchParams.get('productName') || isBulkPrinting
    const [showLogo, setShowLogo] = useState(hasProductData ? false : true)
    const [showTitleAr, setShowTitleAr] = useState(hasProductData ? false : true)
    const [showNameAr, setShowNameAr] = useState(hasProductData ? true : true)
    const [showNameEn, setShowNameEn] = useState(hasProductData ? false : true)
    const [showBarcode, setShowBarcode] = useState(hasProductData ? true : true)
    const [showInternalCode, setShowInternalCode] = useState(hasProductData ? true : true)
    const [showPrice, setShowPrice] = useState(hasProductData ? true : false)
    const [price, setPrice] = useState(searchParams.get('price') || "0.00")

    // Dynamic Preview Data from URL parameters or fallback to default
    const previewData = {
        internalCode: searchParams.get('itemNumber') || searchParams.get('productCode') || "BOX-MIXB-BRN-25-0001",
        barcode: searchParams.get('barcode') || searchParams.get('productCode') || "6281057012517",
        fullNameArabic: searchParams.get('productName') || "علبة ميكس براند بني (تجربة)",
        fullNameEnglish: searchParams.get('productName') || "Mix Brand Box Brown (Demo)",
        titleArabic: "بطاقة المنتج"
    }

    // Calculate pixel dimensions for screen preview (approx 3.78 px per mm)
    const pxPerMm = 3.78
    const previewWidth = width * pxPerMm
    const previewHeight = height * pxPerMm

    const handlePrint = () => {
        if (isBulkPrinting && bulkProducts.length > 0) {
            // Print multiple labels on one page
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            })

            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 10
            const labelsPerRow = Math.floor((pageWidth - 2 * margin) / (width + 5))
            const labelsPerColumn = Math.floor((pageHeight - 2 * margin) / (height + 5))
            
            let currentX = margin
            let currentY = margin
            let labelCount = 0

            bulkProducts.forEach((product, index) => {
                if (labelCount > 0 && labelCount % labelsPerRow === 0) {
                    currentX = margin
                    currentY += height + 5
                }

                if (currentY + height > pageHeight - margin) {
                    doc.addPage()
                    currentX = margin
                    currentY = margin
                    labelCount = 0
                }

                // Draw label border
                doc.setDrawColor(200, 200, 200)
                doc.rect(currentX, currentY, width, height)

                const centerX = currentX + width / 2
                let labelY = currentY + 3

                // Product Name
                doc.setFontSize(8)
                doc.setTextColor(0, 0, 0)
                doc.setFont('helvetica', 'bold')
                const productName = product.productName || 'Product Name'
                const maxChars = Math.floor(width / 3)
                const displayName = productName.length > maxChars ? productName.substring(0, maxChars) + '...' : productName
                doc.text(displayName, centerX, labelY, { align: 'center' })
                labelY += 6

                // Barcode
                if (showBarcode && product.barcode) {
                    doc.setFontSize(6)
                    doc.setTextColor(0, 0, 0)
                    doc.text(product.barcode, centerX, labelY, { align: 'center' })
                    labelY += 5
                }

                // Internal Code
                if (showInternalCode && product.itemNumber) {
                    doc.setFontSize(6)
                    doc.setTextColor(0, 0, 0)
                    doc.text(product.itemNumber, centerX, labelY, { align: 'center' })
                    labelY += 4
                }

                // Price
                if (showPrice && product.price) {
                    doc.setFontSize(7)
                    doc.setTextColor(0, 100, 0)
                    doc.setFont('helvetica', 'bold')
                    doc.text(`${product.price} SAR`, centerX, labelY, { align: 'center' })
                }

                currentX += width + 5
                labelCount++
            })

            doc.save(`bulk-labels-${bulkProducts.length}-products.pdf`)
        } else {
            // Single product printing (existing logic)
            const doc = new jsPDF({
                orientation: width > height ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [width, height]
            })

            // Center alignment helper
            const centerX = width / 2
            const margin = 3 // Margin from edges

            // Add a subtle border for better appearance
            doc.setDrawColor(200, 200, 200)
            doc.rect(1, 1, width - 2, height - 2)

            let currentY = margin + 2

            // Logo / Header - smaller and more elegant
            if (showTitleAr) {
                doc.setFontSize(7)
                doc.setTextColor(100, 100, 100)
                try {
                    doc.text(previewData.titleArabic, centerX, currentY, { align: 'center' })
                } catch (error) {
                    // Fallback to simple text if Arabic causes issues
                    doc.text("Product Label", centerX, currentY, { align: 'center' })
                }
                currentY += 4
            }

            // Product Name Arabic - prominent
            if (showNameAr) {
                doc.setFontSize(11)
                doc.setTextColor(0, 0, 0)
                doc.setFont('helvetica', 'bold')
                
                // Handle long product names by splitting if needed
                const maxCharsPerLine = Math.floor((width - 6) / 3) // Approximate character count per line
                let productName = previewData.fullNameArabic
                
                // For Arabic text, we need to handle it differently
                // Try to display as is, but if it causes issues, we can use English
                try {
                    if (productName.length > maxCharsPerLine) {
                        // Split name into two lines if too long
                        const midPoint = Math.floor(productName.length / 2)
                        const firstLine = productName.substring(0, midPoint)
                        const secondLine = productName.substring(midPoint)
                        
                        doc.text(firstLine, centerX, currentY, { align: 'center' })
                        currentY += 4
                        doc.text(secondLine, centerX, currentY, { align: 'center' })
                        currentY += 5
                    } else {
                        doc.text(productName, centerX, currentY, { align: 'center' })
                        currentY += 5
                    }
                } catch (error) {
                    // Fallback to English if Arabic causes issues
                    const fallbackName = previewData.fullNameEnglish || productName
                    doc.text(fallbackName, centerX, currentY, { align: 'center' })
                    currentY += 5
                }
                doc.setFont('helvetica', 'normal')
            }

            // Product Name English - smaller and subtle
            if (showNameEn) {
                doc.setFontSize(7)
                doc.setTextColor(80, 80, 80)
                doc.text(previewData.fullNameEnglish, centerX, currentY, { align: 'center' })
                currentY += 6
            }

            // Barcode - better representation
            if (showBarcode) {
                // Draw a more realistic barcode representation
                const barcodeWidth = Math.min(width - 10, 40)
                const barcodeHeight = 8
                const barcodeX = centerX - barcodeWidth / 2
                
                // Draw barcode lines
                doc.setFillColor(0, 0, 0)
                const barCode = previewData.barcode
                for (let i = 0; i < barCode.length; i++) {
                    if (i % 2 === 0) {
                        const barWidth = barcodeWidth / barCode.length
                        doc.rect(barcodeX + (i * barWidth), currentY, barWidth * 0.8, barcodeHeight, 'F')
                    }
                }
                
                // Add barcode text below
                currentY += barcodeHeight + 2
                doc.setFontSize(6)
                doc.text(previewData.barcode, centerX, currentY, { align: 'center' })
                currentY += 5
            }

            // Internal Code - more prominent
            if (showInternalCode) {
                doc.setFontSize(8)
                doc.setTextColor(0, 0, 0)
                doc.setFont('helvetica', 'bold')
                doc.text(previewData.internalCode, centerX, currentY, { align: 'center' })
                currentY += 4
                doc.setFont('helvetica', 'normal')
            }

            // Price - highlight with background
            if (showPrice) {
                const priceText = `${price} SAR` // Use SAR instead of Arabic symbols for better compatibility
                const priceFontSize = 10
                
                doc.setFontSize(priceFontSize)
                doc.setTextColor(0, 100, 0)
                doc.setFont('helvetica', 'bold')
                
                // Add price background for emphasis
                const textWidth = doc.getTextWidth(priceText)
                const padding = 2
                doc.setFillColor(240, 255, 240)
                doc.rect(centerX - textWidth/2 - padding, currentY - 3, textWidth + (padding * 2), 5, 'F')
                
                doc.text(priceText, centerX, currentY, { align: 'center' })
            }

            doc.save("label-template.pdf")
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8" dir="rtl">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                            <Tag className="w-8 h-8 text-indigo-600" />
                            مصمم الملصقات
                        </h1>
                        {isBulkPrinting && (
                            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                                <span className="text-sm text-green-600 font-medium">طباعة جماعية:</span>
                                <span className="text-sm text-green-900 mr-2">{bulkProducts.length} منتج</span>
                            </div>
                        )}
                        {!isBulkPrinting && searchParams.get('productName') && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
                                <span className="text-sm text-indigo-600 font-medium">المنتج:</span>
                                <span className="text-sm text-indigo-900 mr-2">{searchParams.get('productName')}</span>
                                {searchParams.get('productCode') && (
                                    <span className="text-xs text-indigo-500">({searchParams.get('productCode')})</span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            onClick={() => router.push('/')} 
                            className="gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            العودة للمنتجات
                        </Button>
                        <Button onClick={handlePrint} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                            <Printer className="w-4 h-4" />
                            {isBulkPrinting ? `طباعة ${bulkProducts.length} ملصق` : 'طباعة تجريبية'}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Settings Panel */}
                    <Card className="lg:col-span-1 shadow-md h-fit">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Layout className="w-5 h-5" />
                                خصائص الملصق
                            </CardTitle>
                            <CardDescription>تحكم في حجم ومحتوى الملصق</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Product Selection */}
                            {!searchParams.get('productName') && (
                                <div className="space-y-2">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => router.push('/?from=label-designer')} 
                                        className="w-full gap-2"
                                    >
                                        <Tag className="w-4 h-4" />
                                        اختر منتج من قائمة المنتجات
                                    </Button>
                                    <p className="text-xs text-gray-500 text-center">
                                        سيتم أخذك لصفحة المنتجات لاختيار منتج للطباعة
                                    </p>
                                </div>
                            )}

                            {/* Dimensions */}
                            <div className="space-y-4 border-b pb-4">
                                <Label className="font-bold">الأبعاد (mm)</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs">العرض</Label>
                                        <Input
                                            type="number"
                                            value={width}
                                            onChange={(e) => setWidth(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">الارتفاع</Label>
                                        <Input
                                            type="number"
                                            value={height}
                                            onChange={(e) => setHeight(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Content Toggles */}
                            <div className="space-y-4">
                                <Label className="font-bold">المحتوى</Label>

                                <div className="flex items-center justify-between">
                                    <Label htmlFor="show-title" className="text-sm">عنوان الشركة</Label>
                                    <Switch id="show-title" checked={showTitleAr} onCheckedChange={setShowTitleAr} />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label htmlFor="show-name-ar" className="text-sm">الاسم (عربي)</Label>
                                    <Switch id="show-name-ar" checked={showNameAr} onCheckedChange={setShowNameAr} />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label htmlFor="show-name-en" className="text-sm">الاسم (إنجليزي)</Label>
                                    <Switch id="show-name-en" checked={showNameEn} onCheckedChange={setShowNameEn} />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label htmlFor="show-barcode" className="text-sm">الباركود</Label>
                                    <Switch id="show-barcode" checked={showBarcode} onCheckedChange={setShowBarcode} />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label htmlFor="show-internal" className="text-sm">الكود الداخلي</Label>
                                    <Switch id="show-internal" checked={showInternalCode} onCheckedChange={setShowInternalCode} />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label htmlFor="show-price" className="text-sm">السعر</Label>
                                    <Switch id="show-price" checked={showPrice} onCheckedChange={setShowPrice} />
                                </div>

                                {showPrice && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                        <Label className="text-xs">السعر (SAR)</Label>
                                        <Input value={price} onChange={(e) => setPrice(e.target.value)} />
                                    </div>
                                )}

                            </div>
                        </CardContent>
                    </Card>

                    {/* Preview Panel */}
                    <Card className="lg:col-span-2 shadow-md bg-slate-200/50 flex items-center justify-center p-8 overflow-auto">
                        <div
                            className="bg-white shadow-xl rounded-sm relative transition-all duration-300 flex flex-col items-center justify-center text-center p-2 border border-gray-200"
                            style={{
                                width: `${previewWidth}px`,
                                height: `${previewHeight}px`,
                                minWidth: `${previewWidth}px`, // prevent shrinking
                                minHeight: `${previewHeight}px`
                            }}
                        >
                            {/* Visual Representation of Label - Enhanced */}
                            <div className="w-full h-full flex flex-col justify-between overflow-hidden text-center">

                                {showTitleAr && (
                                    <div className="text-[8px] text-gray-500 font-medium">{previewData.titleArabic}</div>
                                )}

                                <div className="flex-1 flex flex-col justify-center gap-1">
                                    {showNameAr && (
                                        <div className="font-bold text-[14px] leading-tight text-black">{previewData.fullNameArabic}</div>
                                    )}
                                    {showNameEn && (
                                        <div className="text-[8px] text-gray-600 leading-tight">{previewData.fullNameEnglish}</div>
                                    )}
                                </div>

                                <div className="mb-1 space-y-1">
                                    {showBarcode && (
                                        <div className="flex flex-col items-center">
                                            <div className="w-3/4 h-6 bg-black flex items-center justify-center relative">
                                                {/* Simulate barcode lines */}
                                                <div className="w-full h-full flex items-center justify-center">
                                                    {[...Array(12)].map((_, i) => (
                                                        <div 
                                                            key={i} 
                                                            className={`w-0.5 h-full ${i % 2 === 0 ? 'bg-black' : 'bg-white'}`}
                                                            style={{ width: `${Math.random() * 2 + 1}px` }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <span className="font-mono text-[7px] text-gray-700 mt-1">{previewData.barcode}</span>
                                        </div>
                                    )}
                                    {showInternalCode && (
                                        <div className="font-mono text-[10px] font-bold tracking-wider text-black">{previewData.internalCode}</div>
                                    )}
                                    {showPrice && (
                                        <div className="font-bold text-[12px] text-green-700 bg-green-50 px-2 py-1 rounded inline-block mt-1">
                                            {price} SAR
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>

                </div>
            </div>
        </div>
    )
}
