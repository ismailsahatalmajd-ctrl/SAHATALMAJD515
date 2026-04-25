"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Product } from "@/lib/types"
import { calculateProductValues, getProducts, getUnits, getWarehouseLocations } from "@/lib/storage"
import { toast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { storage } from "@/lib/firebase"
import { getSafeImageSrc, normalize, getApiUrl } from "@/lib/utils"
import { Upload, X, Loader2, PlusCircle, Box, Languages } from 'lucide-react'
import { db } from "@/lib/db"
// import { ref, uploadBytes, getDownloadURL } from "firebase/storage"

interface ProductFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (product: Partial<Product>) => Promise<void> | void
  product?: Product
  categories: string[]
}

export function ProductForm({ open, onOpenChange, onSubmit, product, categories }: ProductFormProps) {
  const { t } = useI18n()
  const [formData, setFormData] = useState<Partial<Product>>(
    product || {
      productCode: "",
      cartonBarcode: "",
      itemNumber: "",
      location: "",
      productName: "",
      quantity: 0,
      quantityPerCarton: 1,
      unit: "قطعة",
      cartonUnit: "سم",
      cartonLength: 0,
      cartonWidth: 0,
      cartonHeight: 0,
      openingStock: 0,
      purchases: 0,
      issues: 0, // removed duplicate purchases
      inventoryCount: 0,
      price: 0,
      category: "",
      image: undefined,
      minStockLimit: 10, // Default min stock limit
      lowStockThresholdPercentage: 33.33,
    },
  )

  const unitsList = getUnits()
  const warehouseLocations = getWarehouseLocations()

  const [imagePreview, setImagePreview] = useState<string | undefined>(product?.image)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isMountedRef = useRef(true)
  const imageSectionRef = useRef<HTMLDivElement>(null)
  const autoCloseTimerRef = useRef<number | null>(null)

  const [isSettlementOpen, setIsSettlementOpen] = useState(false)
  const [settlementType, setSettlementType] = useState<'plus' | 'minus'>('plus')
  const [settlementQty, setSettlementQty] = useState(0)
  const [settlementNote, setSettlementNote] = useState("")
  const [isTranslatingNote, setIsTranslatingNote] = useState(false)

  const handleTranslateNote = async () => {
    if (!settlementNote.trim()) return
    setIsTranslatingNote(true)
    try {
      const isArabic = /[\u0600-\u06FF]/.test(settlementNote)
      const langPair = isArabic ? "ar|en" : "en|ar"
      
      // Local dictionary for better context (Warehouse terms)
      const warehouseTerms: Record<string, string> = {
        "صرف": "Issue",
        "الصرف": "Issues",
        "مرتجع": "Return",
        "المرتجعات": "Returns",
        "جرد": "Inventory",
        "تلف": "Damaged",
        "تالف": "Damaged",
        "خطأ": "Error",
        "خطأ إدخال": "Entry Error",
        "مشتريات": "Purchases",
        "زيادة": "Plus / Increase",
        "نقص": "Minus / Decrease"
      }

      let translated = ""
      const normalized = settlementNote.trim()
      
      if (isArabic && warehouseTerms[normalized]) {
        translated = warehouseTerms[normalized]
      } else {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(settlementNote)}&langpair=${langPair}`)
        const data = await res.json()
        translated = data.responseData?.translatedText || ""
      }
      
      if (translated) {
        let finalNote = ""
        if (isArabic) {
          finalNote = `${settlementNote} / ${translated}`
        } else {
          finalNote = `${translated} / ${settlementNote}`
        }
        setSettlementNote(finalNote)
        toast({ 
          title: "تمت الترجمة / Translated", 
          description: `النتيجة: ${translated}` 
        })
      }
    } catch (error) {
      toast({ title: t("common.error"), description: "فشلت الترجمة", variant: "destructive" })
    } finally {
      setIsTranslatingNote(false)
    }
  }

  const handleApplySettlement = async () => {
    const delta = settlementType === "plus" ? settlementQty : -settlementQty
    const currentAdjustments = Number(formData.adjustments) || 0
    const newAdjustments = currentAdjustments + delta
    
    // Update formData with new cumulative adjustments
    setFormData(prev => {
      const op = Number(prev.openingStock) || 0
      const pu = Number(prev.purchases) || 0
      const ret = Number(prev.returns) || 0
      const iss = Number(prev.issues) || 0
      const newCalcStock = op + pu + ret + newAdjustments - iss
      
      return {
        ...prev,
        adjustments: newAdjustments,
        lastAdjustmentNote: settlementNote,
        currentStock: newCalcStock,
        quantity: newCalcStock,
        inventoryCount: newCalcStock
      }
    })
    
    // Reset settlement fields
    setIsSettlementOpen(false)
    setSettlementQty(0)
    setSettlementNote("")
    
    toast({
      title: "تم تطبيق التسوية / Settlement Applied",
      description: `تم تعديل المخزون بـ ${delta > 0 ? "+" : ""}${delta} وحدة.`,
    })
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (open) {
      if (product) {
        console.log("[v0] Mirroring product data from table:", product.productName)

        // [MIRROR LOGIC] استخدام بيانات المنتج المباشرة كما في الجدول تماماً
        const op = Number(product.openingStock) || 0
        const pu = Number(product.purchases) || 0
        const iss = Number(product.issues) || 0
        const adj = Number(product.adjustments) || 0
        const ret = Number(product.returns) || 0
        
        // حساب الرصيد باستخدام نفس معادلة الجدول
        const calculatedStock = op + pu + ret + adj - iss

        setFormData({
          ...product,
          openingStock: op,
          purchases: pu,
          issues: iss,
          returns: ret,
          adjustments: adj,
          inventoryCount: calculatedStock, // Mirror table forcing
          currentStock: calculatedStock,
          quantity: calculatedStock // Sync quantity for display
        })
        setImagePreview(product.image)
      } else {
        console.log("[v0] Resetting form for new product")
        setFormData({
          productCode: "",
          itemNumber: "",
          location: "",
          productName: "",
          quantity: 0,
          quantityPerCarton: 1,
          unit: "قطعة",
          cartonLength: 0,
          cartonWidth: 0,
          cartonHeight: 0,
          openingStock: 0,
          purchases: 0,
          issues: 0,
          returns: 0,
          adjustments: 0,
          inventoryCount: 0,
          price: 0,
          category: "",
          image: undefined,
          minStockLimit: 10,
          lowStockThresholdPercentage: 33.33,
        })
        setImagePreview(undefined)
      }

      // Focus/Auto-close logic
      try {
        const focusSection = sessionStorage.getItem("productFormFocusSection")
        const autoCloseMs = Number(sessionStorage.getItem("productFormAutoCloseMs") || "0")
        if (focusSection === "image") {
          imageSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        if (autoCloseMs && autoCloseMs > 0) {
          if (autoCloseTimerRef.current) window.clearTimeout(autoCloseTimerRef.current)
          autoCloseTimerRef.current = window.setTimeout(() => {
            onOpenChange(false)
            try {
              sessionStorage.removeItem("productFormFocusSection")
              sessionStorage.removeItem("productFormAutoCloseMs")
            } catch { }
          }, autoCloseMs)
        }
      } catch { }
    }
  }, [open, product])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // [IDEMPOTENCY GUARD] منع الضغط المتكرر
    if (isSaving) return 

    try {
      setIsSaving(true)

      const L = Number(formData.cartonLength || 0)
      const W = Number(formData.cartonWidth || 0)
      const H = Number(formData.cartonHeight || 0)
      if (L < 0 || W < 0 || H < 0) {
        toast({
          title: getDualString("productForm.error.dimensions.title"),
          description: getDualString("productForm.error.dimensions.desc"),
          variant: "destructive",
        })
        setIsSaving(false)
        return
      }

      // عند تعديل منتج: لا نرسل حقول الحركات التاريخية (مشتريات/صرف/مرتجع)
      // حتى لا يُعاد تطبيق أثرها على المخزون عند حفظ الفورم.
      if (product) {
        const oldAdj = Number(product.adjustments || 0)
        const newAdj = Number(formData.adjustments || 0)
        const adjustmentsChanged = oldAdj !== newAdj

        const editPayload: Partial<Product> = {
          productCode: formData.productCode,
          cartonBarcode: formData.cartonBarcode,
          itemNumber: formData.itemNumber,
          location: formData.location,
          productName: formData.productName,
          unit: formData.unit,
          cartonUnit: formData.cartonUnit,
          cartonLength: Number(formData.cartonLength || 0),
          cartonWidth: Number(formData.cartonWidth || 0),
          cartonHeight: Number(formData.cartonHeight || 0),
          quantityPerCarton: (formData.quantityPerCarton || 0) === 0 ? 1 : Number(formData.quantityPerCarton || 1),
          price: Number(formData.price || 0),
          category: formData.category,
          image: formData.image,
          minStockLimit: Number(formData.minStockLimit || 0),
          lowStockThresholdPercentage: Number(formData.lowStockThresholdPercentage || 33.33),
          warehouseLocationId: formData.warehouseLocationId,
          warehousePositionCode: formData.warehousePositionCode,
        }

        if (adjustmentsChanged) {
          editPayload.adjustments = newAdj
          editPayload.lastAdjustmentNote = formData.lastAdjustmentNote || settlementNote || product.lastAdjustmentNote
        }

        await onSubmit(editPayload)
      } else {
        // [GLOBAL ADJUSTMENT LOGIC] مخزن التسويات
        // عند إنشاء منتج جديد نستخدم الكمية الافتتاحية من حقل الكمية.
        const qty = typeof formData.quantity === "number" && formData.quantity >= 0 ? Number(formData.quantity) : 0
        const dataToSubmit = {
          ...formData,
          quantityPerCarton: (formData.quantityPerCarton || 0) === 0 ? 1 : formData.quantityPerCarton,
          openingStock: qty,
        }

        const calculatedData = calculateProductValues(dataToSubmit as Product)
        await onSubmit(calculatedData as Product)
      }

      if (isMountedRef.current) {
        onOpenChange(false)
        setImagePreview(undefined)
        setIsSaving(false)
      }
    } catch (error: any) {
      console.error("Error submitting product form:", error)
      toast({
        title: getDualString("productForm.error.unexpected.title"),
        description: getDualString("productForm.error.unexpected.desc", undefined, undefined, { error: error.message }),
        variant: "destructive"
      })
      setIsSaving(false)
    }
  }

  const handleChange = (field: keyof Product, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ["image/jpeg", "image/png", "image/gif"]
    if (!allowed.includes(file.type)) {
      toast({ title: t("common.error.unsupportedFormat"), description: t("common.error.useImageFormats") })
      return
    }
    if (file.size > 5 * 1024 * 1024) { // Increased to 5MB for storage
      toast({ title: getDualString("common.error.largeFile"), description: getDualString("common.error.maxSize2MB") }) // Keeping 2MB key but logic is 5MB? I'll just use a generic message
      return
    }

    // Base64 Upload (Matches Assets Management logic)
    // The user requested to use the same method as "Add Asset" which uses simple Base64 storage.
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      setImagePreview(base64)
      setFormData((prev) => ({ ...prev, image: base64 }))
      toast({ title: getDualString("productForm.success.imageUploaded") })
    }
    reader.onerror = () => {
      toast({
        title: getDualString("productForm.error.imageUploadFailed.title"),
        variant: "destructive"
      })
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setImagePreview(undefined)
    setFormData((prev) => ({ ...prev, image: undefined }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? <DualText k="products.form.editTitle" /> : <DualText k="products.form.addTitle" />}</DialogTitle>
          <DialogDescription><DualText k="products.form.desc" /></DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2" ref={imageSectionRef}>
              <Label><DualText k="products.form.image" /></Label>
              {isUploading ? (
                <div className="flex items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : imagePreview ? (
                <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                  <img
                    src={getSafeImageSrc(imagePreview || "/placeholder.svg")}
                    alt="Product Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = "/placeholder.svg" }}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 left-1 h-6 w-6"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent transition-colors">
                  <div className="text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground"><DualText k="products.form.uploadImage" /></span>
                  </div>
                  <input type="file" accept="image/jpeg,image/png,image/gif" onChange={handleImageUpload} className="hidden" />
                </label>
              )}

              {/* تمت إزالة معرض الصور بناءً على الطلب؛ الآن نعرض آخر صورة فقط */}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="productCode"><DualText k="common.code" /></Label>
                <Input
                  id="productCode"
                  value={formData.productCode}
                  onChange={(e) => handleChange("productCode", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="itemNumber"><DualText k="common.itemNumber" /></Label>
                <Input
                  id="itemNumber"
                  value={formData.itemNumber}
                  onChange={(e) => handleChange("itemNumber", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cartonBarcode">Carton Barcode / باركود الكرتون</Label>
                <Input
                  id="cartonBarcode"
                  value={formData.cartonBarcode || ""}
                  onChange={(e) => handleChange("cartonBarcode", e.target.value)}
                  placeholder="Scan Carton Code..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location"><DualText k="common.location" /></Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => handleChange("location", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="productName"><DualText k="common.productName" /></Label>
                <Input
                  id="productName"
                  value={formData.productName}
                  onChange={(e) => handleChange("productName", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit"><DualText k="common.unit" /></Label>
                <Select value={formData.unit} onValueChange={(value) => handleChange("unit", value)}>
                  <SelectTrigger id="unit">
                    <SelectValue placeholder={t("common.selectUnit")} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsList && unitsList.length > 0 ? (
                      unitsList.map((u) => (
                        <SelectItem key={u.id} value={u.name}>
                          {u.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="قطعة">قطعة / Piece</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>



            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category"><DualText k="common.category" /></Label>
                <Select value={formData.category} onValueChange={(value) => handleChange("category", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("common.selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouseLocation"><DualText k="common.warehouseLocation" /> / موقع المستودع</Label>
                <Select 
                  value={formData.warehouseLocationId || "none"} 
                  onValueChange={(value) => {
                    const loc = warehouseLocations.find(l => l.id === value)
                    setFormData(prev => ({
                      ...prev,
                      warehouseLocationId: value === "none" ? undefined : value,
                      warehousePositionCode: loc ? loc.positionCode : undefined
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر موقعاً / Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون موقع / No Location</SelectItem>
                          {warehouseLocations.sort((a, b) => a.positionCode.localeCompare(b.positionCode)).map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.positionCode} ({loc.warehouse} - {loc.zone})
                            </SelectItem>
                          ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cartonLength"><DualText k="products.form.cartonLength" /></Label>
                <Input
                  id="cartonLength"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.cartonLength ?? 0}
                  onChange={(e) => handleChange("cartonLength", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cartonWidth"><DualText k="products.form.cartonWidth" /></Label>
                <Input
                  id="cartonWidth"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.cartonWidth ?? 0}
                  onChange={(e) => handleChange("cartonWidth", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cartonHeight"><DualText k="products.form.cartonHeight" /></Label>
                <Input
                  id="cartonHeight"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.cartonHeight ?? 0}
                  onChange={(e) => handleChange("cartonHeight", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cartonUnit"><DualText k="products.form.cartonUnit" /></Label>
                <Select value={formData.cartonUnit} onValueChange={(value) => handleChange("cartonUnit", value)}>
                  <SelectTrigger id="cartonUnit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="مم">مم</SelectItem>
                    <SelectItem value="سم">سم</SelectItem>
                    <SelectItem value="م">م</SelectItem>
                    <SelectItem value="إنش">إنش</SelectItem>
                    <SelectItem value="قدم">قدم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantityPerCarton"><DualText k="products.form.quantityPerCarton" /></Label>
                <Input
                  id="quantityPerCarton"
                  type="number"
                  min={1}
                  value={formData.quantityPerCarton ?? 1}
                  onChange={(e) => handleChange("quantityPerCarton", e.target.value)}
                />
              </div>
            </div>

            <div className="bg-gray-50/50 p-4 rounded-xl border border-dashed border-gray-200">
              <h3 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                <Box className="h-3 w-3" />
                سجل الحركة التاريخي / Historical Ledger
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1 opacity-80 text-center">
                  <Label htmlFor="openingStock" className="text-[10px] text-muted-foreground block mb-1">إفتتاحي / Opening</Label>
                  <Input
                    id="openingStock"
                    type="number"
                    step="any"
                    value={formData.openingStock}
                    readOnly
                    className="bg-white/50 cursor-not-allowed font-mono text-center h-8"
                  />
                </div>
                <div className="space-y-1 opacity-80 text-center">
                  <Label htmlFor="purchases" className="text-[10px] text-muted-foreground block mb-1">مشتريات / Purchases</Label>
                  <Input
                    id="purchases"
                    type="number"
                    step="any"
                    value={formData.purchases}
                    readOnly
                    className="bg-white/50 cursor-not-allowed font-mono text-center h-8"
                  />
                </div>
                <div className="space-y-1 opacity-80 text-center">
                  <Label htmlFor="returns" className="text-[10px] text-muted-foreground block mb-1">مرتجع / Returns</Label>
                  <Input
                    id="returns"
                    type="number"
                    step="any"
                    value={formData.returns || 0}
                    readOnly
                    className="bg-white/50 cursor-not-allowed font-mono text-center h-8"
                  />
                </div>
                <div className="space-y-1 opacity-80 text-center">
                  <Label htmlFor="issues" className="text-[10px] text-muted-foreground block mb-1">صرف / Issues</Label>
                  <Input
                    id="issues"
                    type="number"
                    step="any"
                    value={formData.issues}
                    readOnly
                    className="bg-white/50 cursor-not-allowed font-mono text-center h-8"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price" className="font-semibold"><DualText k="common.price" /></Label>
                <Input
                  id="price"
                  type="number"
                  step="any"
                  value={formData.price}
                  onChange={(e) => handleChange("price", e.target.value)}
                  className="bg-blue-50/20 border-blue-100"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="font-semibold"><DualText k="products.form.category" /></Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => handleChange("category", v)}
                >
                  <SelectTrigger className="bg-blue-50/20 border-blue-100">
                    <SelectValue placeholder={t("products.form.categoryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* قسم الرصيد والتسويات -Balance & Settlements */}
            <div className="border-t pt-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity" className="text-green-700 font-bold block mb-1">
                    {product ? "الرصيد الحالي / Current Stock" : "الكمية الابتدائية / Initial Qty"}
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="any"
                    value={formData.quantity}
                    onChange={(e) => handleChange("quantity", e.target.value)}
                    readOnly={!!product}
                    className={`font-mono font-bold text-lg ${product ? "bg-green-50/50 cursor-not-allowed border-green-200 text-green-700" : "border-green-300"}`}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="adjustments" className="text-blue-600 font-bold block mb-1">إجمالي التسويات / Total Adjustments</Label>
                  <div className="flex gap-2">
                    <Input
                      id="adjustments"
                      type="number"
                      step="any"
                      value={formData.adjustments || 0}
                      readOnly
                      className="bg-blue-50/50 cursor-not-allowed font-bold text-blue-700 border-blue-200"
                    />
                    {product && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setIsSettlementOpen(!isSettlementOpen)}
                        className="whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 h-10 px-4"
                      >
                        {isSettlementOpen ? "إلغاء / Cancel" : "تسوية / Adjust"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {isSettlementOpen && (
                <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg animate-in fade-in slide-in-from-top-2">
                  <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <PlusCircle className="h-4 w-4" />
                    تسوية مخزنية جديدة / New Inventory Settlement
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">نوع الحركة / Action Type</Label>
                      <div className="flex bg-white rounded-md p-1 border shadow-sm">
                        <Button 
                          type="button" 
                          variant={settlementType === 'plus' ? 'default' : 'ghost'} 
                          size="sm" 
                          className={`flex-1 text-xs h-8 ${settlementType === 'plus' ? 'bg-blue-600 text-white' : ''}`}
                          onClick={() => setSettlementType('plus')}
                        >
                          زيادة / Plus (+)
                        </Button>
                        <Button 
                          type="button" 
                          variant={settlementType === 'minus' ? 'destructive' : 'ghost'} 
                          size="sm" 
                          className="flex-1 text-xs h-8"
                          onClick={() => setSettlementType('minus')}
                        >
                          نقص / Minus (-)
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">كمية الفرق / Qty to Change</Label>
                      <Input 
                        type="number" 
                        placeholder="0"
                        className="h-10 bg-white font-bold text-center text-blue-800 border-blue-300" 
                        value={settlementQty || ""} 
                        onChange={(e) => setSettlementQty(Math.abs(Number(e.target.value)))} 
                      />
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    <Label className="text-xs font-semibold">ملاحظة التسوية / Settlement Note</Label>
                    <div className="relative">
                      <Input 
                        placeholder="سبب التسوية (مثلاً: تالف، جرد، خطأ إدخال)..."
                        className="h-10 bg-white border-blue-300 pr-10" 
                        value={settlementNote} 
                        onChange={(e) => setSettlementNote(e.target.value)} 
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-blue-600 hover:text-blue-800"
                        onClick={handleTranslateNote}
                        disabled={isTranslatingNote || !settlementNote.trim()}
                        title="ترجمة / Translate"
                      >
                        {isTranslatingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button 
                      type="button" 
                      size="sm" 
                      className="w-full bg-blue-700 hover:bg-blue-800 h-10 font-bold" 
                      onClick={handleApplySettlement}
                      disabled={settlementQty <= 0}
                    >
                      تطبيق التسوية الآن / Apply Settlement Now
                    </Button>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-2 italic text-center">
                    * سيتم إضافة هذا الفرق إلى إجمالي سجل التسويات لضمان دقة التقارير التاريخية.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 opacity-80">
                <Label htmlFor="inventoryCount" className="text-muted-foreground"><DualText k="products.form.inventory" /></Label>
                <Input
                  id="inventoryCount"
                  type="number"
                  step="any"
                  value={formData.inventoryCount}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed font-mono text-xs h-8"
                  required
                />
              </div>
              <div className="space-y-2 opacity-80">
                <Label htmlFor="lastAdjustmentNote" className="text-muted-foreground">آخر ملاحظة تسوية / Last Adj Note</Label>
                <Input
                  id="lastAdjustmentNote"
                  value={formData.lastAdjustmentNote || "-"}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed text-xs h-8 italic"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minStockLimit"><DualText k="products.form.minStock" /></Label>
                <Input
                  id="minStockLimit"
                  type="number"
                  value={formData.minStockLimit || 10}
                  onChange={(e) => handleChange("minStockLimit", Number(e.target.value))}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lowStockThresholdPercentage"><DualText k="products.form.minStockPct" /></Label>
                <Input
                  id="lowStockThresholdPercentage"
                  type="number"
                  step="0.01"
                  value={formData.lowStockThresholdPercentage ?? 33.33}
                  onChange={(e) => handleChange("lowStockThresholdPercentage", Number(e.target.value))}
                  placeholder="33.33"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <DualText k="common.cancel" />
            </Button>
            <Button type="submit" disabled={isUploading || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="ml-2">
                    <DualText k="common.saving" />
                  </span>
                </>
              ) : isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="ml-2">
                    <DualText k="productForm.uploading" />
                  </span>
                </>
              ) : (
                product ? <DualText k="common.saveChanges" /> : <DualText k="common.addProduct" />
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
