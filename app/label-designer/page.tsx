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
import JsBarcode from "jsbarcode"
import BarcodeDisplay from "@/components/barcode-display"
import { getProducts } from "@/lib/storage"
import type { Product } from "@/lib/types"

export default function LabelDesignerPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    
    // Check if this is bulk printing
    const isBulkPrinting = searchParams.get('bulk') === 'true'
    const allProducts = useMemo(() => getProducts(), [])
    const [productSearchTerm, setProductSearchTerm] = useState("")
    const [searchResults, setSearchResults] = useState<Product[]>([])
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
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

    const [titleFontSizeState, setTitleFontSizeState] = useState(8)
    const [nameArFontSizeState, setNameArFontSizeState] = useState(14)
    const [nameEnFontSizeState, setNameEnFontSizeState] = useState(8)
    const [barcodeFontSizeState, setBarcodeFontSizeState] = useState(7)
    const [barcodeWidthPercent, setBarcodeWidthPercent] = useState(75)
    const [barcodeHeightState, setBarcodeHeightState] = useState(30)
    const [barcodeStripeWidthState, setBarcodeStripeWidthState] = useState(2)
    const [internalCodeFontSizeState, setInternalCodeFontSizeState] = useState(10)
    const [priceFontSizeState, setPriceFontSizeState] = useState(12)
    const [elementOrder, setElementOrder] = useState<Array<'title' | 'nameAr' | 'nameEn' | 'barcode' | 'internalCode' | 'price'>>([
        'title',
        'nameAr',
        'nameEn',
        'barcode',
        'internalCode',
        'price'
    ])
    const barcodeSvgRef = useRef<SVGSVGElement | null>(null)

    const moveElement = (index: number, direction: 'up' | 'down') => {
        const nextIndex = direction === 'up' ? index - 1 : index + 1
        if (nextIndex < 0 || nextIndex >= elementOrder.length) return
        const newOrder = [...elementOrder]
        const temp = newOrder[index]
        newOrder[index] = newOrder[nextIndex]
        newOrder[nextIndex] = temp
        setElementOrder(newOrder)
    }

    useEffect(() => {
        const term = productSearchTerm.trim().toLowerCase()
        if (!term) {
            setSearchResults([])
            return
        }

        const results = allProducts.filter((product) => {
            const name = String(product.productName || "").toLowerCase()
            const code = String(product.productCode || "").toLowerCase()
            const item = String(product.itemNumber || "").toLowerCase()
            return name.includes(term) || code.includes(term) || item.includes(term)
        }).slice(0, 8)

        setSearchResults(results)
    }, [productSearchTerm, allProducts])

    const handleSelectProduct = (product: Product) => {
        setSelectedProduct(product)
        setProductSearchTerm(product.productName || product.productCode || "")
        setSearchResults([])
        setPrice(String(product.price ?? 0))
    }

    const previewData = {
        internalCode: selectedProduct?.itemNumber || searchParams.get('itemNumber') || searchParams.get('productCode') || "BOX-MIXB-BRN-25-0001",
        barcode: selectedProduct?.productCode || searchParams.get('barcode') || searchParams.get('productCode') || "6281057012517",
        fullNameArabic: selectedProduct?.productName || searchParams.get('productName') || "علبة ميكس براند بني (تجربة)",
        fullNameEnglish: selectedProduct?.productName || searchParams.get('productName') || "Mix Brand Box Brown (Demo)",
        titleArabic: "بطاقة المنتج"
    }

    // Calculate pixel dimensions for screen preview (approx 3.78 px per mm)
    const pxPerMm = 3.78
    const previewWidth = width * pxPerMm
    const previewHeight = height * pxPerMm

    const isSmallLabel = width < 50 || height < 30
    const previewPadding = isSmallLabel ? 6 : 10
    const barcodeContainerWidth = Math.max(40, Math.min(previewWidth - previewPadding * 2, previewWidth * (barcodeWidthPercent / 100)))
    const barcodeContainerHeight = Math.max(16, Math.min(previewHeight * 0.25, barcodeHeightState))
    const barcodeLineCount = isSmallLabel ? 8 : 12
    const cardGap = isSmallLabel ? 0.5 : 1

    useEffect(() => {
        if (!barcodeSvgRef.current || !showBarcode || !previewData.barcode) return

        try {
            JsBarcode(barcodeSvgRef.current, previewData.barcode, {
                format: "CODE128",
                lineColor: "#000",
                background: "#fff",
                width: barcodeStripeWidthState,
                height: Math.max(20, barcodeContainerHeight - 4),
                margin: 0,
                displayValue: false,
            })
        } catch (error) {
            // ignore invalid code render errors
        }
    }, [previewData.barcode, barcodeContainerHeight, isSmallLabel, showBarcode, barcodeStripeWidthState])

    const renderPreviewElement = (element: 'title' | 'nameAr' | 'nameEn' | 'barcode' | 'internalCode' | 'price') => {
        switch (element) {
            case 'title':
                return showTitleAr ? (
                    <div key="title" style={{ fontSize: `${titleFontSizeState}px` }} className="text-gray-500 font-medium break-words whitespace-normal">{previewData.titleArabic}</div>
                ) : null
            case 'nameAr':
                return showNameAr ? (
                    <div key="nameAr" style={{ fontSize: `${nameArFontSizeState}px` }} className="font-bold leading-tight text-black break-words whitespace-normal max-w-full">{previewData.fullNameArabic}</div>
                ) : null
            case 'nameEn':
                return showNameEn ? (
                    <div key="nameEn" style={{ fontSize: `${nameEnFontSizeState}px` }} className="text-gray-600 leading-tight break-words whitespace-normal max-w-full">{previewData.fullNameEnglish}</div>
                ) : null
            case 'barcode':
                return showBarcode ? (
                    <div key="barcode" className="flex flex-col items-center">
                        <div style={{ width: `${barcodeContainerWidth}px`, minHeight: `${barcodeContainerHeight}px`, background: '#fff', padding: '4px', boxSizing: 'border-box', borderRadius: '4px' }} className="flex items-center justify-center border border-slate-200">
                            <svg ref={barcodeSvgRef} style={{ width: '100%', height: '100%' }} />
                        </div>
                        <span style={{ fontSize: `${barcodeFontSizeState}px` }} className="font-mono text-gray-700 mt-1 break-all">{previewData.barcode}</span>
                    </div>
                ) : null
            case 'internalCode':
                return showInternalCode ? (
                    <div key="internalCode" style={{ fontSize: `${internalCodeFontSizeState}px` }} className="font-mono font-bold tracking-wider text-black break-all">{previewData.internalCode}</div>
                ) : null
            case 'price':
                return showPrice ? (
                    <div key="price" style={{ fontSize: `${priceFontSizeState}px` }} className="font-bold text-green-700 bg-green-50 px-2 py-1 rounded inline-block mt-1 break-words whitespace-normal">{price} SAR</div>
                ) : null
            default:
                return null
        }
    }

    const orderedPreviewElements = elementOrder.map(renderPreviewElement).filter(Boolean)

    const openPrintWindow = (html: string) => {
        const printWindow = window.open("", "", "width=900,height=700")
        if (!printWindow) return
        printWindow.document.write(html)
        printWindow.document.close()
    }

    const buildPrintHtml = (products: Array<{ id: string; productCode: string; itemNumber: string; productName: string; barcode: string; price: string }>) => {
        const buildPrintElement = (element: 'title' | 'nameAr' | 'nameEn' | 'barcode' | 'internalCode' | 'price', product: { barcode: string; itemNumber: string; productName: string; price: string }, index: number) => {
            switch (element) {
                case 'title':
                    return showTitleAr ? `<div class="label-title" style="font-size: ${titleFontSizeState}px;">${previewData.titleArabic}</div>` : ''
                case 'nameAr':
                    return showNameAr ? `<div class="product-name-ar" style="font-size: ${nameArFontSizeState}px;">${product.productName}</div>` : ''
                case 'nameEn':
                    return showNameEn ? `<div class="product-name-en" style="font-size: ${nameEnFontSizeState}px;">${previewData.fullNameEnglish}</div>` : ''
                case 'barcode':
                    return showBarcode && product.barcode ? `<div class="barcode-area" style="width: ${barcodeWidthPercent}%; max-width: 100%;"><svg id="barcode-${index}" style="width: 100%; height: ${barcodeHeightState}px;"></svg></div><div class="barcode-text" style="font-size: ${barcodeFontSizeState}px;">${product.barcode}</div>` : ''
                case 'internalCode':
                    return showInternalCode && product.itemNumber ? `<div class="internal-code" style="font-size: ${internalCodeFontSizeState}px;">${product.itemNumber}</div>` : ''
                case 'price':
                    return showPrice && product.price ? `<div class="price" style="font-size: ${priceFontSizeState}px;">${product.price} SAR</div>` : ''
                default:
                    return ''
            }
        }

        const cardsHtml = products.map((product, index) => `
            <div class="label-card">
                ${elementOrder.map((element) => buildPrintElement(element, product, index)).join('')}
            </div>
        `).join('')

        return `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>طباعة الملصقات</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&display=swap');
                    body {
                        margin: 0;
                        padding: 16px;
                        font-family: 'Noto Sans Arabic', Arial, sans-serif;
                        background: #f7f7f7;
                    }
                    .label-card {
                        width: ${width}mm;
                        height: ${height}mm;
                        max-width: ${width}mm;
                        border: 1px solid #ccc;
                        border-radius: 10px;
                        background: #fff;
                        padding: 12px;
                        margin: 0 auto;
                        box-shadow: 0 4px 18px rgba(0,0,0,0.05);
                        box-sizing: border-box;
                        display: block;
                        page-break-after: always;
                    }
                    .label-title {
                        font-size: 12px;
                        color: #444;
                        text-align: center;
                        margin-bottom: 8px;
                        font-weight: 700;
                    }
                    .product-name-ar {
                        font-size: 18px;
                        text-align: center;
                        font-weight: 700;
                        line-height: 1.25;
                        margin: 10px 0 8px;
                    }
                    .product-name-en {
                        font-size: 12px;
                        text-align: center;
                        color: #4b5563;
                        margin-bottom: 12px;
                    }
                    .barcode-area {
                        display: flex;
                        justify-content: center;
                        margin-bottom: 10px;
                    }
                    .barcode-area svg,
                    .barcode-area canvas {
                        max-width: 100%;
                        width: 100%;
                        height: 70px;
                    }
                    .barcode-text,
                    .internal-code,
                    .price {
                        text-align: center;
                        font-size: 12px;
                        font-weight: 700;
                        margin: 4px 0;
                    }
                    .price {
                        color: #047857;
                    }
                    @page {
                        size: ${width}mm ${height}mm;
                        margin: 0;
                    }
                    @media print {
                        body {
                            padding: 0;
                            background: white;
                        }
                        .label-card {
                            page-break-inside: avoid;
                            page-break-after: always;
                            box-shadow: none;
                            margin: 0;
                            border-color: #999;
                        }
                    }
                </style>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.12.1/JsBarcode.all.min.js"></script>
            </head>
            <body>
                ${cardsHtml}
                <script>
                    const products = ${JSON.stringify(products)};
                    products.forEach((product, index) => {
                        const svg = document.getElementById('barcode-' + index);
                        if (!svg) return;
                        try {
                            JsBarcode(svg, String(product.barcode || product.productCode || ''), {
                                format: 'CODE128',
                                lineColor: '#000',
                                background: '#fff',
                                width: ${barcodeStripeWidthState},
                                height: ${Math.max(20, barcodeHeightState - 4)},
                                margin: 0,
                                displayValue: false,
                            });
                        } catch (err) {
                            console.warn('Barcode render error', err);
                        }
                    });
                    window.print();
                </script>
            </body>
            </html>
        `
    }

    const handlePrint = () => {
        const products = isBulkPrinting && bulkProducts.length > 0
            ? bulkProducts.map((product) => ({
                id: product.id,
                productCode: product.barcode || product.productCode,
                itemNumber: product.itemNumber,
                productName: product.productName || product.productCode,
                barcode: product.barcode,
                price: product.price,
            }))
            : [{
                id: 'single',
                productCode: previewData.barcode,
                itemNumber: previewData.internalCode,
                productName: previewData.fullNameArabic,
                barcode: previewData.barcode,
                price,
            }]

        openPrintWindow(buildPrintHtml(products))
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

                            <div className="space-y-4 border-b pb-4">
                                <Label className="font-bold">بحث عن منتج</Label>
                                <Input
                                    placeholder="اكتب اسم المنتج أو الكود أو الباركود"
                                    value={productSearchTerm}
                                    onChange={(e) => setProductSearchTerm(e.target.value)}
                                />
                                {searchResults.length > 0 && (
                                    <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                                        {searchResults.map((product) => (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() => handleSelectProduct(product)}
                                                className="w-full text-right px-3 py-2 hover:bg-slate-100"
                                            >
                                                <div className="font-semibold">{product.productName}</div>
                                                <div className="text-[11px] text-slate-500">{product.productCode} · {product.itemNumber}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {selectedProduct && (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-right text-sm text-slate-700">
                                        تم اختيار: <span className="font-semibold">{selectedProduct.productName}</span> · {selectedProduct.productCode}
                                    </div>
                                )}
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

                            <div className="space-y-4 border-b pb-4">
                                <Label className="font-bold">حجم الخط لكل عنصر</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label className="text-xs">عنوان الشركة</Label>
                                        <Input
                                            type="number"
                                            value={titleFontSizeState}
                                            onChange={(e) => setTitleFontSizeState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">الاسم العربي</Label>
                                        <Input
                                            type="number"
                                            value={nameArFontSizeState}
                                            onChange={(e) => setNameArFontSizeState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">الاسم الإنجليزي</Label>
                                        <Input
                                            type="number"
                                            value={nameEnFontSizeState}
                                            onChange={(e) => setNameEnFontSizeState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">نص الباركود</Label>
                                        <Input
                                            type="number"
                                            value={barcodeFontSizeState}
                                            onChange={(e) => setBarcodeFontSizeState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">عرض الباركود (%)</Label>
                                        <Input
                                            type="number"
                                            value={barcodeWidthPercent}
                                            min={40}
                                            max={100}
                                            onChange={(e) => setBarcodeWidthPercent(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">ارتفاع الباركود (px)</Label>
                                        <Input
                                            type="number"
                                            value={barcodeHeightState}
                                            min={16}
                                            max={120}
                                            onChange={(e) => setBarcodeHeightState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">سمك شريط الباركود</Label>
                                        <Input
                                            type="number"
                                            value={barcodeStripeWidthState}
                                            min={1}
                                            max={6}
                                            onChange={(e) => setBarcodeStripeWidthState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">الكود الداخلي</Label>
                                        <Input
                                            type="number"
                                            value={internalCodeFontSizeState}
                                            onChange={(e) => setInternalCodeFontSizeState(Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">السعر</Label>
                                        <Input
                                            type="number"
                                            value={priceFontSizeState}
                                            onChange={(e) => setPriceFontSizeState(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 border-b pb-4">
                                <Label className="font-bold">ترتيب العناصر</Label>
                                {elementOrder.map((element, index) => {
                                    const labels: Record<string, string> = {
                                        title: 'عنوان الشركة',
                                        nameAr: 'الاسم العربي',
                                        nameEn: 'الاسم الإنجليزي',
                                        barcode: 'الباركود',
                                        internalCode: 'الكود الداخلي',
                                        price: 'السعر',
                                    }
                                    return (
                                        <div key={element} className="flex items-center justify-between gap-2 rounded-md border px-2 py-2 bg-slate-50">
                                            <span className="text-sm">{labels[element]}</span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => moveElement(index, 'up')}
                                                    disabled={index === 0}
                                                    className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                                                >
                                                    أعلى
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveElement(index, 'down')}
                                                    disabled={index === elementOrder.length - 1}
                                                    className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                                                >
                                                    أسفل
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Preview Panel */}
                    <Card className="lg:col-span-2 shadow-md bg-slate-200/50 flex items-center justify-center p-8 overflow-auto">
                        <div
                            className="bg-white shadow-xl rounded-sm relative transition-all duration-300 flex flex-col items-center justify-center text-center border border-gray-200"
                            style={{
                                width: `${previewWidth}px`,
                                height: `${previewHeight}px`,
                                minWidth: `${previewWidth}px`, // prevent shrinking
                                minHeight: `${previewHeight}px`,
                                padding: `${previewPadding}px`,
                                boxSizing: 'border-box'
                            }}
                        >
                            {/* Visual Representation of Label - Enhanced */}
                            <div className="w-full h-full flex flex-col justify-start overflow-hidden text-center gap-1">
                                {orderedPreviewElements}
                            </div>
                        </div>
                    </Card>

                </div>
            </div>
        </div>
    )
}
