"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Printer, Layout, Tag, Type, Barcode } from "lucide-react"
import { jsPDF } from "jspdf"
import BarcodeDisplay from "@/components/barcode-display"

export default function LabelDesignerPage() {
    // Label Settings
    const [width, setWidth] = useState(60) // mm
    const [height, setHeight] = useState(40) // mm

    // Element Toggles
    const [showLogo, setShowLogo] = useState(true)
    const [showTitleAr, setShowTitleAr] = useState(true)
    const [showNameAr, setShowNameAr] = useState(true)
    const [showNameEn, setShowNameEn] = useState(true)
    const [showBarcode, setShowBarcode] = useState(true)
    const [showInternalCode, setShowInternalCode] = useState(true)
    const [showPrice, setShowPrice] = useState(false)
    const [price, setPrice] = useState("0.00")

    // Preview Data
    const previewData = {
        internalCode: "BOX-MIXB-BRN-25-0001",
        barcode: "6281057012517",
        fullNameArabic: "علبة ميكس براند بني (تجربة)",
        fullNameEnglish: "Mix Brand Box Brown (Demo)",
        titleArabic: "بطاقة المنتج"
    }

    // Calculate pixel dimensions for screen preview (approx 3.78 px per mm)
    const pxPerMm = 3.78
    const previewWidth = width * pxPerMm
    const previewHeight = height * pxPerMm

    const handlePrint = () => {
        // Create new PDF with custom size
        const doc = new jsPDF({
            orientation: width > height ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [width, height]
        })

        // Center aligment helper
        const centerX = width / 2

        // Draw Border (Optional, for debugging)
        // doc.rect(1, 1, width - 2, height - 2)

        let currentY = 5

        // Logo / Header
        if (showTitleAr) {
            doc.setFontSize(8)
            doc.text(previewData.titleArabic, centerX, currentY, { align: 'center' })
            currentY += 5
        }

        // Product Name Arabic
        if (showNameAr) {
            doc.setFontSize(10)
            // Arabic text support in jsPDF requires custom font or shape logic. 
            // For basic standard usage without custom fonts loaded, it might display reversed.
            // We will assume environment has fonts or use English for robustness in this demo block.
            // In a real app, we'd load a base64 Arabic font.
            doc.text(previewData.fullNameArabic, centerX, currentY, { align: 'center' })
            currentY += 5
        }

        // Product Name English
        if (showNameEn) {
            doc.setFontSize(8)
            doc.text(previewData.fullNameEnglish, centerX, currentY, { align: 'center' })
            currentY += 7
        }

        // Barcode
        if (showBarcode) {
            // jsPDF doesn't native render barcodes beautifully without a plugin.
            // We often use a canvas image or checking if we can just draw lines.
            // For this demo, we'll draw simple text or a placeholder box.
            // Real implementation would use 'jsbarcode' to canvas -> image -> PDF.
            doc.setFontSize(12)
            doc.text(`||| ||| ||| ${previewData.barcode}`, centerX, currentY, { align: 'center' })
            currentY += 5
        }

        // Internal Code
        if (showInternalCode) {
            doc.setFontSize(7)
            doc.text(previewData.internalCode, centerX, currentY, { align: 'center' })
            currentY += 4
        }

        // Price
        if (showPrice) {
            doc.setFontSize(9)
            doc.text(`${price} SAR`, centerX, currentY, { align: 'center' })
        }

        doc.save("label-template.pdf")
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8" dir="rtl">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        <Tag className="w-8 h-8 text-indigo-600" />
                        مصمم الملصقات
                    </h1>
                    <Button onClick={handlePrint} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                        <Printer className="w-4 h-4" />
                        طباعة تجريبية
                    </Button>
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
                                        <Label className="text-xs">السعر (ر.س)</Label>
                                        <Input value={price} onChange={(e) => setPrice(e.target.value)} />
                                    </div>
                                )}

                            </div>
                        </CardContent>
                    </Card>

                    {/* Preview Panel */}
                    <Card className="lg:col-span-2 shadow-md bg-slate-200/50 flex items-center justify-center p-8 overflow-auto">
                        <div
                            className="bg-white shadow-xl rounded-sm relative transition-all duration-300 flex flex-col items-center justify-center text-center p-2"
                            style={{
                                width: `${previewWidth}px`,
                                height: `${previewHeight}px`,
                                minWidth: `${previewWidth}px`, // prevent shrinking
                                minHeight: `${previewHeight}px`
                            }}
                        >
                            {/* Visual Representation of the Label */}
                            <div className="w-full h-full flex flex-col justify-between overflow-hidden">

                                {showTitleAr && (
                                    <div className="text-[10px] font-bold text-slate-600">{previewData.titleArabic}</div>
                                )}

                                <div className="flex-1 flex flex-col justify-center gap-1">
                                    {showNameAr && (
                                        <div className="font-bold text-sm leading-tight">{previewData.fullNameArabic}</div>
                                    )}
                                    {showNameEn && (
                                        <div className="text-xs text-slate-500 leading-tight">{previewData.fullNameEnglish}</div>
                                    )}
                                </div>

                                <div className="mb-1">
                                    {showBarcode && (
                                        <div className="w-3/4 h-8 bg-black/10 mx-auto flex items-end justify-center pb-1 mb-1">
                                            <span className="font-mono text-[8px] bg-white px-1">{previewData.barcode}</span>
                                        </div>
                                    )}
                                    {showInternalCode && (
                                        <div className="font-mono text-[9px] font-bold tracking-wider">{previewData.internalCode}</div>
                                    )}
                                    {showPrice && (
                                        <div className="font-bold text-lg mt-1">{price} ر.س</div>
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
