"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Barcode, Copy, Package, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import BarcodeDisplay from "@/components/barcode-display"
import { generateProduct } from "@/lib/generate-product"
import { getSettings } from "@/lib/settings-store"
import { useHistoryStore } from "@/lib/history-store"
import Link from "next/link"
import jsPDF from "jspdf"
import { Switch } from "@/components/ui/switch"

export default function BarcodesPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState(getSettings())

  const [productName, setProductName] = useState("")
  const [productNameEnglish, setProductNameEnglish] = useState("")
  const [category, setCategory] = useState("")
  const [brand, setBrand] = useState("")
  const [color, setColor] = useState("")
  const [collection, setCollection] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unit, setUnit] = useState("pcs")

  const [usage, setUsage] = useState("")
  const [material, setMaterial] = useState("")
  const [titleArabic, setTitleArabic] = useState("بطاقة المنتج")
  const [titleEnglish, setTitleEnglish] = useState("Product Card")

  // Bulk Generation State
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [bulkQuantity, setBulkQuantity] = useState("10")
  const { addItem } = useHistoryStore()


  const [generatedProduct, setGeneratedProduct] = useState<{
    internalCode: string
    barcode: string
    fullNameArabic: string
    fullNameEnglish: string
    barcodeBreakdown?: {
      saudiCode: string
      companyCode: string
      year: string
      month: string
      sequence: string
      categoryNum: string
      colorNum: string
      collectionNum: string
      checksum: string
    }
  } | null>(null)

  useEffect(() => {
    // Reload settings when component mounts
    setSettings(getSettings())
  }, [])

  const handleGenerate = () => {
    if (!category || !brand || !color) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      })
      return
    }

    if (isBulkMode) {
      const qty = parseInt(bulkQuantity)
      if (isNaN(qty) || qty <= 0 || qty > 1000) {
        toast({
          title: "خطأ",
          description: "الرجاء إدخال كمية صحيحة (1-1000)",
          variant: "destructive"
        })
        return
      }

      toast({
        title: "جاري التوليد...",
        description: `سيتم توليد ${qty} باركود...`,
      })

      // Allow UI to update before freezing
      setTimeout(() => {
        let generatedCount = 0
        const batchResults = []

        for (let i = 0; i < qty; i++) {
          // Generate sequential number: 0001, 0002... or based on index
          // We'll use a simple counter 1000 + i to ensure 4 digits if simple 1,2,3 is too short
          // Or just padStart(4, '0')
          const sequence = String(i + 1).padStart(4, '0')

          const result = generateProduct({
            productName,
            productNameEnglish,
            category,
            brand,
            color,
            collection,
            quantity,
            unit,
            usage,
            material,
            sequence // Pass custom sequence
          })

          batchResults.push(result)
          addItem({
            ...result,
            productNameArabic: result.fullNameArabic,
            productNameEnglish: result.fullNameEnglish
          })
          generatedCount++
        }

        setGeneratedProduct(batchResults[0]) // Show first one

        toast({
          title: "✅ تم الانتهاء",
          description: `تم توليد ${generatedCount} باركود بنجاح وإضافتها للسجل`,
        })

        setLastBatch(batchResults)
      }, 100)

    } else {
      const result = generateProduct({
        productName,
        productNameEnglish,
        category,
        brand,
        color,
        collection,
        quantity,
        unit,
        usage,
        material
      })

      setGeneratedProduct(result)
      addItem({
        ...result,
        productNameArabic: result.fullNameArabic,
        productNameEnglish: result.fullNameEnglish
      })

      toast({
        title: "✅ تم التوليد بنجاح",
        description: "تم إنشاء الكود والباركود وحفظه في السجل",
      })
    }
  }

  const [lastBatch, setLastBatch] = useState<any[]>([])

  const handleDownloadBatchPDF = () => {
    if (lastBatch.length === 0) return

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    // Grid settings
    const cols = 3
    const rows = 5
    const cardWidth = 60
    const cardHeight = 40
    const marginX = (pageWidth - (cols * cardWidth)) / 2
    const marginY = 10

    lastBatch.forEach((item, index) => {
      if (index > 0 && index % (cols * rows) === 0) {
        doc.addPage()
      }

      const posInPage = index % (cols * rows)
      const col = posInPage % cols
      const row = Math.floor(posInPage / cols)

      const x = marginX + (col * cardWidth)
      const y = marginY + (row * cardHeight)

      // Draw simple card for PDF (simplified version of BarcodeDisplay)
      doc.rect(x, y, cardWidth, cardHeight)
      doc.setFontSize(8)
      doc.text(titleArabic, x + cardWidth / 2, y + 5, { align: 'center' })
      doc.text(item.fullNameArabic, x + cardWidth / 2, y + 15, { align: 'center' })
      doc.text(item.barcode, x + cardWidth / 2, y + 25, { align: 'center' })
      doc.setFontSize(6)
      doc.text(item.internalCode, x + cardWidth / 2, y + 35, { align: 'center' })
    })

    doc.save("bulk-barcodes.pdf")
  }


  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "تم النسخ",
      description: `تم نسخ ${label}`,
    })
  }

  // Get sections dynamically
  const categoriesSection = settings.sections.find((s) => s.key === "categories")
  const brandsSection = settings.sections.find((s) => s.key === "brands")
  const colorsSection = settings.sections.find((s) => s.key === "colors")
  const collectionsSection = settings.sections.find((s) => s.key === "collections")
  const unitsSection = settings.sections.find((s) => s.key === "units")
  const usagesSection = settings.sections.find((s) => s.key === "usages")
  const materialsSection = settings.sections.find((s) => s.key === "materials")

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100" dir="rtl">
      <div className="max-w-7xl mx-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8">
        {/* Header - Mobile Optimized */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
              <Package className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-700 to-indigo-800 bg-clip-text text-transparent leading-tight">
            نظام توليد الأكواد والباركود
          </h1>
          <p className="text-gray-600 text-sm sm:text-lg px-4 mt-2">
            نظام متكامل لتوليد أسماء المنتجات، الأكواد الداخلية، والباركود الرقمي
          </p>
          <div className="mt-4">
            <Link href="/settings">
              <Button variant="outline" className="text-sm sm:text-base px-4 py-2">
                <Settings className="ml-2 h-4 w-4" />
                الإعدادات
              </Button>
            </Link>
          </div>
        </div>

        {/* Main Content - Mobile First Layout */}
        <div className="space-y-6 lg:space-y-8">
          {/* Input Form */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-t-2xl px-4 py-4 sm:px-6 sm:py-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                معلومات المنتج
              </CardTitle>
              <CardDescription className="text-blue-100 text-xs sm:text-base">
                أدخل تفاصيل المنتج لتوليد الأكواد تلقائياً
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">

              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <Label htmlFor="bulk-mode" className="font-bold">وضع التوليد الجماعي</Label>
                    <span className="text-xs text-muted-foreground">توليد مجموعة باركودات متسلسلة</span>
                  </div>
                </div>
                <Switch id="bulk-mode" checked={isBulkMode} onCheckedChange={setIsBulkMode} />
              </div>

              {isBulkMode && (
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg space-y-3 animation-all duration-300">
                  <Label htmlFor="bulk-qty">عدد النسخ (الباركودات)</Label>
                  <Input
                    id="bulk-qty"
                    type="number"
                    min="1"
                    max="1000"
                    value={bulkQuantity}
                    onChange={(e) => setBulkQuantity(e.target.value)}
                    className="bg-white"
                  />
                  <p className="text-xs text-muted-foreground">سيتم توليد {bulkQuantity} منتج برقم تسلسلي مختلف (0001, 0002, ...)</p>
                </div>
              )}

              {/* Card Titles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="titleArabic" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    عنوان البطاقة (عربي)
                  </Label>
                  <Input
                    id="titleArabic"
                    placeholder="مثال: بطاقة المنتج"
                    value={titleArabic}
                    onChange={(e) => setTitleArabic(e.target.value)}
                    className="text-right h-10 sm:h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="titleEnglish" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    عنوان البطاقة (إنجليزي)
                  </Label>
                  <Input
                    id="titleEnglish"
                    placeholder="Example: Product Card"
                    value={titleEnglish}
                    onChange={(e) => setTitleEnglish(e.target.value)}
                    className="text-right h-10 sm:h-11"
                  />
                </div>
              </div>

              {/* Product Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productName" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    الاسم الأساسي (عربي)
                  </Label>
                  <Input
                    id="productName"
                    placeholder="مثال: علبة، كيس، كوب"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="text-right h-10 sm:h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productNameEnglish" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    الاسم الأساسي (إنجليزي)
                  </Label>
                  <Input
                    id="productNameEnglish"
                    placeholder="Example: Box, Bag, Cup"
                    value={productNameEnglish}
                    onChange={(e) => setProductNameEnglish(e.target.value)}
                    className="text-right h-10 sm:h-11"
                  />
                </div>
              </div>

              {categoriesSection && (
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    {categoriesSection.nameAr} *
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="text-right h-10 sm:h-11">
                      <SelectValue placeholder={`اختر ${categoriesSection.nameAr}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(settings.categories || {}).map(([code, data]: [string, any]) => (
                        <SelectItem key={code} value={code}>
                          {data.ar} ({code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {brandsSection && (
                <div className="space-y-2">
                  <Label htmlFor="brand" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    {brandsSection.nameAr} *
                  </Label>
                  <Select value={brand} onValueChange={setBrand}>
                    <SelectTrigger className="text-right h-10 sm:h-11">
                      <SelectValue placeholder={`اختر ${brandsSection.nameAr}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(settings.brands || {}).map(([code, data]: [string, any]) => (
                        <SelectItem key={code} value={code}>
                          {data.ar} ({code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {colorsSection && (
                <div className="space-y-2">
                  <Label htmlFor="color" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    {colorsSection.nameAr} *
                  </Label>
                  <Select value={color} onValueChange={setColor}>
                    <SelectTrigger className="text-right h-10 sm:h-11">
                      <SelectValue placeholder={`اختر ${colorsSection.nameAr}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(settings.colors || {}).map(([code, data]: [string, any]) => (
                        <SelectItem key={code} value={code}>
                          {data.ar} ({code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {collectionsSection && (
                <div className="space-y-2">
                  <Label htmlFor="collection" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                    {collectionsSection.nameAr}
                  </Label>
                  <Select value={collection} onValueChange={setCollection}>
                    <SelectTrigger className="text-right h-10 sm:h-11">
                      <SelectValue placeholder={`اختر ${collectionsSection.nameAr} (اختياري)`} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(settings.collections || {}).map(([code, data]: [string, any]) => (
                        <SelectItem key={code} value={code}>
                          {data.ar} ({code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Usages and Materials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {usagesSection && (
                  <div className="space-y-2">
                    <Label htmlFor="usage" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                      {usagesSection.nameAr}
                    </Label>
                    <Select value={usage} onValueChange={setUsage}>
                      <SelectTrigger className="text-right h-10 sm:h-11">
                        <SelectValue placeholder={`اختر ${usagesSection.nameAr}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(settings.usages || []).map((item: any) => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.ar} ({item.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {materialsSection && (
                  <div className="space-y-2">
                    <Label htmlFor="material" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                      {materialsSection.nameAr}
                    </Label>
                    <Select value={material} onValueChange={setMaterial}>
                      <SelectTrigger className="text-right h-10 sm:h-11">
                        <SelectValue placeholder={`اختر ${materialsSection.nameAr}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(settings.materials || []).map((item: any) => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.ar} ({item.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">الكمية</Label>
                  <Input
                    id="quantity"
                    placeholder="36"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                {unitsSection && (
                  <div className="space-y-2">
                    <Label htmlFor="unit" className="text-right font-medium text-gray-700 text-sm sm:text-base">
                      {unitsSection.nameAr}
                    </Label>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger className="text-right h-10 sm:h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(settings.units || []).map((unitItem: any) => (
                          <SelectItem key={unitItem.code} value={unitItem.code}>
                            {unitItem.ar} ({unitItem.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Button
                onClick={handleGenerate}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl text-sm sm:text-base"
                size="lg"
              >
                <Barcode className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                توليد الكود والباركود
              </Button>

              {lastBatch.length > 0 && isBulkMode && (
                <Button
                  onClick={handleDownloadBatchPDF}
                  variant="outline"
                  className="w-full border-primary text-primary hover:bg-primary hover:text-white mt-2"
                >
                  <Copy className="ml-2 h-4 w-4" />
                  تحميل ملف PDF للدفعة ({lastBatch.length})
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Barcode className="h-5 w-5" />
                الناتج التلقائي
              </CardTitle>
              <CardDescription>الأكواد والباركود المُولّدة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedProduct ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">الاسم بالعربية</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md border bg-background p-3 text-lg font-semibold">
                        {generatedProduct.fullNameArabic}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(generatedProduct.fullNameArabic, "الاسم بالعربية")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">الاسم بالإنجليزية</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md border bg-background p-3 text-lg font-semibold">
                        {generatedProduct.fullNameEnglish}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(generatedProduct.fullNameEnglish, "الاسم بالإنجليزية")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">الكود الداخلي (أحرف + أرقام)</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md border bg-background p-3 font-mono text-lg font-bold">
                        {generatedProduct.internalCode}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(generatedProduct.internalCode, "الكود الداخلي")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Visual Hint for Compound Name Logic */}
                  <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                    تم توليد الاسم بناءً على نمط الفئة:
                    {category === 'BOX' ? ' [Brand] [Cat] [Color] [Coll] [Qty]' :
                      category === 'BAG' ? ' [Brand] Bag [Coll] [Color] [Qty]' :
                        category === 'CUP' ? ' [Brand] [Qty] [Mat] Cup [Coll]' : ' النمط الافتراضي'}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">الباركود (أرقام فقط)</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-md border bg-background p-3 font-mono text-lg font-bold">
                        {generatedProduct.barcode}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(generatedProduct.barcode, "الباركود")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {generatedProduct.barcodeBreakdown && (
                    <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Barcode className="h-4 w-4" />
                        <Label className="text-sm font-semibold">تفاصيل تركيبة الباركود</Label>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.saudiCode}</span>
                          <span className="text-muted-foreground">كود الدولة (السعودية)</span>
                          <span className="text-xs text-muted-foreground">3 أرقام</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.companyCode}</span>
                          <span className="text-muted-foreground">كود الشركة</span>
                          <span className="text-xs text-muted-foreground">4 أرقام</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.year}</span>
                          <span className="text-muted-foreground">السنة</span>
                          <span className="text-xs text-muted-foreground">2 رقم</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.month}</span>
                          <span className="text-muted-foreground">الشهر</span>
                          <span className="text-xs text-muted-foreground">2 رقم</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.sequence}</span>
                          <span className="text-muted-foreground">رقم التسلسل (الوقت)</span>
                          <span className="text-xs text-muted-foreground">4 أرقام</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.categoryNum}</span>
                          <span className="text-muted-foreground">كود الفئة</span>
                          <span className="text-xs text-muted-foreground">2 رقم</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.colorNum}</span>
                          <span className="text-muted-foreground">كود اللون</span>
                          <span className="text-xs text-muted-foreground">2 رقم</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                          <span className="font-mono font-bold text-primary">{generatedProduct.barcodeBreakdown.collectionNum}</span>
                          <span className="text-muted-foreground">كود المجموعة</span>
                          <span className="text-xs text-muted-foreground">2 رقم</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t pt-2">
                          <span className="font-mono font-bold text-green-600">{generatedProduct.barcodeBreakdown.checksum}</span>
                          <span className="text-muted-foreground">رقم التحقق (Checksum)</span>
                          <span className="text-xs text-muted-foreground">1 رقم</span>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md bg-background p-3 text-xs text-muted-foreground">
                        <p className="font-semibold mb-1">📊 إجمالي الأرقام: 22 رقم</p>
                        <p>التركيبة: 3 (دولة) + 4 (شركة) + 2 (سنة) + 2 (شهر) + 4 (تسلسل) + 2 (فئة) + 2 (لون) + 2 (مجموعة) + 1 (تحقق)</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Barcode className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>املأ النموذج وانقر على "توليد" لإنشاء الأكواد</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Barcode Display - Full Width on Mobile */}
          <div className="space-y-6">
            <BarcodeDisplay
              internalCode={generatedProduct?.internalCode}
              barcode={generatedProduct?.barcode}
              productNameArabic={generatedProduct?.fullNameArabic}
              productNameEnglish={generatedProduct?.fullNameEnglish}
              titleArabic={titleArabic}
              titleEnglish={titleEnglish}
            />
          </div>
        </div>
      </div>
      <Toaster />
    </div >
  )
}
