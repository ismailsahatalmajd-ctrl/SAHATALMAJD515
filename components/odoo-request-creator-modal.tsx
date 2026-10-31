"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Loader2,
  Plus,
  Minus,
  Trash2,
  Search,
  Printer,
  CheckCircle2,
  Sparkles,
  Package,
  ShoppingCart,
  Flame,
  ArrowRightLeft,
  X,
  RefreshCcw,
  ChevronDown,
  Layers,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { db } from "@/lib/db"
import { updateProduct } from "@/lib/storage"
import { syncProduct } from "@/lib/sync-api"
import { fetchOdooApi } from "@/lib/odoo-client"
import { ProductImage } from "@/components/product-image"
import {
  generateOdooPurchaseRequestsPDF,
  type PurchaseRequestPrintItem,
} from "@/lib/odoo-purchase-request-pdf-generator"

export type OdooRequestCreateMode =
  | "shafa_transfer"
  | "roastery_transfer"
  | "purchase_request"

interface CategoryOption {
  id: number
  name: string
}

interface ReplenishmentTypeOption {
  id: number
  display_name: string
  name: string
}

interface OdooCatalogProduct {
  id: number
  name: string
  display_name: string
  default_code: string
  uom_id: [number, string] | false
  cleanEnglishName: string
}

interface CreatorLineItem {
  rowKey: string
  prGroupIndex: number
  vendorNote: string
  odooProductId: number
  productCode: string
  productName: string
  odooUnit: string
  warehouseUnit: string
  websiteProductId?: string
  originalQuantityPerCarton: number
  quantityPerCarton: number
  odooQty: number
  // Filled after saving to Odoo
  createdRequestId?: number
  createdPrNumber?: string
  createdDate?: string
  createdStatus?: string
}

