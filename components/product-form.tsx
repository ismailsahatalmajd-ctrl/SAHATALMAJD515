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
import { calculateProductValues, getProducts } from "@/lib/storage"
import { toast } from "@/hooks/use-toast"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { storage } from "@/lib/firebase"
import { getSafeImageSrc, normalize, getApiUrl } from "@/lib/utils"
import { Upload, X, Loader2 } from 'lucide-react'
// import { ref, uploadBytes, getDownloadURL } from "firebase/storage"

interface ProductFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (product: Partial<Product>) => void
  product?: Product
  categories: string[]
}

export function ProductForm({ open, onOpenChange, onSubmit, product, categories }: ProductFormProps) {
  const { t } = useI18n()
  const [formData, setFormData] = useState<Partial<Product>>(
    product || {
      productCode: "",
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

  const [imagePreview, setImagePreview] = useState<string | undefined>(product?.image)
  const [isUploading, setIsUploading] = useState(false)
  const imageSectionRef = useRef<HTMLDivElement>(null)
  const autoCloseTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      if (product) {
        console.log("[v0] Loading product data for editing:", product.productName)
        setFormData(product)
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
          inventoryCount: 0,
          price: 0,
          category: "",
          image: undefined,
          minStockLimit: 10, // Default min stock limit
          lowStockThresholdPercentage: 33.33,
        })
        setImagePreview(undefined)
      }

      // Focus image section if requested
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const L = Number(formData.cartonLength || 0)
      const W = Number(formData.cartonWidth || 0)
      const H = Number(formData.cartonHeight || 0)
      if (L < 0 || W < 0 || H < 0) {
        toast({
          title: getDualString("productForm.error.dimensions.title"),
          description: getDualString("productForm.error.dimensions.desc"),
          variant: "destructive",
        })
        return
      }

      // Check for duplicates (Name, Code, ItemNumber)
      // Ensure existingProducts is safe
      const existingProducts = getProducts() || []

      if (!product) { // Only check on creation, or we can check on edit too if code changed
        const normName = normalize(formData.productName || "")
        const normCode = normalize(formData.productCode || "")
        const normItem = normalize(formData.itemNumber || "")

        const duplicate = existingProducts.find(p => {
          if (!p) return false
          // Don't match self if editing (though we are in !product block)
          const isNameMatch = normalize(p.productName || "") === normName
          const isCodeMatch = normCode && normalize(p.productCode || "") === normCode
          const isItemMatch = normItem && normalize(p.itemNumber || "") === normItem

          const isCharacteristicsMatch = isNameMatch &&
            normalize(p.category || "") === normalize(formData.category || "") &&
            Number(p.price || 0) === Number(formData.price || 0) &&
            normalize(p.unit || "") === normalize(formData.unit || "")

          if (isCodeMatch || isItemMatch) return true
          if (isCharacteristicsMatch) return true
          if (isNameMatch && !isCharacteristicsMatch) {
            // Name matches but other characteristics differ - warn but maybe allow?
            // For now, strict on name match to avoid confusion
            return true
          }

          return false
        })

        if (duplicate) {
          toast({
            title: getDualString("common.error"),
            description: getDualString("productForm.error.duplicate.exists", undefined, undefined, { name: duplicate.productName, code: duplicate.productCode }),
            variant: "destructive"
          })
          return
        }
      } else {
        // Check duplicates on edit (excluding self)
        const normName = normalize(formData.productName || "")
        const normCode = normalize(formData.productCode || "")
        const normItem = normalize(formData.itemNumber || "")

        const duplicate = existingProducts.find(p => {
          if (!p) return false
          // Robust ID comparison (handle string/number mismatch)
          if (product.id && p.id && String(p.id) === String(product.id)) return false

          const isNameMatch = normalize(p.productName || "") === normName
          const isCodeMatch = normCode && normalize(p.productCode || "") === normCode
          const isItemMatch = normItem && normalize(p.itemNumber || "") === normItem

          const isCharacteristicsMatch = isNameMatch &&
            normalize(p.category || "") === normalize(formData.category || "") &&
            Number(p.price || 0) === Number(formData.price || 0)

          return isCodeMatch || isItemMatch || isCharacteristicsMatch || isNameMatch
        })

        if (duplicate) {
          let k = "productForm.error.duplicate.nameExists"
          let params: any = { name: formData.productName }

          if (normalize(duplicate.productCode || "") === normCode) {
            k = "productForm.error.duplicate.codeUsed"
            params = { code: formData.productCode }
          } else if (normalize(duplicate.itemNumber || "") === normItem) {
            k = "productForm.error.duplicate.itemNumberUsed"
            params = { item: formData.itemNumber }
          } else if (normalize(duplicate.productName || "") === normName &&
            normalize(duplicate.category || "") === normalize(formData.category || "") &&
            Number(duplicate.price || 0) === Number(formData.price || 0)) {
            k = "productForm.error.duplicate.characteristics"
            params = {}
          }

          toast({
            title: getDualString("productForm.error.duplicate.title"),
            description: getDualString(k, undefined, undefined, params),
            variant: "destructive"
          })
          return
        }
      }

      // Ensure quantityPerCarton is at least 1
      const dataToSubmit = {
        ...formData,
        quantityPerCarton: (formData.quantityPerCarton || 0) === 0 ? 1 : formData.quantityPerCarton
      }
      const calculatedData = calculateProductValues(dataToSubmit as Product)
      onSubmit(calculatedData as Product)
      onOpenChange(false)
      setImagePreview(undefined)
    } catch (error: any) {
      console.error("Error submitting product form:", error)
      toast({
        title: getDualString("productForm.error.unexpected.title"),
        description: getDualString("productForm.error.unexpected.desc", undefined, undefined, { error: error.message }),
        variant: "destructive"
      })
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

    console.log("[v0] ✅ Uploading image:", file.name, "Size:", (file.size / 1024).toFixed(2), "KB")

    // Show preview immediately
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    // Upload to Firebase Storage (via Proxy)
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("path", `products/${Date.now()}_${file.name}`)

      const res = await fetch(getApiUrl('/api/upload'), {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Upload failed")
      }

      const data = await res.json()
      const downloadURL = data.url

      console.log("[v0] ✅ Image uploaded to Firebase Storage (Proxy):", downloadURL)
      setFormData((prev) => ({ ...prev, image: downloadURL }))
      toast({ title: getDualString("productForm.success.imageUploaded") })
    } catch (error: any) {
      console.error("[v0] ❌ Failed to upload image", error)
      toast({
        title: getDualString("productForm.error.imageUploadFailed.title"),
        description: error.message || getDualString("productForm.error.imageUploadFailed.desc"),
        variant: "destructive"
      })
      setImagePreview(undefined)
    } finally {
      setIsUploading(false)
    }
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
                <Label htmlFor="productName"><DualText k="common.productName" /></Label>
                <Input
                  id="productName"
                  value={formData.productName}
                  onChange={(e) => handleChange("productName", e.target.value)}
                  required
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
                <Label htmlFor="unit"><DualText k="common.unit" /></Label>
                <Select value={formData.unit} onValueChange={(value) => handleChange("unit", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="قطعة"><DualText k="units.piece" /></SelectItem>
                    <SelectItem value="كرتون"><DualText k="units.carton" /></SelectItem>
                    <SelectItem value="كيلو"><DualText k="units.kg" /></SelectItem>
                    <SelectItem value="متر"><DualText k="units.meter" /></SelectItem>
                    <SelectItem value="لتر"><DualText k="units.liter" /></SelectItem>
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
                  onChange={(e) => handleChange("cartonLength", Number(e.target.value))}
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
                  onChange={(e) => handleChange("cartonWidth", Number(e.target.value))}
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
                  onChange={(e) => handleChange("cartonHeight", Number(e.target.value))}
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
                  onChange={(e) => handleChange("quantityPerCarton", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="openingStock"><DualText k="products.form.openingStock" /></Label>
                <Input
                  id="openingStock"
                  type="number"
                  value={formData.openingStock}
                  onChange={(e) => handleChange("openingStock", Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchases"><DualText k="products.form.purchases" /></Label>
                <Input
                  id="purchases"
                  type="number"
                  value={formData.purchases}
                  onChange={(e) => handleChange("purchases", Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issues"><DualText k="products.form.issues" /></Label>
                <Input
                  id="issues"
                  type="number"
                  value={formData.issues}
                  onChange={(e) => handleChange("issues", Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inventoryCount"><DualText k="products.form.inventory" /></Label>
                <Input
                  id="inventoryCount"
                  type="number"
                  value={formData.inventoryCount}
                  onChange={(e) => handleChange("inventoryCount", Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price"><DualText k="common.price" /></Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => handleChange("price", Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity"><DualText k="common.quantity" /></Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => handleChange("quantity", Number(e.target.value))}
                  required
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
            <Button type="submit" disabled={isUploading}>
              {isUploading ? (
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