function extractCleanEnglishName(rawName: string): string {
  if (!rawName) return ""
  let name = rawName.replace(/^\[.*?\]\s*/, "").trim()
  const hasLatin = /[a-zA-Z]/.test(name)
  const hasArabic = /[\u0600-\u06FF]/.test(name)
  if (hasLatin && hasArabic) {
    const stripped = name
      .replace(/[\u0600-\u06FF]+/g, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\[\s*\]/g, " ")
      .replace(/^[\s\-/|–—:]+|[\s\-/|–—:]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    if (/[a-zA-Z]{2,}/.test(stripped)) {
      name = stripped
    }
  }
  return name || rawName
}

function isBrokenCarton(qty: number, qtyPerCarton: number): boolean {
  const factor = Number(qtyPerCarton) || 1
  if (factor <= 1) return false
  if (qty <= 0) return true
  const ratio = qty / factor
  return Math.abs(ratio - Math.round(ratio)) > 0.001
}

function roundUpToFullCarton(qty: number, qtyPerCarton: number): number {
  const factor = Math.max(1, Number(qtyPerCarton) || 1)
  if (factor <= 1) return Math.max(1, Math.round(qty))
  const cartons = Math.max(1, Math.ceil(qty / factor))
  return cartons * factor
}

function CatalogProductPickerPopover({
  catalogProducts,
  catalogLoading,
  websiteProductsMap,
  onSelect,
  triggerLabel,
  triggerClassName,
  align = "start",
}: {
  catalogProducts: OdooCatalogProduct[]
  catalogLoading: boolean
  websiteProductsMap: Record<string, any>
  onSelect: (prod: OdooCatalogProduct) => void
  triggerLabel: React.ReactNode
  triggerClassName?: string
  align?: "start" | "center" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalogProducts.slice(0, 80)
    return catalogProducts
      .filter(
        (p) =>
          p.cleanEnglishName.toLowerCase().includes(q) ||
          (p.default_code && String(p.default_code).toLowerCase().includes(q)) ||
          p.display_name.toLowerCase().includes(q)
      )
      .slice(0, 100)
  }, [catalogProducts, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={triggerClassName}>
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="p-0 w-[500px] max-w-[92vw] shadow-xl border-slate-300 z-50"
      >
        <div className="flex flex-col max-h-[340px]" dir="ltr">
          <div className="p-2 border-b bg-slate-50 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search English product name or code..."
              className="w-full text-xs bg-white border rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div
            className="overflow-y-auto flex-1 divide-y divide-slate-100"
            onWheel={(e) => e.stopPropagation()}
          >
            {catalogLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Loading Odoo products...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No matching products found
              </div>
            ) : (
              filtered.map((prod) => {
                const code = prod.default_code ? String(prod.default_code).trim() : ""
                const wp =
                  (code &&
                    (websiteProductsMap[code] ||
                      websiteProductsMap[code.toLowerCase()])) ||
                  undefined
                const cartonSize = Math.max(1, Number(wp?.quantityPerCarton) || 1)
                const uomName = Array.isArray(prod.uom_id) ? prod.uom_id[1] : "Units"

                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => {
                      onSelect(prod)
                      setOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2.5"
                  >
                    <div className="h-9 w-9 flex-shrink-0">
                      <ProductImage
                        product={wp || { id: `odoo-cat-${code || prod.id}` }}
                        className="h-9 w-9 rounded object-cover border bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-900 whitespace-normal break-words leading-snug">
                        {prod.cleanEnglishName}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        {code && (
                          <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-slate-700 font-semibold">
                            [{code}]
                          </span>
                        )}
                        <span>UoM: {uomName}</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 flex-shrink-0"
                    >
                      Carton: {cartonSize}
                    </Badge>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface OdooRequestCreatorModalProps {
  isOpen: boolean
  onClose: () => void
  mode: OdooRequestCreateMode
  categories: CategoryOption[]
  replenishmentTypes: ReplenishmentTypeOption[]
  onSuccess: () => void
}

export function OdooRequestCreatorModal({
  isOpen,
  onClose,
  mode,
  categories,
  replenishmentTypes,
  onSuccess,
}: OdooRequestCreatorModalProps) {
  const { toast } = useToast()

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("")
  const [selectedReplenishmentId, setSelectedReplenishmentId] = useState<string>("")
  const [lines, setLines] = useState<CreatorLineItem[]>([])
  const [nextGroupCounter, setNextGroupCounter] = useState<number>(2)

  const [catalogProducts, setCatalogProducts] = useState<OdooCatalogProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [websiteProductsMap, setWebsiteProductsMap] = useState<Record<string, any>>({})

  const [submitting, setSubmitting] = useState(false)
  const [hasSavedToOdoo, setHasSavedToOdoo] = useState(false)

  // Load website products map (for images, carton sizes, warehouse units)
  useEffect(() => {
    if (!isOpen) return
    db.products.toArray().then((all) => {
      const map: Record<string, any> = {}
      for (const wp of all) {
        if (wp.productCode) {
          const clean = String(wp.productCode).trim()
          map[clean] = wp
          map[clean.toLowerCase()] = wp
        }
      }
      setWebsiteProductsMap(map)
    })
    loadCatalog()
  }, [isOpen])

  const loadCatalog = async () => {
    if (catalogProducts.length > 0) return
    setCatalogLoading(true)
    try {
      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "GET",
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.products)) {
        const mapped: OdooCatalogProduct[] = data.products.map((p: any) => ({
          id: Number(p.id),
          name: String(p.name || ""),
          display_name: String(p.display_name || ""),
          default_code: p.default_code ? String(p.default_code).trim() : "",
          uom_id: Array.isArray(p.uom_id) ? p.uom_id : false,
          cleanEnglishName: extractCleanEnglishName(p.name || p.display_name || ""),
        }))
        setCatalogProducts(mapped)
      }
    } catch (e) {
      console.error("Failed to load Odoo catalog:", e)
    } finally {
      setCatalogLoading(false)
    }
  }

  // Auto-select Category & Replenishment Type based on mode
  useEffect(() => {
    if (!isOpen) return
    setLines([])
    setHasSavedToOdoo(false)
    setNextGroupCounter(2)

    if (mode === "roastery_transfer") {
      // Match Category: Items Resupply Request From "34000 - Al-Mahmasa (Roastery) W.H"
      const roasteryCat = categories.find(
        (c) =>
          c.name.includes("34000") ||
          c.name.toLowerCase().includes("mahmasa") ||
          c.name.toLowerCase().includes("roastery")
      )
      if (roasteryCat) setSelectedCategoryId(String(roasteryCat.id))

      // Match Replenishment Type: 34000 - Al-Mahmasa (Roastery) W.H: From MHMSA To MRSHF
      const roasteryRep =
        replenishmentTypes.find(
          (r) =>
            r.display_name.includes("34000") &&
            r.display_name.toUpperCase().includes("TO MRSHF")
        ) ||
        replenishmentTypes.find(
          (r) =>
            r.display_name.includes("34000") ||
            r.display_name.toUpperCase().includes("MHMSA")
        )
      if (roasteryRep) setSelectedReplenishmentId(String(roasteryRep.id))
    } else if (mode === "purchase_request") {
      // Match Category: Purchase Request Approval
      const prCat = categories.find(
        (c) =>
          c.name.toLowerCase().includes("purchase request") ||
          c.name.toLowerCase().includes("purchase")
      )
      if (prCat) setSelectedCategoryId(String(prCat.id))
      setSelectedReplenishmentId("")
    } else {
      // Shafa Internal Transfer
      const shafaCat = categories.find(
        (c) =>
          c.name.includes("01000") ||
          c.name.toLowerCase().includes("shafa") ||
          c.name.toLowerCase().includes("raw materials")
      )
      setSelectedCategoryId(shafaCat ? String(shafaCat.id) : "")
      setSelectedReplenishmentId("")
    }
  }, [isOpen, mode, categories, replenishmentTypes])

  // Add a product row (either in a new PR group or in a specified existing PR group)
  const handleAddProductLine = (
    prod: OdooCatalogProduct,
    targetGroupIndex?: number,
    existingVendorNote?: string
  ) => {
    const code = prod.default_code ? String(prod.default_code).trim() : ""
    const wp =
      (code &&
        (websiteProductsMap[code] || websiteProductsMap[code.toLowerCase()])) ||
      undefined
    const factor = Math.max(1, Number(wp?.quantityPerCarton) || 1)
    const uomName = Array.isArray(prod.uom_id) ? prod.uom_id[1] : "Units"

    let groupIdx = targetGroupIndex
    if (groupIdx === undefined) {
      if (lines.length === 0) {
        groupIdx = 1
        setNextGroupCounter(2)
      } else {
        groupIdx = nextGroupCounter
        setNextGroupCounter((prev) => prev + 1)
      }
    }

    const newItem: CreatorLineItem = {
      rowKey: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      prGroupIndex: groupIdx,
      vendorNote: existingVendorNote || "",
      odooProductId: prod.id,
      productCode: code,
      productName: prod.cleanEnglishName,
      odooUnit: uomName,
      warehouseUnit: wp?.unit || "Carton",
      websiteProductId: wp?.id,
      originalQuantityPerCarton: factor,
      quantityPerCarton: factor,
      odooQty: factor, // Default to 1 full carton
    }

    setLines((prev) => [...prev, newItem])
    setHasSavedToOdoo(false)
  }

  const handleReplaceRowProduct = (rowKey: string, prod: OdooCatalogProduct) => {
    const code = prod.default_code ? String(prod.default_code).trim() : ""
    const wp =
      (code &&
        (websiteProductsMap[code] || websiteProductsMap[code.toLowerCase()])) ||
      undefined
    const factor = Math.max(1, Number(wp?.quantityPerCarton) || 1)
    const uomName = Array.isArray(prod.uom_id) ? prod.uom_id[1] : "Units"

    setLines((prev) =>
      prev.map((item) => {
        if (item.rowKey !== rowKey) return item
        const cartons = Math.max(
          1,
          Math.round(item.odooQty / Math.max(1, item.quantityPerCarton))
        )
        return {
          ...item,
          odooProductId: prod.id,
          productCode: code,
          productName: prod.cleanEnglishName,
          odooUnit: uomName,
          warehouseUnit: wp?.unit || "Carton",
          websiteProductId: wp?.id,
          originalQuantityPerCarton: factor,
          quantityPerCarton: factor,
          odooQty: cartons * factor,
          createdPrNumber: undefined,
        }
      })
    )
    setHasSavedToOdoo(false)
  }

  const handleUpdateRowCartonSize = (rowKey: string, productCode: string, newFactor: number) => {
    const factor = Math.max(1, Number(newFactor) || 1)
    setLines((prev) =>
      prev.map((item) => {
        const isMatch = productCode
          ? item.productCode === productCode
          : item.rowKey === rowKey
        if (!isMatch) return item
        const cartons = Math.max(
          1,
          Math.round(item.odooQty / Math.max(1, item.quantityPerCarton))
        )
        return {
          ...item,
          quantityPerCarton: factor,
          odooQty: cartons * factor,
          createdPrNumber: undefined,
        }
      })
    )
    setHasSavedToOdoo(false)
  }

  const handleUpdateRowCartons = (rowKey: string, cartons: number) => {
    const safeCartons = Math.max(0, Number(cartons) || 0)
    setLines((prev) =>
      prev.map((item) => {
        if (item.rowKey !== rowKey) return item
        const factor = Math.max(1, Number(item.quantityPerCarton) || 1)
        return {
          ...item,
          odooQty: Number((safeCartons * factor).toFixed(2)),
          createdPrNumber: undefined,
        }
      })
    )
    setHasSavedToOdoo(false)
  }

  const handleUpdateRowOdooQty = (rowKey: string, qty: number) => {
    const safeQty = Math.max(0, Number(qty) || 0)
    setLines((prev) =>
      prev.map((item) =>
        item.rowKey === rowKey
          ? { ...item, odooQty: safeQty, createdPrNumber: undefined }
          : item
      )
    )
    setHasSavedToOdoo(false)
  }

  const handleUpdateRowGroup = (rowKey: string, newGroupIndex: number) => {
    setLines((prev) => {
      const existingNote =
        prev.find((x) => x.prGroupIndex === newGroupIndex)?.vendorNote || ""
      return prev.map((item) =>
        item.rowKey === rowKey
          ? {
              ...item,
              prGroupIndex: newGroupIndex,
              vendorNote: existingNote || item.vendorNote,
              createdPrNumber: undefined,
            }
          : item
      )
    })
    setHasSavedToOdoo(false)
  }

  const handleUpdateGroupVendorNote = (groupIndex: number, note: string) => {
    setLines((prev) =>
      prev.map((item) =>
        item.prGroupIndex === groupIndex ? { ...item, vendorNote: note } : item
      )
    )
  }

  const handleRemoveRow = (rowKey: string) => {
    setLines((prev) => prev.filter((item) => item.rowKey !== rowKey))
  }

  // Put every product in its own separate PR group with 1 click
  const handleSplitAllToSeparatePRs = () => {
    setLines((prev) =>
      prev.map((item, idx) => ({
        ...item,
        prGroupIndex: idx + 1,
        createdPrNumber: undefined,
      }))
    )
    setNextGroupCounter(lines.length + 1)
    setHasSavedToOdoo(false)
  }

  // Merge all products into a single PR group (same vendor) with 1 click
  const handleMergeAllIntoSinglePR = () => {
    setLines((prev) =>
      prev.map((item) => ({
        ...item,
        prGroupIndex: 1,
        createdPrNumber: undefined,
      }))
    )
    setHasSavedToOdoo(false)
  }

  const syncModifiedCartonSizes = async () => {
    const seen = new Set<string>()
    for (const item of lines) {
      if (
        item.websiteProductId &&
        item.quantityPerCarton !== item.originalQuantityPerCarton &&
        !seen.has(item.websiteProductId)
      ) {
        seen.add(item.websiteProductId)
        try {
          const updated = await updateProduct(item.websiteProductId, {
            quantityPerCarton: item.quantityPerCarton,
          })
          if (updated) syncProduct(updated).catch(console.error)
        } catch (e) {}
      }
    }
  }

  const handleSubmitRequests = async (autoConfirm: boolean) => {
    if (!selectedCategoryId) {
      toast({
        title: "اختر الفئة / Select Category",
        description: "يرجى التأكد من اختيار الفئة أولاً.",
        variant: "destructive",
      })
      return
    }
    if (mode !== "purchase_request" && !selectedReplenishmentId) {
      toast({
        title: "اختر نوع التحويل / Select Replenishment Type",
        description: "يرجى اختيار نوع التحويل (المستودع / الفرع).",
        variant: "destructive",
      })
      return
    }
    if (lines.length === 0) {
      toast({
        title: "أضف منتجاً واحداً على الأقل / Add Products",
        description: "يرجى إضافة منتج واحد على الأقل إلى القائمة.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      await syncModifiedCartonSizes()

      if (mode === "purchase_request") {
        // Group lines by prGroupIndex so each group creates 1 PR in Odoo
        const groupsMap = new Map<number, CreatorLineItem[]>()
        for (const item of lines) {
          const arr = groupsMap.get(item.prGroupIndex) || []
          arr.push(item)
          groupsMap.set(item.prGroupIndex, arr)
        }

        const batchRequests = Array.from(groupsMap.entries()).map(
          ([groupIdx, groupItems]) => ({
            groupKey: String(groupIdx),
            vendorNote: groupItems[0]?.vendorNote || "",
            categoryId: parseInt(selectedCategoryId),
            autoConfirm,
            lines: groupItems.map((gi) => ({
              productId: gi.odooProductId,
              quantity: gi.odooQty,
            })),
          })
        )

        const res = await fetchOdooApi("/api/odoo/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchRequests }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || "فشل إنشاء طلبات المشتريات في أودو")
        }

        const createdMap = new Map<
          string,
          { id: number; name: string; date: string; create_date: string; request_status: string }
        >()
        for (const cr of data.createdRequests || []) {
          createdMap.set(String(cr.groupKey), cr)
        }

        setLines((prev) =>
          prev.map((item) => {
            const cr = createdMap.get(String(item.prGroupIndex))
            if (!cr) return item
            const formattedDate = (cr.date || cr.create_date)
              ? new Date(cr.date || cr.create_date).toLocaleString("en-GB")
              : new Date().toLocaleString("en-GB")
            return {
              ...item,
              createdRequestId: cr.id,
              createdPrNumber: cr.name || `PR#${cr.id}`,
              createdDate: formattedDate,
              createdStatus: cr.request_status,
            }
          })
        )

        setHasSavedToOdoo(true)
        onSuccess()
        toast({
          title: "تم إصدار طلبات المشتريات بنجاح / PRs Created",
          description: `تم إنشاء ${batchRequests.length} طلب شراء (PR) لإجمالي ${lines.length} منتج في أودو! يمكنك الآن طباعتها PDF.`,
        })
      } else {
        // Mode 1 (Shafa) or Mode 2 (Roastery): Single Transfer Request
        const res = await fetchOdooApi("/api/odoo/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: parseInt(selectedCategoryId),
            replenishmentTypeId: parseInt(selectedReplenishmentId),
            autoConfirm,
            lines: lines.map((l) => ({
              productId: l.odooProductId,
              quantity: l.odooQty,
            })),
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || "فشل إنشاء طلب التحويل في أودو")
        }

        toast({
          title: "تم حفظ طلب التحويل بنجاح / Transfer Created",
          description: `رقم الطلب في أودو: ${data.name || `#${data.id}`}`,
        })
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      toast({
        title: "خطأ في الحفظ / Save Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrintPurchaseRequestsPDF = async () => {
    if (lines.length === 0) return
    const nowStr = new Date().toLocaleString("en-GB")
    const sorted = [...lines].sort((a, b) => a.prGroupIndex - b.prGroupIndex)
    const printItems: PurchaseRequestPrintItem[] = sorted.map((item) => ({
      prNumber: item.createdPrNumber || `PR-Group #${item.prGroupIndex} (Draft)`,
      requestDate: item.createdDate || nowStr,
      requestStatus: item.createdStatus || "new",
      vendorNote: item.vendorNote,
      productCode: item.productCode,
      productName: item.productName,
      odooQty: item.odooQty,
      odooUnit: item.odooUnit,
      quantityPerCarton: item.quantityPerCarton,
      warehouseQty: Number(
        (item.odooQty / Math.max(1, item.quantityPerCarton)).toFixed(2)
      ),
      warehouseUnit: item.warehouseUnit,
    }))

    await generateOdooPurchaseRequestsPDF(
      printItems,
      "PR Report"
    )
  }

  // Group numbers available for PR assignment
  const availableGroupIndices = useMemo(() => {
    const existing = Array.from(new Set(lines.map((l) => l.prGroupIndex))).sort(
      (a, b) => a - b
    )
    const maxIdx = existing.length > 0 ? Math.max(...existing) : 0
    return Array.from(new Set([...existing, maxIdx + 1]))
  }, [lines])

  // Sort lines by prGroupIndex in purchase_request mode
  const displayedLines = useMemo(() => {
    if (mode !== "purchase_request") return lines
    return [...lines].sort((a, b) => a.prGroupIndex - b.prGroupIndex)
  }, [lines, mode])

  const distinctPrGroupsCount = useMemo(
    () => new Set(lines.map((l) => l.prGroupIndex)).size,
    [lines]
  )

  const brokenCount = useMemo(
    () =>
      lines.filter((l) => isBrokenCarton(l.odooQty, l.quantityPerCarton)).length,
    [lines]
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[96vw] md:max-w-7xl w-full max-h-[93vh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        <DialogHeader className="border-b pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              {mode === "purchase_request" ? (
                <>
                  <ShoppingCart className="h-5 w-5 text-purple-600" />
                  <span>
                    إنشاء طلبات مشتريات (PR) / Create Purchase Requests (Purchase Request Approval)
                  </span>
                </>
              ) : mode === "roastery_transfer" ? (
                <>
                  <Flame className="h-5 w-5 text-amber-600" />
                  <span>
                    طلب تحويل من المحمصة / Roastery Resupply Request (34000 - Al-Mahmasa)
                  </span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                  <span>
                    إنشاء تحويل داخلي جديد (الشفا) / New Internal Transfer (01000 - Shafa)
                  </span>
                </>
              )}
            </DialogTitle>

            <div className="flex items-center gap-2 flex-wrap">
              {mode === "purchase_request" && (
                <Badge className="bg-purple-100 text-purple-900 border-purple-300 text-xs px-2.5 py-0.5">
                  عدد أرقام الـ PR المستقلة: <strong className="mx-1">{distinctPrGroupsCount}</strong>
                  (لإجمالي {lines.length} منتج)
                </Badge>
              )}
              <Badge variant="outline" className="bg-slate-50 text-xs px-2.5 py-0.5">
                إجمالي الأصناف / Items: <strong className="mr-1">{lines.length}</strong>
              </Badge>
              {brokenCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    setLines((prev) =>
                      prev.map((l) => ({
                        ...l,
                        odooQty: roundUpToFullCarton(l.odooQty, l.quantityPerCarton),
                      }))
                    )
                  }
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>تصحيح كسور الكرتون تلقائياً ({brokenCount}) / Fix Broken</span>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Top Configuration Bar based on Mode */}
        <div className="bg-slate-50 border rounded-lg p-3 space-y-2.5 my-1">
          {mode === "roastery_transfer" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-amber-50/80 border border-amber-200 rounded-md p-2.5 flex flex-col gap-1">
                <span className="text-amber-800 font-bold">
                  الفئة (Category) — مثبتة تلقائياً:
                </span>
                <span dir="ltr" className="font-mono font-bold text-slate-900 text-left">
                  Items Resupply Request From &quot;34000 - Al-Mahmasa (Roastery) W.H&quot;
                </span>
              </div>
              <div className="bg-amber-50/80 border border-amber-200 rounded-md p-2.5 flex flex-col gap-1">
                <span className="text-amber-800 font-bold">
                  نوع التحويل (Replenishment Type) — مثبت تلقائياً:
                </span>
                <span dir="ltr" className="font-mono font-bold text-slate-900 text-left">
                  34000 - Al-Mahmasa (Roastery) W.H: From MHMSA To MRSHF
                </span>
              </div>
            </div>
          ) : mode === "purchase_request" ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-purple-600 text-white px-2.5 py-1 text-xs">
                  الفئة: Purchase Request Approval (طلب موافقة شراء)
                </Badge>
                <span className="text-slate-600 font-medium">
                  💡 يمكنك جعل كل منتج في رقم <strong>PR مستقل</strong>، أو جمع منتجين أو أكثر لنفس المورد في <strong>PR واحد</strong>.
                </span>
              </div>
              {lines.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSplitAllToSeparatePRs}
                    className="h-7 text-[11px] font-bold bg-white border-purple-300 text-purple-800 hover:bg-purple-50"
                  >
                    فصل كل منتج في PR مستقل / 1 PR per Item
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMergeAllIntoSinglePR}
                    className="h-7 text-[11px] font-bold bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    دمج الكل في PR واحد / Merge All in 1 PR
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  الفئة (Category):
                </label>
                <select
                  className="w-full p-2 border rounded-md text-xs font-semibold bg-white"
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                >
                  <option value="">اختر الفئة...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  نوع التحويل / الفرع المستلم (Replenishment Type):
                </label>
                <select
                  className="w-full p-2 border rounded-md text-xs font-semibold bg-white"
                  value={selectedReplenishmentId}
                  onChange={(e) => setSelectedReplenishmentId(e.target.value)}
                >
                  <option value="">اختر نوع التحويل / الفرع...</option>
                  {replenishmentTypes.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Quick Add Product Bar */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CatalogProductPickerPopover
                catalogProducts={catalogProducts}
                catalogLoading={catalogLoading}
                websiteProductsMap={websiteProductsMap}
                onSelect={(prod) => handleAddProductLine(prod)}
                triggerClassName="h-9 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors"
                triggerLabel={
                  <>
                    <Plus className="h-4 w-4" />
                    <span>
                      {mode === "purchase_request"
                        ? "+ إضافة منتج (في طلب PR جديد مستقل) / Add Product (New PR)"
                        : "+ بحث وإضافة منتج للقائمة / Search & Add Product"}
                    </span>
                  </>
                }
              />
            </div>

            {hasSavedToOdoo && mode === "purchase_request" && (
              <Button
                type="button"
                onClick={handlePrintPurchaseRequestsPDF}
                className="h-9 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs gap-2 shadow-sm"
              >
                <Printer className="h-4 w-4" />
                <span>
                  طباعة كشف طلبات الشراء (PDF مع أرقام الـ PR والتاريخ والصور) / Print PRs PDF
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Main Products Table */}
        <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-[300px] relative">
          {displayedLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Package className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">
                لم تتم إضافة منتجات بعد — اضغط على زر &quot;+ إضافة منتج&quot; أعلاه للبدء.
              </p>
            </div>
          ) : (
            <table className="w-full caption-bottom text-sm border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                <tr className="border-b">
                  {mode === "purchase_request" && (
                    <th className="sticky top-0 z-20 bg-purple-50 text-right font-bold text-purple-900 p-2.5 w-60">
                      رقم طلب الشراء (PR) / المورد
                      <br />
                      <span className="text-[10px] font-normal text-purple-700">
                        PR Group, Generated PR# & Vendor
                      </span>
                    </th>
                  )}
                  <th className="sticky top-0 z-20 bg-slate-100 text-right font-bold text-slate-700 p-2.5 min-w-[260px]">
                    المنتج (الاسم الإنجليزي الكامل والصورة)
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Full English Product Name & Image
                    </span>
                  </th>
                  <th className="sticky top-0 z-20 bg-slate-100 text-center font-bold text-slate-700 p-2.5 w-28">
                    شد الكرتون
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Carton Size
                    </span>
                  </th>
                  <th className="sticky top-0 z-20 bg-blue-50 text-center font-bold text-blue-800 p-2.5 w-44">
                    الكمية بوحدة المستودع
                    <br />
                    <span className="text-[10px] font-normal text-blue-600">
                      Warehouse Qty (Cartons)
                    </span>
                  </th>
                  <th className="sticky top-0 z-20 bg-emerald-50 text-center font-bold text-emerald-800 p-2.5 w-40">
                    الكمية بوحدة أودو
                    <br />
                    <span className="text-[10px] font-normal text-emerald-600">
                      Odoo Qty & Unit
                    </span>
                  </th>
                  <th className="sticky top-0 z-20 bg-slate-100 text-center font-bold text-slate-700 p-2.5 w-20">
                    حذف
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Remove
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedLines.map((item, idx) => {
                  const prev = idx > 0 ? displayedLines[idx - 1] : null
                  const isFirstInPrGroup =
                    !prev || prev.prGroupIndex !== item.prGroupIndex
                  const groupItemsCount = displayedLines.filter(
                    (x) => x.prGroupIndex === item.prGroupIndex
                  ).length

                  const wp =
                    (item.productCode &&
                      (websiteProductsMap[item.productCode] ||
                        websiteProductsMap[item.productCode.toLowerCase()])) ||
                    undefined

                  const cartons =
                    item.quantityPerCarton > 0
                      ? Number(
                          (item.odooQty / item.quantityPerCarton).toFixed(2)
                        )
                      : item.odooQty
                  const broken = isBrokenCarton(
                    item.odooQty,
                    item.quantityPerCarton
                  )

                  return (
                    <tr
                      key={item.rowKey}
                      className={`${
                        isFirstInPrGroup && mode === "purchase_request"
                          ? "border-t-2 border-purple-200"
                          : ""
                      } ${
                        item.createdPrNumber
                          ? "bg-emerald-50/30"
                          : broken
                          ? "bg-red-50/30"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* PR Group & Vendor Column (Purchase Request Mode Only) */}
                      {mode === "purchase_request" && (
                        <td className="p-2.5 align-top bg-purple-50/20 border-l border-purple-100">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-1">
                              <select
                                value={item.prGroupIndex}
                                onChange={(e) =>
                                  handleUpdateRowGroup(
                                    item.rowKey,
                                    Number(e.target.value)
                                  )
                                }
                                className="text-xs font-bold bg-white border border-purple-300 text-purple-900 rounded px-2 py-1"
                              >
                                {availableGroupIndices.map((gIdx) => (
                                  <option key={gIdx} value={gIdx}>
                                    طلب PR مستقل #{gIdx} (مورد #{gIdx})
                                  </option>
                                ))}
                              </select>

                              {groupItemsCount > 1 && (
                                <Badge className="bg-purple-600 text-white text-[10px]">
                                  {groupItemsCount} منتجات معاً
                                </Badge>
                              )}
                            </div>

                            {/* Official Generated PR Number & Date after Save */}
                            {item.createdPrNumber && (
                              <div className="bg-emerald-100 border border-emerald-300 rounded px-2 py-1 flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-emerald-900">
                                    رقم الطلب:
                                  </span>
                                  <span className="font-mono font-extrabold text-xs text-emerald-950">
                                    {item.createdPrNumber}
                                  </span>
                                </div>
                                <span
                                  dir="ltr"
                                  className="text-[10px] font-mono text-emerald-800 text-left"
                                >
                                  {item.createdDate}
                                </span>
                              </div>
                            )}

                            {/* Optional Vendor / Note Input & "+ Add Another Product to Same PR" */}
                            {isFirstInPrGroup && (
                              <>
                                <Input
                                  placeholder="اسم المورد / ملاحظة (اختياري)..."
                                  value={item.vendorNote}
                                  onChange={(e) =>
                                    handleUpdateGroupVendorNote(
                                      item.prGroupIndex,
                                      e.target.value
                                    )
                                  }
                                  className="h-7 text-[11px] bg-white"
                                />
                                <CatalogProductPickerPopover
                                  catalogProducts={catalogProducts}
                                  catalogLoading={catalogLoading}
                                  websiteProductsMap={websiteProductsMap}
                                  onSelect={(prod) =>
                                    handleAddProductLine(
                                      prod,
                                      item.prGroupIndex,
                                      item.vendorNote
                                    )
                                  }
                                  triggerClassName="w-full py-1 px-2 rounded border border-dashed border-purple-400 text-purple-800 bg-purple-50/60 hover:bg-purple-100 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                                  triggerLabel={
                                    <>
                                      <Layers className="h-3 w-3" />
                                      <span>
                                        + منتج آخر لنفس هذا المورد (نفس الـ PR #{item.prGroupIndex})
                                      </span>
                                    </>
                                  }
                                />
                              </>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Product Info (Image + Full English Name + Code + Replace) */}
                      <td className="p-2.5 align-top">
                        <div className="flex items-start gap-2.5">
                          <div className="h-10 w-10 flex-shrink-0">
                            <ProductImage
                              product={
                                wp || {
                                  id: `odoo-${item.productCode || item.odooProductId}`,
                                }
                              }
                              className="h-10 w-10 rounded object-cover border bg-white"
                            />
                          </div>
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div
                              dir="ltr"
                              className="text-sm font-bold text-slate-900 whitespace-normal break-words text-left leading-snug"
                            >
                              {item.productName}
                            </div>
                            <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500">
                              {item.productCode && (
                                <span className="font-mono bg-slate-100 px-1.5 rounded text-slate-700 font-semibold">
                                  [{item.productCode}]
                                </span>
                              )}
                              <span>Odoo UoM: {item.odooUnit}</span>
                              <span>| WH Unit: {item.warehouseUnit}</span>

                              <CatalogProductPickerPopover
                                catalogProducts={catalogProducts}
                                catalogLoading={catalogLoading}
                                websiteProductsMap={websiteProductsMap}
                                onSelect={(newProd) =>
                                  handleReplaceRowProduct(item.rowKey, newProd)
                                }
                                triggerClassName="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded"
                                triggerLabel={
                                  <>
                                    <RefreshCcw className="h-2.5 w-2.5" />
                                    <span>تغيير المنتج / Change</span>
                                    <ChevronDown className="h-2.5 w-2.5" />
                                  </>
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Carton Size */}
                      <td className="p-2.5 text-center align-middle">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantityPerCarton}
                          onChange={(e) =>
                            handleUpdateRowCartonSize(
                              item.rowKey,
                              item.productCode,
                              parseFloat(e.target.value)
                            )
                          }
                          className="w-20 h-8 mx-auto text-center font-bold text-xs bg-white"
                        />
                      </td>

                      {/* Warehouse Quantity (Cartons + / -) */}
                      <td className="p-2.5 text-center align-middle bg-blue-50/30">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 bg-white"
                            onClick={() =>
                              handleUpdateRowCartons(
                                item.rowKey,
                                Math.max(1, Math.floor(cartons) - 1)
                              )
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={0.1}
                            step="1"
                            value={cartons}
                            onChange={(e) =>
                              handleUpdateRowCartons(
                                item.rowKey,
                                parseFloat(e.target.value)
                              )
                            }
                            className={`w-16 h-8 text-center font-bold text-xs bg-white ${
                              !Number.isInteger(cartons)
                                ? "border-red-400 text-red-700"
                                : "border-blue-300 text-blue-800"
                            }`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 bg-white"
                            onClick={() =>
                              handleUpdateRowCartons(
                                item.rowKey,
                                Math.floor(cartons) + 1
                              )
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="text-[10px] text-blue-700 font-semibold block mt-0.5">
                          {item.warehouseUnit}
                        </span>
                      </td>

                      {/* Odoo Quantity (Pieces / Base Unit) */}
                      <td className="p-2.5 text-center align-middle bg-emerald-50/30">
                        <div className="flex flex-col items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            value={item.odooQty}
                            onChange={(e) =>
                              handleUpdateRowOdooQty(
                                item.rowKey,
                                parseFloat(e.target.value)
                              )
                            }
                            className="w-24 h-8 text-center font-bold text-sm bg-white border-emerald-400 text-emerald-900"
                          />
                          <span className="text-[10px] text-emerald-700 font-semibold">
                            {item.odooUnit}
                          </span>
                          {broken && item.quantityPerCarton > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRowOdooQty(
                                  item.rowKey,
                                  roundUpToFullCarton(
                                    item.odooQty,
                                    item.quantityPerCarton
                                  )
                                )
                              }
                              className="text-[10px] text-red-600 underline font-bold"
                            >
                              تصحيح إلى{" "}
                              {roundUpToFullCarton(
                                item.odooQty,
                                item.quantityPerCarton
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Remove Row */}
                      <td className="p-2.5 text-center align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRow(item.rowKey)}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 w-full"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            {mode === "purchase_request" && lines.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrintPurchaseRequestsPDF}
                className="gap-2 border-purple-400 text-purple-800 hover:bg-purple-50 font-bold text-xs"
              >
                <Printer className="h-4 w-4" />
                <span>
                  طباعة الطلبات PDF (مع الـ PR والتاريخ والصورة) / Print PRs PDF
                </span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              إغلاق / Close
            </Button>

            <Button
              type="button"
              onClick={() => handleSubmitRequests(false)}
              disabled={submitting || lines.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>
                {mode === "purchase_request"
                  ? `حفظ كمسودات وإصدار الأرقام (${distinctPrGroupsCount} PR) / Save Drafts`
                  : "حفظ كمسودة / Save Draft"}
              </span>
            </Button>

            <Button
              type="button"
              onClick={() => handleSubmitRequests(true)}
              disabled={submitting || lines.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>
                {mode === "purchase_request"
                  ? `حفظ واعتماد مباشر (Submit ${distinctPrGroupsCount} PR) / Save & Submit`
                  : "حفظ واعتماد (Submit) / Save & Submit"}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
