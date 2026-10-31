"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Loader2,
  Check,
  AlertTriangle,
  Package,
  FileText,
  Search,
  RefreshCw,
  ArrowUpDown,
  Calculator,
  CheckCircle2,
  Plus,
  Minus,
  Sparkles,
  Trash2,
  RefreshCcw,
  PlusCircle,
  X,
  ChevronDown,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db } from "@/lib/db"
import { updateProduct } from "@/lib/storage"
import { syncProduct } from "@/lib/sync-api"
import { fetchOdooApi } from "@/lib/odoo-client"
import { ProductImage } from "@/components/product-image"

export interface OdooUnitFixerTransferInfo {
  id: number
  name: string
  branchName: string
  request_status?: string
}

interface OdooCatalogProduct {
  id: number
  name: string
  display_name: string
  default_code: string
  uom_id: [number, string] | false
  cleanEnglishName: string
}

interface FixerLineItem {
  lineId: number
  requestId: number
  invoiceName: string
  branchName: string
  originalOdooProductId?: number
  odooProductId?: number
  originalProductName: string
  productCode: string
  productName: string
  odooDisplayNameFull?: string
  odooUomId?: number
  odooUnit: string
  warehouseUnit: string
  websiteProductId?: string
  originalQuantityPerCarton: number
  quantityPerCarton: number
  originalOdooQty: number
  newOdooQty: number
  savedSuccess?: boolean
}

type SortViewMode = "by_product" | "by_invoice"
type RoundingRule = "ceil" | "nearest" | "multiply"

interface OdooUnitFixerModalProps {
  isOpen: boolean
  onClose: () => void
  transferIds: number[]
  transfersInfo: OdooUnitFixerTransferInfo[]
  onUpdated?: (
    updatedLines: {
      lineId: number
      requestId: number
      productId?: number
      quantity: number
    }[]
  ) => void
}

/**
 * Extracts only the full English product name without [CODE] prefix and without Arabic text.
 */
function extractCleanEnglishName(rawName: string): string {
  if (!rawName) return ""
  // 1. Strip [CODE] prefix
  let name = rawName.replace(/^\[.*?\]\s*/, "").trim()

  // 2. If the string contains both Latin letters and Arabic letters, strip Arabic segments
  const hasLatin = /[a-zA-Z]/.test(name)
  const hasArabic = /[\u0600-\u06FF]/.test(name)

  if (hasLatin && hasArabic) {
    // Remove Arabic characters and surrounding empty brackets/dashes
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

function computeSuggestedOdooQty(
  originalQty: number,
  qtyPerCarton: number,
  rule: RoundingRule
): number {
  const factor = Math.max(1, Number(qtyPerCarton) || 1)
  const qty = Math.max(0, Number(originalQty) || 0)
  if (factor <= 1 || qty <= 0) return qty || 1

  if (rule === "multiply") {
    return Math.max(1, Math.round(qty)) * factor
  }

  const remainder = qty % factor
  if (Math.abs(remainder) < 0.0001 || Math.abs(remainder - factor) < 0.0001) {
    return Math.round(qty)
  }

  if (rule === "nearest") {
    const cartons = Math.max(1, Math.round(qty / factor))
    return cartons * factor
  }

  const cartons = Math.max(1, Math.ceil(qty / factor))
  return cartons * factor
}

function isBrokenCarton(qty: number, qtyPerCarton: number): boolean {
  const factor = Number(qtyPerCarton) || 1
  if (factor <= 1) return false
  if (qty <= 0) return true
  const ratio = qty / factor
  return Math.abs(ratio - Math.round(ratio)) > 0.001
}

/**
 * Searchable Odoo Product Picker Popover (shows full English name + Code + Carton Size)
 */
function OdooProductSelectorPopover({
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
        className="p-0 w-[480px] max-w-[92vw] shadow-xl border-slate-300 z-50"
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

export function OdooUnitFixerModal({
  isOpen,
  onClose,
  transferIds,
  transfersInfo,
  onUpdated,
}: OdooUnitFixerModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<FixerLineItem[]>([])
  const [sortMode, setSortMode] = useState<SortViewMode>("by_product")
  const [roundingRule, setRoundingRule] = useState<RoundingRule>("ceil")
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const [selectedRequestFilter, setSelectedRequestFilter] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [savingLineId, setSavingLineId] = useState<number | null>(null)
  const [deletingLineId, setDeletingLineId] = useState<number | null>(null)
  const [savingGroupKey, setSavingGroupKey] = useState<string | null>(null)
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null)
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [websiteProductsMap, setWebsiteProductsMap] = useState<Record<string, any>>({})

  // Odoo Catalog Products for Add / Replace Product
  const [catalogProducts, setCatalogProducts] = useState<OdooCatalogProduct[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  // Add Product Panel State (for 1 or multiple branches)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [addSelectedProduct, setAddSelectedProduct] = useState<OdooCatalogProduct | null>(null)
  const [addCartonSize, setAddCartonSize] = useState<number>(1)
  const [addCartonsCount, setAddCartonsCount] = useState<number>(1)
  const [addOdooPieceQty, setAddOdooPieceQty] = useState<number>(1)
  const [addTargetRequestIds, setAddTargetRequestIds] = useState<number[]>([])
  const [isAddingProduct, setIsAddingProduct] = useState(false)

  useEffect(() => {
    if (isOpen && transferIds.length > 0) {
      setSelectedRequestFilter("all")
      setSearchTerm("")
      setAddTargetRequestIds(transferIds)
      setIsAddPanelOpen(false)
      loadLines()
      loadCatalogProducts()
    } else if (!isOpen) {
      setLines([])
    }
  }, [isOpen, transferIds.join(",")])

  const loadCatalogProducts = async () => {
    if (catalogProducts.length > 0) return
    setCatalogLoading(true)
    try {
      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "GET",
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.products)) {
        const mapped: OdooCatalogProduct[] = data.products.map((p: any) => {
          const rawName = p.name || p.display_name || ""
          return {
            id: Number(p.id),
            name: String(p.name || ""),
            display_name: String(p.display_name || ""),
            default_code: p.default_code ? String(p.default_code).trim() : "",
            uom_id: Array.isArray(p.uom_id) ? p.uom_id : false,
            cleanEnglishName: extractCleanEnglishName(rawName),
          }
        })
        setCatalogProducts(mapped)
      }
    } catch (e) {
      console.error("Failed to fetch Odoo catalog products:", e)
    } finally {
      setCatalogLoading(false)
    }
  }

  // Whenever catalogProducts finishes loading, ensure existing lines use the clean English name from catalog if available
  useEffect(() => {
    if (catalogProducts.length === 0 || lines.length === 0) return
    const prodById = new Map<number, OdooCatalogProduct>()
    for (const cp of catalogProducts) {
      prodById.set(cp.id, cp)
    }
    setLines((prev) =>
      prev.map((item) => {
        if (!item.odooProductId) return item
        const cp = prodById.get(item.odooProductId)
        if (!cp || !cp.cleanEnglishName) return item
        return {
          ...item,
          productName: cp.cleanEnglishName,
          productCode: cp.default_code || item.productCode,
        }
      })
    )
  }, [catalogProducts.length])

  const mapRawOdooLineToFixerItem = (
    l: any,
    codeMap: Record<string, any>,
    transferMap: Map<number, OdooUnitFixerTransferInfo>,
    rule: RoundingRule
  ): FixerLineItem => {
    const reqId = Array.isArray(l.approval_request_id)
      ? l.approval_request_id[0]
      : Number(l.approval_request_id)
    const reqNameFromOdoo = Array.isArray(l.approval_request_id)
      ? l.approval_request_id[1]
      : ""
    const tInfo = transferMap.get(reqId)

    // Always prefer Odoo's English product_id[1] over static description
    const lineName = Array.isArray(l.product_id) && l.product_id[1]
      ? l.product_id[1]
      : l.description || ""
    const matchCode = lineName.match(/^\[(.*?)\]/)
    const extractedCode = matchCode ? matchCode[1].trim() : ""
    const cleanEnglish = extractCleanEnglishName(lineName)

    const wp =
      (extractedCode &&
        (codeMap[extractedCode] || codeMap[extractedCode.toLowerCase()])) ||
      undefined

    const qtyPerCarton = Math.max(1, Number(wp?.quantityPerCarton) || 1)
    const origQty = Number(l.quantity) || 0
    const broken = isBrokenCarton(origQty, qtyPerCarton)

    const suggestedQty = broken
      ? computeSuggestedOdooQty(origQty, qtyPerCarton, rule)
      : origQty

    const prodId = Array.isArray(l.product_id) ? Number(l.product_id[0]) : undefined
    const uomId = Array.isArray(l.product_uom_id) ? Number(l.product_uom_id[0]) : undefined

    return {
      lineId: Number(l.id),
      requestId: reqId,
      invoiceName:
        tInfo?.name && tInfo.name !== "/"
          ? tInfo.name
          : reqNameFromOdoo || `#${reqId}`,
      branchName: tInfo?.branchName || reqNameFromOdoo || `Branch #${reqId}`,
      originalOdooProductId: prodId,
      odooProductId: prodId,
      originalProductName: cleanEnglish,
      productCode: extractedCode,
      // IMPORTANT: Show English Name only (from Odoo), NOT Arabic from wp.productName
      productName: cleanEnglish,
      odooDisplayNameFull: lineName,
      odooUomId: uomId,
      odooUnit: Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : "Units",
      warehouseUnit: wp?.unit || "Carton",
      websiteProductId: wp?.id,
      originalQuantityPerCarton: qtyPerCarton,
      quantityPerCarton: qtyPerCarton,
      originalOdooQty: origQty,
      newOdooQty: suggestedQty,
      savedSuccess: false,
    }
  }

  const loadLines = async () => {
    if (!transferIds || transferIds.length === 0) return
    setLoading(true)
    try {
      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: transferIds }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(
          data.error ||
            "فشل في جلب أصناف الفواتير من أودو / Failed to fetch invoice lines from Odoo"
        )
      }

      const rawLines: any[] = data.lines || []

      const allWebsiteProducts = await db.products.toArray()
      const codeMap: Record<string, any> = {}
      for (const wp of allWebsiteProducts) {
        if (wp.productCode) {
          const cleanCode = String(wp.productCode).trim()
          codeMap[cleanCode] = wp
          codeMap[cleanCode.toLowerCase()] = wp
        }
      }
      setWebsiteProductsMap(codeMap)

      const transferMap = new Map<number, OdooUnitFixerTransferInfo>()
      for (const t of transfersInfo) {
        transferMap.set(t.id, t)
      }

      const mapped = rawLines.map((l: any) =>
        mapRawOdooLineToFixerItem(l, codeMap, transferMap, roundingRule)
      )

      setLines(mapped)
    } catch (err: any) {
      toast({
        title: "خطأ / Error",
        description:
          err.message ||
          "تعذر تحميل بيانات الأصناف / Failed to load product lines",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Replace Product for a Single Line (Single Branch)
  const handleReplaceLineProduct = (lineId: number, newProd: OdooCatalogProduct) => {
    const code = newProd.default_code ? String(newProd.default_code).trim() : ""
    const wp =
      (code &&
        (websiteProductsMap[code] || websiteProductsMap[code.toLowerCase()])) ||
      undefined
    const newFactor = Math.max(1, Number(wp?.quantityPerCarton) || 1)
    const newUomName = Array.isArray(newProd.uom_id) ? newProd.uom_id[1] : "Units"
    const newUomId = Array.isArray(newProd.uom_id) ? Number(newProd.uom_id[0]) : undefined

    setLines((prev) =>
      prev.map((item) => {
        if (item.lineId !== lineId) return item
        // Preserve current carton count if >= 1, otherwise compute suggested
        const currentCartons = Math.max(
          1,
          Math.round(item.newOdooQty / Math.max(1, item.quantityPerCarton))
        )
        const nextOdooQty = currentCartons * newFactor
        return {
          ...item,
          odooProductId: newProd.id,
          productCode: code,
          productName: newProd.cleanEnglishName,
          odooDisplayNameFull: newProd.display_name,
          odooUomId: newUomId,
          odooUnit: newUomName,
          warehouseUnit: wp?.unit || "Carton",
          websiteProductId: wp?.id,
          originalQuantityPerCarton: newFactor,
          quantityPerCarton: newFactor,
          newOdooQty: nextOdooQty,
          savedSuccess: false,
        }
      })
    )
    toast({
      title: "تم تغيير المنتج / Product Changed",
      description: `Selected: ${newProd.cleanEnglishName}. اضغط تحديث لحفظ التغيير في أودو / Click Update to save.`,
    })
  }

  // Replace Product for Multiple Branches at once (Product Group)
  const handleReplaceGroupProduct = (
    groupItems: FixerLineItem[],
    newProd: OdooCatalogProduct
  ) => {
    const targetLineIds = new Set(groupItems.map((x) => x.lineId))
    const code = newProd.default_code ? String(newProd.default_code).trim() : ""
    const wp =
      (code &&
        (websiteProductsMap[code] || websiteProductsMap[code.toLowerCase()])) ||
      undefined
    const newFactor = Math.max(1, Number(wp?.quantityPerCarton) || 1)
    const newUomName = Array.isArray(newProd.uom_id) ? newProd.uom_id[1] : "Units"
    const newUomId = Array.isArray(newProd.uom_id) ? Number(newProd.uom_id[0]) : undefined

    setLines((prev) =>
      prev.map((item) => {
        if (!targetLineIds.has(item.lineId)) return item
        const currentCartons = Math.max(
          1,
          Math.round(item.newOdooQty / Math.max(1, item.quantityPerCarton))
        )
        const nextOdooQty = currentCartons * newFactor
        return {
          ...item,
          odooProductId: newProd.id,
          productCode: code,
          productName: newProd.cleanEnglishName,
          odooDisplayNameFull: newProd.display_name,
          odooUomId: newUomId,
          odooUnit: newUomName,
          warehouseUnit: wp?.unit || "Carton",
          websiteProductId: wp?.id,
          originalQuantityPerCarton: newFactor,
          quantityPerCarton: newFactor,
          newOdooQty: nextOdooQty,
          savedSuccess: false,
        }
      })
    )
    toast({
      title: "تم استبدال المنتج لكل الفروع / Product Replaced for All Branches",
      description: `${newProd.cleanEnglishName} (${groupItems.length} branches). اضغط تحديث لحفظ التغيير / Click Update to save.`,
    })
  }

  // Delete Single Product Line from a Branch
  const handleDeleteSingleLine = async (item: FixerLineItem) => {
    if (
      !confirm(
        `هل أنت متأكد من حذف المنتج (${item.productName}) من فاتورة الفرع (${item.branchName})؟\nDelete product from ${item.branchName}?`
      )
    ) {
      return
    }
    setDeletingLineId(item.lineId)
    try {
      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          lineIds: [item.lineId],
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل حذف السطر من أودو / Failed to delete line")
      }
      setLines((prev) => prev.filter((x) => x.lineId !== item.lineId))
      if (onUpdated) onUpdated([])
      toast({
        title: "تم الحذف بنجاح / Deleted",
        description: `تم حذف ${item.productName} من ${item.branchName}`,
      })
    } catch (err: any) {
      toast({
        title: "فشل الحذف / Delete Failed",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setDeletingLineId(null)
    }
  }

  // Delete Product from Multiple Branches at once (Group Delete)
  const handleDeleteGroupLines = async (
    groupKey: string,
    groupItems: FixerLineItem[]
  ) => {
    if (groupItems.length === 0) return
    if (
      !confirm(
        `هل أنت متأكد من حذف (${groupItems[0].productName}) من عدد (${groupItems.length}) فروع دفعة واحدة؟\nDelete this product from ${groupItems.length} branches?`
      )
    ) {
      return
    }
    setDeletingGroupKey(groupKey)
    try {
      const idsToDelete = groupItems.map((x) => x.lineId)
      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          lineIds: idsToDelete,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل الحذف الجماعي / Bulk delete failed")
      }
      const deletedSet = new Set(idsToDelete)
      setLines((prev) => prev.filter((x) => !deletedSet.has(x.lineId)))
      if (onUpdated) onUpdated([])
      toast({
        title: "تم الحذف الجماعي / Group Deleted",
        description: `تم حذف الصنف من ${idsToDelete.length} فروع بنجاح.`,
      })
    } catch (err: any) {
      toast({
        title: "خطأ / Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setDeletingGroupKey(null)
    }
  }

  // Select product in "Add Product to Branches" panel
  const handleSelectProductToAdd = (prod: OdooCatalogProduct) => {
    setAddSelectedProduct(prod)
    const code = prod.default_code ? String(prod.default_code).trim() : ""
    const wp =
      (code &&
        (websiteProductsMap[code] || websiteProductsMap[code.toLowerCase()])) ||
      undefined
    const factor = Math.max(1, Number(wp?.quantityPerCarton) || 1)
    setAddCartonSize(factor)
    setAddCartonsCount(1)
    setAddOdooPieceQty(factor)
  }

  const handleAddProductToBranches = async () => {
    if (!addSelectedProduct) {
      toast({
        title: "اختر المنتج أولاً / Select Product",
        description: "يرجى اختيار المنتج المراد إضافته / Please select a product first.",
        variant: "destructive",
      })
      return
    }
    if (addTargetRequestIds.length === 0) {
      toast({
        title: "اختر فرعاً واحداً على الأقل / Select Branch",
        description: "يرجى تحديد فرع واحد أو أكثر لإضافة المنتج إليه.",
        variant: "destructive",
      })
      return
    }
    if (addOdooPieceQty <= 0) {
      toast({
        title: "الكمية غير صحيحة / Invalid Quantity",
        description: "يرجى إدخال كمية أكبر من صفر.",
        variant: "destructive",
      })
      return
    }

    setIsAddingProduct(true)
    try {
      // Save updated carton size to website DB if user modified it
      const code = addSelectedProduct.default_code
        ? String(addSelectedProduct.default_code).trim()
        : ""
      const wp =
        (code &&
          (websiteProductsMap[code] || websiteProductsMap[code.toLowerCase()])) ||
        undefined
      if (wp?.id && addCartonSize > 1 && addCartonSize !== Number(wp.quantityPerCarton)) {
        try {
          const updatedProd = await updateProduct(wp.id, {
            quantityPerCarton: addCartonSize,
          })
          if (updatedProd) {
            syncProduct(updatedProd).catch(console.error)
            setWebsiteProductsMap((prev) => ({
              ...prev,
              [code]: updatedProd,
              [code.toLowerCase()]: updatedProd,
            }))
          }
        } catch (e) {
          console.error(e)
        }
      }

      const itemsPayload = addTargetRequestIds.map((reqId) => ({
        requestId: reqId,
        productId: addSelectedProduct.id,
        quantity: addOdooPieceQty,
      }))

      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          items: itemsPayload,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل إضافة المنتج في أودو / Failed to add product")
      }

      const transferMap = new Map<number, OdooUnitFixerTransferInfo>()
      for (const t of transfersInfo) {
        transferMap.set(t.id, t)
      }

      const newlyCreated: FixerLineItem[] = (data.createdLines || []).map((l: any) => {
        const mapped = mapRawOdooLineToFixerItem(
          l,
          websiteProductsMap,
          transferMap,
          roundingRule
        )
        return {
          ...mapped,
          productName: addSelectedProduct.cleanEnglishName || mapped.productName,
          quantityPerCarton: addCartonSize,
          originalQuantityPerCarton: addCartonSize,
          newOdooQty: addOdooPieceQty,
          savedSuccess: true,
        }
      })

      setLines((prev) => [...newlyCreated, ...prev])
      if (onUpdated) onUpdated([])
      toast({
        title: "تمت الإضافة بنجاح / Product Added",
        description: `تمت إضافة (${addSelectedProduct.cleanEnglishName}) بعدد (${addOdooPieceQty}) إلى ${ newlyCreated.length } فرع في أودو.`,
      })
      setAddSelectedProduct(null)
    } catch (err: any) {
      toast({
        title: "فشل الإضافة / Add Failed",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsAddingProduct(false)
    }
  }

  const handleApplyRuleToAll = (rule: RoundingRule) => {
    setRoundingRule(rule)
    setLines((prev) =>
      prev.map((item) => {
        const broken = isBrokenCarton(item.originalOdooQty, item.quantityPerCarton)
        if (!broken && rule !== "multiply") return item
        const nextQty = computeSuggestedOdooQty(
          item.originalOdooQty,
          item.quantityPerCarton,
          rule
        )
        return {
          ...item,
          newOdooQty: nextQty,
          savedSuccess: false,
        }
      })
    )
    toast({
      title: "تم تطبيق القاعدة / Rule Applied",
      description:
        rule === "ceil"
          ? "تم تقريب الأصناف غير المطابقة لأعلى كرتون كامل / Rounded up to next full carton"
          : rule === "nearest"
          ? "تم تقريب الأصناف غير المطابقة لأقرب كرتون / Rounded to nearest carton"
          : "تم ضرب الكمية الأصلية × شد الكرتون / Multiplied by carton size",
    })
  }

  const handleUpdateOdooQty = (lineId: number, val: number) => {
    const safeVal = Math.max(0, Number(val) || 0)
    setLines((prev) =>
      prev.map((item) =>
        item.lineId === lineId
          ? { ...item, newOdooQty: safeVal, savedSuccess: false }
          : item
      )
    )
  }

  const handleUpdateCartonCount = (lineId: number, cartons: number) => {
    const safeCartons = Math.max(0, Number(cartons) || 0)
    setLines((prev) =>
      prev.map((item) => {
        if (item.lineId !== lineId) return item
        const factor = Math.max(1, Number(item.quantityPerCarton) || 1)
        const nextOdooQty = Number((safeCartons * factor).toFixed(2))
        return {
          ...item,
          newOdooQty: nextOdooQty,
          savedSuccess: false,
        }
      })
    )
  }

  const handleUpdateQtyPerCarton = (
    productCode: string,
    fallbackLineId: number,
    newFactor: number
  ) => {
    const factor = Math.max(1, Number(newFactor) || 1)
    setLines((prev) =>
      prev.map((item) => {
        const isMatch = productCode
          ? item.productCode === productCode
          : item.lineId === fallbackLineId
        if (!isMatch) return item

        const broken = isBrokenCarton(item.originalOdooQty, factor)
        const suggested = broken
          ? computeSuggestedOdooQty(item.originalOdooQty, factor, roundingRule)
          : item.originalOdooQty

        return {
          ...item,
          quantityPerCarton: factor,
          newOdooQty: suggested,
          savedSuccess: false,
        }
      })
    )
  }

  const syncModifiedWebsiteProducts = async (itemsToSync: FixerLineItem[]) => {
    const seenProductIds = new Set<string>()
    for (const item of itemsToSync) {
      if (
        item.websiteProductId &&
        item.quantityPerCarton !== item.originalQuantityPerCarton &&
        !seenProductIds.has(item.websiteProductId)
      ) {
        seenProductIds.add(item.websiteProductId)
        try {
          const updatedProd = await updateProduct(item.websiteProductId, {
            quantityPerCarton: item.quantityPerCarton,
          })
          if (updatedProd) {
            syncProduct(updatedProd).catch(console.error)
          }
        } catch (e) {
          console.error("Failed to update website product quantityPerCarton:", e)
        }
      }
    }
  }

  const isItemModified = (item: FixerLineItem) =>
    item.newOdooQty !== item.originalOdooQty ||
    item.quantityPerCarton !== item.originalQuantityPerCarton ||
    item.odooProductId !== item.originalOdooProductId

  const handleSaveSingleLine = async (item: FixerLineItem) => {
    if (item.newOdooQty <= 0) {
      toast({
        title: "تنبيه / Warning",
        description: "الكمية يجب أن تكون أكبر من صفر / Quantity must be greater than 0",
        variant: "destructive",
      })
      return
    }
    setSavingLineId(item.lineId)
    try {
      await syncModifiedWebsiteProducts([item])

      const isProdChanged =
        item.odooProductId && item.odooProductId !== item.originalOdooProductId

      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            {
              lineId: item.lineId,
              requestId: item.requestId,
              productId: item.originalOdooProductId || item.odooProductId,
              newProductId: isProdChanged ? item.odooProductId : undefined,
              newDescription: isProdChanged
                ? item.odooDisplayNameFull || item.productName
                : undefined,
              newUomId: isProdChanged ? item.odooUomId : undefined,
              quantity: item.newOdooQty,
            },
          ],
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل تحديث السطر في أودو / Failed to update line in Odoo")
      }

      setLines((prev) =>
        prev.map((x) =>
          x.lineId === item.lineId
            ? {
                ...x,
                originalOdooQty: item.newOdooQty,
                originalOdooProductId: item.odooProductId,
                originalProductName: item.productName,
                originalQuantityPerCarton: item.quantityPerCarton,
                savedSuccess: true,
              }
            : x
        )
      )

      if (onUpdated) {
        onUpdated([
          {
            lineId: item.lineId,
            requestId: item.requestId,
            productId: item.odooProductId,
            quantity: item.newOdooQty,
          },
        ])
      }

      toast({
        title: "تم التحديث بنجاح / Updated Successfully",
        description: `${item.productName} (${item.branchName}) → ${item.newOdooQty} ${item.odooUnit}`,
      })
    } catch (err: any) {
      toast({
        title: "فشل التحديث / Update Failed",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setSavingLineId(null)
    }
  }

  const handleSaveGroup = async (groupKey: string, groupItems: FixerLineItem[]) => {
    const itemsToUpdate = groupItems.filter(
      (i) => isItemModified(i) && i.newOdooQty > 0
    )
    if (itemsToUpdate.length === 0) {
      toast({
        title: "لا توجد تغييرات / No Changes",
        description: "جميع أصناف هذه المجموعة مطابقة بالفعل / All items in this group are already up to date.",
      })
      return
    }

    setSavingGroupKey(groupKey)
    try {
      await syncModifiedWebsiteProducts(itemsToUpdate)

      const payload = itemsToUpdate.map((item) => {
        const isProdChanged =
          item.odooProductId && item.odooProductId !== item.originalOdooProductId
        return {
          lineId: item.lineId,
          requestId: item.requestId,
          productId: item.originalOdooProductId || item.odooProductId,
          newProductId: isProdChanged ? item.odooProductId : undefined,
          newDescription: isProdChanged
            ? item.odooDisplayNameFull || item.productName
            : undefined,
          newUomId: isProdChanged ? item.odooUomId : undefined,
          quantity: item.newOdooQty,
        }
      })

      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: payload }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل تحديث المجموعة في أودو / Failed to update group in Odoo")
      }

      const updatedIds = new Set(itemsToUpdate.map((i) => i.lineId))
      setLines((prev) =>
        prev.map((x) =>
          updatedIds.has(x.lineId)
            ? {
                ...x,
                originalOdooQty: x.newOdooQty,
                originalOdooProductId: x.odooProductId,
                originalProductName: x.productName,
                originalQuantityPerCarton: x.quantityPerCarton,
                savedSuccess: true,
              }
            : x
        )
      )

      if (onUpdated) {
        onUpdated(payload)
      }

      toast({
        title: "تم تحديث المجموعة / Group Updated",
        description: `تم تحديث ${itemsToUpdate.length} سطر في أودو والموقع بنجاح / Updated ${itemsToUpdate.length} lines in Odoo & Website.`,
      })
    } catch (err: any) {
      toast({
        title: "فشل التحديث / Update Failed",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setSavingGroupKey(null)
    }
  }

  const handleSaveAll = async () => {
    const itemsToUpdate = filteredLines.filter(
      (i) => isItemModified(i) && i.newOdooQty > 0
    )

    if (itemsToUpdate.length === 0) {
      toast({
        title: "لا توجد تعديلات معلقة / No Pending Changes",
        description: "جميع الكميات الحالية محفوظة ومطابقة / All quantities are already saved.",
      })
      return
    }

    setIsBulkSaving(true)
    try {
      await syncModifiedWebsiteProducts(itemsToUpdate)

      const payload = itemsToUpdate.map((item) => {
        const isProdChanged =
          item.odooProductId && item.odooProductId !== item.originalOdooProductId
        return {
          lineId: item.lineId,
          requestId: item.requestId,
          productId: item.originalOdooProductId || item.odooProductId,
          newProductId: isProdChanged ? item.odooProductId : undefined,
          newDescription: isProdChanged
            ? item.odooDisplayNameFull || item.productName
            : undefined,
          newUomId: isProdChanged ? item.odooUomId : undefined,
          quantity: item.newOdooQty,
        }
      })

      const res = await fetchOdooApi("/api/odoo/transfers/batch-lines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: payload }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل التحديث الجماعي في أودو / Bulk update failed in Odoo")
      }

      const updatedIds = new Set(itemsToUpdate.map((i) => i.lineId))
      setLines((prev) =>
        prev.map((x) =>
          updatedIds.has(x.lineId)
            ? {
                ...x,
                originalOdooQty: x.newOdooQty,
                originalOdooProductId: x.odooProductId,
                originalProductName: x.productName,
                originalQuantityPerCarton: x.quantityPerCarton,
                savedSuccess: true,
              }
            : x
        )
      )

      if (onUpdated) {
        onUpdated(payload)
      }

      toast({
        title: "تم التحديث الجماعي بنجاح / Bulk Update Complete",
        description: `تم تحديث ${itemsToUpdate.length} منتج في أودو والموقع دفعة واحدة / Updated ${itemsToUpdate.length} items in Odoo & Website!`,
      })
    } catch (err: any) {
      toast({
        title: "خطأ في التحديث الجماعي / Bulk Update Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsBulkSaving(false)
    }
  }

  const distinctInvoices = useMemo(() => {
    const map = new Map<
      number,
      { id: number; invoiceName: string; branchName: string; errorCount: number }
    >()
    for (const t of transfersInfo) {
      if (transferIds.includes(t.id)) {
        map.set(t.id, {
          id: t.id,
          invoiceName: t.name && t.name !== "/" ? t.name : `#${t.id}`,
          branchName: t.branchName || `#${t.id}`,
          errorCount: 0,
        })
      }
    }
    for (const l of lines) {
      const existing = map.get(l.requestId) || {
        id: l.requestId,
        invoiceName: l.invoiceName,
        branchName: l.branchName,
        errorCount: 0,
      }
      if (isBrokenCarton(l.originalOdooQty, l.quantityPerCarton)) {
        existing.errorCount += 1
      }
      map.set(l.requestId, existing)
    }
    return Array.from(map.values())
  }, [lines, transfersInfo, transferIds])

  const filteredLines = useMemo(() => {
    let list = [...lines]

    if (selectedRequestFilter !== "all") {
      const reqId = Number(selectedRequestFilter)
      list = list.filter((l) => l.requestId === reqId)
    }

    if (showErrorsOnly) {
      list = list.filter((l) =>
        isBrokenCarton(l.originalOdooQty, l.quantityPerCarton)
      )
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      list = list.filter(
        (l) =>
          l.productName.toLowerCase().includes(q) ||
          l.productCode.toLowerCase().includes(q) ||
          l.branchName.toLowerCase().includes(q) ||
          l.invoiceName.toLowerCase().includes(q)
      )
    }

    if (sortMode === "by_product") {
      list.sort((a, b) => {
        const keyA = (a.productCode || a.productName).toLowerCase()
        const keyB = (b.productCode || b.productName).toLowerCase()
        if (keyA !== keyB) return keyA.localeCompare(keyB, "en")
        return a.branchName.localeCompare(b.branchName, "ar")
      })
    } else {
      list.sort((a, b) => {
        if (a.requestId !== b.requestId) return a.requestId - b.requestId
        return a.productName.localeCompare(b.productName, "en")
      })
    }

    return list
  }, [lines, selectedRequestFilter, showErrorsOnly, searchTerm, sortMode])

  const stats = useMemo(() => {
    const totalLines = lines.length
    const brokenCount = lines.filter((l) =>
      isBrokenCarton(l.originalOdooQty, l.quantityPerCarton)
    ).length
    const pendingChangesCount = filteredLines.filter((l) =>
      isItemModified(l)
    ).length

    return { totalLines, brokenCount, pendingChangesCount }
  }, [lines, filteredLines])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[96vw] md:max-w-7xl w-full max-h-[93vh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        <DialogHeader className="border-b pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 whitespace-nowrap">
                <Calculator className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="whitespace-nowrap">Order Units Fixer (Carton ⇄ Piece)</span>
                <Badge variant="outline" className="text-[11px] px-2 py-0.5 bg-white text-black border border-black whitespace-nowrap">
                  {transferIds.length === 1
                    ? `فرع واحد / 1 Branch: ${distinctInvoices[0]?.branchName || ""}`
                    : `${transferIds.length} فروع (فواتير) / Branches`}
                </Badge>
              </DialogTitle>
            </div>

            {/* Quick Summary Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-white border border-black text-black px-3 py-1 text-xs">
                إجمالي السطور / Total Lines: <strong className="mr-1">{stats.totalLines}</strong>
              </Badge>
              <Badge
                variant="outline"
                className="px-3 py-1 text-xs bg-white text-black border border-black"
              >
                كسر كرتون / Broken Cartons: <strong className="mr-1">{stats.brokenCount}</strong>
              </Badge>
              {stats.pendingChangesCount > 0 && (
                <Badge variant="outline" className="bg-white border border-black text-black px-3 py-1 text-xs">
                  جاهز للتحديث / Ready to Update: <strong className="mr-1">{stats.pendingChangesCount}</strong>
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Controls & Filters Toolbar */}
        <div className="bg-slate-50 border rounded-lg p-3 space-y-3 my-1">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* 1. Sort / Grouping Mode Filter */}
            <div className="md:col-span-4 flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <ArrowUpDown className="h-3.5 w-3.5 text-black" />
                طريقة الترتيب والعرض / Sort & View Mode:
              </span>
              <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-md border">
                <button
                  type="button"
                  onClick={() => setSortMode("by_product")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] whitespace-nowrap font-bold transition-all ${
                    sortMode === "by_product"
                      ? "bg-white text-black border border-black shadow-sm"
                      : "text-slate-600 border border-transparent hover:bg-slate-50"
                  }`}
                >
                  <Package className="h-3.5 w-3.5 flex-shrink-0 text-black" />
                  <span>حسب المنتجات / By Product</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("by_invoice")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] whitespace-nowrap font-bold transition-all ${
                    sortMode === "by_invoice"
                      ? "bg-white text-black border border-black shadow-sm"
                      : "text-slate-600 border border-transparent hover:bg-slate-50"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-black" />
                  <span>حسب الفاتورة / By Invoice</span>
                </button>
              </div>
            </div>

            {/* 2. Automatic Rounding Rule Selector */}
            <div className="md:col-span-5 flex flex-col justify-end h-full pt-4">
              <div className="flex items-center gap-1 bg-white p-1 rounded-md border">
                <button
                  type="button"
                  onClick={() => handleApplyRuleToAll("ceil")}
                  className={`flex-1 py-1.5 px-2 rounded text-[10px] whitespace-nowrap font-bold transition-all ${
                    roundingRule === "ceil"
                      ? "bg-white text-black border border-black shadow-sm"
                      : "text-slate-600 border border-transparent hover:bg-slate-50"
                  }`}
                  title="مثال: إذا طلب 20 والشد 30 تصبح 30 (1 كرتون) / Round up to next full carton"
                >
                  لأعلى كرتون / Round Up
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyRuleToAll("nearest")}
                  className={`flex-1 py-1.5 px-2 rounded text-[10px] whitespace-nowrap font-bold transition-all ${
                    roundingRule === "nearest"
                      ? "bg-white text-black border border-black shadow-sm"
                      : "text-slate-600 border border-transparent hover:bg-slate-50"
                  }`}
                  title="لأقرب كرتون (أعلى أو أدنى) / Round to nearest carton"
                >
                  لأقرب كرتون / Nearest
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyRuleToAll("multiply")}
                  className={`flex-1 py-1.5 px-2 rounded text-[10px] whitespace-nowrap font-bold transition-all ${
                    roundingRule === "multiply"
                      ? "bg-white text-black border border-black shadow-sm"
                      : "text-slate-600 border border-transparent hover:bg-slate-50"
                  }`}
                  title="ضرب الكمية × شد الكرتون / Multiply Qty × Carton Size"
                >
                  ضرب × الشد / Multiply
                </button>
              </div>
            </div>

            {/* 3. Show Errors Only Toggle */}
            <div className="md:col-span-3 flex flex-col justify-end h-full pt-3">
              <label
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                  showErrorsOnly
                    ? "bg-red-50 border-red-300 text-red-800"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  إظهار الأخطاء فقط / Errors Only ({stats.brokenCount})
                </span>
                <Switch
                  checked={showErrorsOnly}
                  onCheckedChange={setShowErrorsOnly}
                />
              </label>
            </div>
          </div>

          {/* Second Row: Branch/Invoice Filter + Search + Bulk Save */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {distinctInvoices.length > 1 && (
                <select
                  className="p-2 border rounded-md text-xs font-semibold bg-white min-w-[220px]"
                  value={selectedRequestFilter}
                  onChange={(e) => setSelectedRequestFilter(e.target.value)}
                >
                  <option value="all">
                    كل الفواتير المختارة / All Selected Invoices ({distinctInvoices.length})
                  </option>
                  {distinctInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.branchName} ({inv.invoiceName}){" "}
                      {inv.errorCount > 0 ? `- ⚠️ ${inv.errorCount} خطأ/Errors` : "- ✅ OK"}
                    </option>
                  ))}
                </select>
              )}

              <div className="relative flex-1 max-w-xs">
                <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="بحث بالمنتج (إنجليزي)، الكود، أو الفرع... / Search product, code, branch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-8 h-8 text-xs bg-white"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadLines}
                disabled={loading}
                className="h-8 text-xs gap-1 bg-white"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                إعادة الفحص / Rescan
              </Button>
            </div>
          </div>
        </div>

        {/* Main Table Area */}
        <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-[300px] relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground font-medium">
                جاري فحص أصناف الفواتير ومطابقة شد الكرتون... / Scanning invoice items & matching carton sizes...
              </p>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-base font-bold text-slate-700">
                {showErrorsOnly
                  ? "ممتاز! لا توجد أي أخطاء في وحدات أو شد الكرتون في الفواتير المحددة / Great! No carton unit errors found 🎉"
                  : "لا توجد أصناف مطابقة للبحث الحالي / No matching items found."}
              </p>
              {showErrorsOnly && lines.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowErrorsOnly(false)}
                  className="mt-2"
                >
                  عرض جميع الأصناف / Show All Items ({lines.length})
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full caption-bottom text-sm border-collapse">
              <TableHeader className="bg-slate-100 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
                <TableRow>
                  <TableHead className="sticky top-0 z-20 bg-slate-100 text-right font-bold text-slate-700 min-w-[280px]">
                    المنتج (الاسم الإنجليزي الكامل)
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Full English Product Name & Replacement
                    </span>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-slate-100 text-right font-bold text-slate-700 w-44">
                    الفرع / الفاتورة
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">Branch / Invoice</span>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-slate-100 text-center font-bold text-slate-700 w-28">
                    شد الكرتون
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Carton Size (Pcs)
                    </span>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-slate-100 text-center font-bold text-slate-700 w-36">
                    الكمية الحالية بأودو
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Current Odoo Qty
                    </span>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 text-center font-bold text-blue-800 bg-blue-50 w-40">
                    الكمية بالكرتون
                    <br />
                    <span className="text-[10px] font-normal text-blue-600">
                      Carton Qty (WH Unit)
                    </span>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 text-center font-bold text-emerald-800 bg-emerald-50 w-36">
                    الكمية الصحيحة بأودو
                    <br />
                    <span className="text-[10px] font-normal text-emerald-600">
                      Fixed Odoo Qty (Pcs)
                    </span>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 bg-slate-100 text-center font-bold text-slate-700 w-40">
                    إجراء فردي
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      Update / Delete
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.map((item, idx) => {
                  const prevItem = idx > 0 ? filteredLines[idx - 1] : null
                  const currentGroupKey =
                    sortMode === "by_product"
                      ? item.productCode || item.productName
                      : String(item.requestId)
                  const prevGroupKey = prevItem
                    ? sortMode === "by_product"
                      ? prevItem.productCode || prevItem.productName
                      : String(prevItem.requestId)
                    : null
                  const isNewGroup = currentGroupKey !== prevGroupKey

                  const groupItems = isNewGroup
                    ? filteredLines.filter((x) =>
                        sortMode === "by_product"
                          ? (x.productCode || x.productName) === currentGroupKey
                          : String(x.requestId) === currentGroupKey
                      )
                    : []
                  const groupPendingCount = groupItems.filter((x) =>
                    isItemModified(x)
                  ).length

                  const origBroken = isBrokenCarton(
                    item.originalOdooQty,
                    item.quantityPerCarton
                  )
                  const newBroken = isBrokenCarton(
                    item.newOdooQty,
                    item.quantityPerCarton
                  )
                  const isChanged = isItemModified(item)
                  const isProdReplaced =
                    item.odooProductId !== item.originalOdooProductId

                  const origCartons =
                    item.quantityPerCarton > 0
                      ? Number(
                          (item.originalOdooQty / item.quantityPerCarton).toFixed(2)
                        )
                      : item.originalOdooQty

                  const newCartons =
                    item.quantityPerCarton > 0
                      ? Number((item.newOdooQty / item.quantityPerCarton).toFixed(2))
                      : item.newOdooQty

                  const wp =
                    (item.productCode &&
                      (websiteProductsMap[item.productCode] ||
                        websiteProductsMap[item.productCode.toLowerCase()])) ||
                    undefined

                  return (
                    <React.Fragment key={item.lineId}>
                      {/* Group Header Row */}
                      {isNewGroup && distinctInvoices.length > 1 && (
                        <TableRow className="bg-slate-200/80 hover:bg-slate-200/80 border-y-2 border-slate-300">
                          <TableCell colSpan={7} className="py-2 px-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              {sortMode === "by_product" ? (
                                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm flex-wrap">
                                  <Package className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                  <span dir="ltr" className="text-left font-bold">
                                    {item.productName}
                                  </span>
                                  {item.productCode && (
                                    <Badge variant="outline" className="bg-white font-mono text-xs">
                                      {item.productCode}
                                    </Badge>
                                  )}
                                  <Badge className="bg-blue-600 text-white text-[11px]">
                                    مطلوب في {groupItems.length} فروع / {groupItems.length} Branches
                                  </Badge>
                                  <span className="text-xs text-slate-600 font-normal">
                                    (Carton Size: {item.quantityPerCarton})
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm flex-wrap">
                                  <FileText className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                                  <span>فرع / Branch: {item.branchName}</span>
                                  <Badge variant="outline" className="bg-white font-mono text-xs">
                                    {item.invoiceName}
                                  </Badge>
                                  <Badge className="bg-indigo-600 text-white text-[11px]">
                                    {groupItems.length} أصناف / Items
                                  </Badge>
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Group Actions when sorted by Product: Replace Product for All Branches & Delete from All Branches */}
                                {sortMode === "by_product" && groupItems.length > 1 && (
                                  <>
                                    <OdooProductSelectorPopover
                                      catalogProducts={catalogProducts}
                                      catalogLoading={catalogLoading}
                                      websiteProductsMap={websiteProductsMap}
                                      onSelect={(newProd) =>
                                        handleReplaceGroupProduct(groupItems, newProd)
                                      }
                                      align="end"
                                      triggerClassName="h-7 px-2.5 rounded text-[11px] font-bold bg-white border border-amber-400 text-amber-800 hover:bg-amber-50 flex items-center gap-1 shadow-sm"
                                      triggerLabel={
                                        <>
                                          <RefreshCcw className="h-3 w-3" />
                                          <span>
                                            تغيير المنتج لكل الفروع ({groupItems.length}) / Replace All
                                          </span>
                                        </>
                                      }
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        handleDeleteGroupLines(currentGroupKey, groupItems)
                                      }
                                      disabled={deletingGroupKey === currentGroupKey}
                                      className="h-7 px-2 text-[11px] font-bold border-red-300 text-red-700 bg-white hover:bg-red-50 gap-1"
                                    >
                                      {deletingGroupKey === currentGroupKey ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3 w-3" />
                                      )}
                                      <span>حذف من الكل / Delete All</span>
                                    </Button>
                                  </>
                                )}

                                {groupPendingCount > 0 && groupItems.length > 1 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleSaveGroup(currentGroupKey, groupItems)}
                                    disabled={savingGroupKey === currentGroupKey}
                                    className="h-7 text-xs bg-blue-700 hover:bg-blue-800 text-white gap-1"
                                  >
                                    {savingGroupKey === currentGroupKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    {sortMode === "by_product"
                                      ? `تحديث للفروع (${groupPendingCount}) / Update All`
                                      : `تحديث الفاتورة (${groupPendingCount}) / Update Invoice`}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}

                      <TableRow
                        className={`transition-colors ${
                          item.savedSuccess
                            ? "bg-emerald-50/40"
                            : isProdReplaced
                            ? "bg-amber-50/60"
                            : origBroken
                            ? "bg-red-50/30 hover:bg-red-50/50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {/* Product Info (Full English Name + Change Product Selector) */}
                        <TableCell className="font-medium py-2.5 align-top">
                          <div className="flex items-start gap-2.5">
                            <div className="h-9 w-9 flex-shrink-0 mt-0.5">
                              <ProductImage
                                product={
                                  wp || { id: `odoo-${item.productCode || item.lineId}` }
                                }
                                className="h-9 w-9 rounded object-cover border bg-white"
                              />
                            </div>
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              {/* FULL English Product Name - No truncation! */}
                              <div
                                dir="ltr"
                                className="text-sm font-bold text-slate-900 whitespace-normal break-words text-left leading-snug"
                              >
                                {item.productName}
                              </div>

                              {isProdReplaced && (
                                <div className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded w-fit font-semibold">
                                  🔄 تم الاستبدال بدلاً من / Replaced: {item.originalProductName}
                                </div>
                              )}

                              <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500">
                                {item.productCode && (
                                  <span className="font-mono bg-slate-100 px-1.5 rounded text-slate-700 font-semibold">
                                    [{item.productCode}]
                                  </span>
                                )}
                                <span>UoM: {item.odooUnit}</span>

                                {/* Single Branch Product Replacement Trigger */}
                                <OdooProductSelectorPopover
                                  catalogProducts={catalogProducts}
                                  catalogLoading={catalogLoading}
                                  websiteProductsMap={websiteProductsMap}
                                  onSelect={(newProd) =>
                                    handleReplaceLineProduct(item.lineId, newProd)
                                  }
                                  triggerClassName="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition-colors"
                                  triggerLabel={
                                    <>
                                      <RefreshCcw className="h-2.5 w-2.5" />
                                      <span>تغيير المنتج / Change Product</span>
                                      <ChevronDown className="h-2.5 w-2.5" />
                                    </>
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Branch / Invoice */}
                        <TableCell className="py-2.5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-blue-900">
                              {item.branchName}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {item.invoiceName}
                            </span>
                          </div>
                        </TableCell>

                        {/* Quantity Per Carton */}
                        <TableCell className="text-center py-2.5">
                          <div className="flex flex-col items-center gap-1">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantityPerCarton}
                              onChange={(e) =>
                                handleUpdateQtyPerCarton(
                                  item.productCode,
                                  item.lineId,
                                  parseFloat(e.target.value)
                                )
                              }
                              className="w-20 h-8 text-center font-bold text-xs bg-white"
                              title="شد الكرتون / Carton Size (Pcs per Carton)"
                            />
                            {item.quantityPerCarton <= 1 && (
                              <span className="text-[10px] text-amber-600 font-semibold">
                                غير محدد / Not Set (1)
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Current Odoo Quantity & Status */}
                        <TableCell className="text-center py-2.5">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-bold text-slate-800">
                              {item.originalOdooQty} {item.odooUnit}
                            </span>
                            {origBroken ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 font-bold bg-white text-black border border-black"
                              >
                                ❌ {origCartons} {item.warehouseUnit} (كسر / Broken)
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-white text-black border border-black"
                              >
                                ✅ {origCartons} {item.warehouseUnit} (OK)
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Carton Count Input (+ / -) */}
                        <TableCell className="text-center bg-blue-50/30 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 bg-white"
                              onClick={() =>
                                handleUpdateCartonCount(
                                  item.lineId,
                                  Math.max(1, Math.floor(newCartons) - 1)
                                )
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              min={0.1}
                              step="1"
                              value={newCartons}
                              onChange={(e) =>
                                handleUpdateCartonCount(
                                  item.lineId,
                                  parseFloat(e.target.value)
                                )
                              }
                              className={`w-16 h-8 text-center font-bold text-xs bg-white ${
                                !Number.isInteger(newCartons)
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
                                handleUpdateCartonCount(
                                  item.lineId,
                                  Math.floor(newCartons) + 1
                                )
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-[10px] text-blue-700 font-medium block mt-0.5">
                            {item.warehouseUnit}
                          </span>
                        </TableCell>

                        {/* New Odoo Quantity Input */}
                        <TableCell className="text-center bg-emerald-50/30 py-2.5">
                          <div className="flex flex-col items-center gap-1">
                            <Input
                              type="number"
                              min={1}
                              value={item.newOdooQty}
                              onChange={(e) =>
                                handleUpdateOdooQty(
                                  item.lineId,
                                  parseFloat(e.target.value)
                                )
                              }
                              className={`w-24 h-8 text-center font-bold text-sm bg-white ${
                                isChanged
                                  ? "border-amber-500 text-amber-800 ring-1 ring-amber-400"
                                  : "border-emerald-300 text-emerald-800"
                              }`}
                            />
                            {newBroken && item.quantityPerCarton > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateOdooQty(
                                    item.lineId,
                                    computeSuggestedOdooQty(
                                      item.newOdooQty,
                                      item.quantityPerCarton,
                                      roundingRule
                                    )
                                  )
                                }
                                className="text-[10px] text-blue-600 underline hover:text-blue-800 font-semibold"
                              >
                                تصحيح إلى / Fix to{" "}
                                {computeSuggestedOdooQty(
                                  item.newOdooQty,
                                  item.quantityPerCarton,
                                  roundingRule
                                )}
                              </button>
                            )}
                          </div>
                        </TableCell>

                        {/* Individual Save & Delete Actions */}
                        <TableCell className="text-center py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={isChanged ? "default" : "outline"}
                              disabled={
                                savingLineId === item.lineId ||
                                isBulkSaving ||
                                (!isChanged && item.savedSuccess)
                              }
                              onClick={() => handleSaveSingleLine(item)}
                              className={`h-8 text-xs font-bold gap-1 px-2.5 ${
                                isChanged
                                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                  : item.savedSuccess
                                  ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                  : ""
                              }`}
                            >
                              {savingLineId === item.lineId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : item.savedSuccess && !isChanged ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span>محدث / Saved</span>
                                </>
                              ) : (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  <span>تحديث / Update</span>
                                </>
                              )}
                            </Button>

                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={
                                deletingLineId === item.lineId ||
                                savingLineId === item.lineId ||
                                isBulkSaving
                              }
                              onClick={() => handleDeleteSingleLine(item)}
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="حذف هذا المنتج من الفاتورة / Delete product from branch invoice"
                            >
                              {deletingLineId === item.lineId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </table>
          )}
        </div>

        {/* Expandable Panel: Add Product to One or Multiple Branches */}
        {isAddPanelOpen && (
          <div className="bg-indigo-50/70 border-2 border-indigo-200 rounded-lg p-3 space-y-3 my-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-indigo-600" />
                <span>
                  إضافة منتج جديد لفرع أو لعدة فروع / Add New Product to Branch(es)
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsAddPanelOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* 1. Product Picker */}
              <div className="md:col-span-5 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700">
                  1. اختر المنتج (بالإنجليزي أو الكود) / Select Product (English):
                </label>
                <OdooProductSelectorPopover
                  catalogProducts={catalogProducts}
                  catalogLoading={catalogLoading}
                  websiteProductsMap={websiteProductsMap}
                  onSelect={handleSelectProductToAdd}
                  triggerClassName="w-full h-9 px-3 bg-white border border-indigo-300 rounded-md flex items-center justify-between text-xs hover:border-indigo-500 transition-colors"
                  triggerLabel={
                    addSelectedProduct ? (
                      <div className="flex items-center justify-between w-full gap-2 overflow-hidden" dir="ltr">
                        <div className="flex items-center gap-2 min-w-0">
                          <ProductImage
                            product={
                              (addSelectedProduct.default_code &&
                                (websiteProductsMap[addSelectedProduct.default_code] ||
                                  websiteProductsMap[
                                    addSelectedProduct.default_code.toLowerCase()
                                  ])) || {
                                id: `odoo-add-${addSelectedProduct.id}`,
                              }
                            }
                            className="h-6 w-6 rounded object-cover border bg-white flex-shrink-0"
                          />
                          <span className="font-bold text-slate-900 truncate">
                            {addSelectedProduct.cleanEnglishName}
                          </span>
                        </div>
                        {addSelectedProduct.default_code && (
                          <span className="font-mono text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded flex-shrink-0">
                            [{addSelectedProduct.default_code}]
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500">
                        🔍 اضغط للبحث واختيار المنتج... / Click to search product...
                      </span>
                    )
                  }
                />
              </div>

              {/* 2. Carton Size */}
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-700">
                  شد الكرتون / Carton Size:
                </label>
                <Input
                  type="number"
                  min={1}
                  value={addCartonSize}
                  onChange={(e) => {
                    const f = Math.max(1, parseFloat(e.target.value) || 1)
                    setAddCartonSize(f)
                    setAddOdooPieceQty(Number((addCartonsCount * f).toFixed(2)))
                  }}
                  className="h-9 bg-white text-center font-bold text-xs"
                />
              </div>

              {/* 3. Quantity by Cartons */}
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-blue-800">
                  الكمية بالكرتون / Cartons:
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-8 bg-white"
                    onClick={() => {
                      const nextC = Math.max(1, Math.floor(addCartonsCount) - 1)
                      setAddCartonsCount(nextC)
                      setAddOdooPieceQty(Number((nextC * addCartonSize).toFixed(2)))
                    }}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    min={0.1}
                    step="1"
                    value={addCartonsCount}
                    onChange={(e) => {
                      const c = Math.max(0, parseFloat(e.target.value) || 0)
                      setAddCartonsCount(c)
                      setAddOdooPieceQty(Number((c * addCartonSize).toFixed(2)))
                    }}
                    className="h-9 bg-white text-center font-bold text-xs border-blue-300"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-8 bg-white"
                    onClick={() => {
                      const nextC = Math.floor(addCartonsCount) + 1
                      setAddCartonsCount(nextC)
                      setAddOdooPieceQty(Number((nextC * addCartonSize).toFixed(2)))
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* 4. Quantity by Pieces (Odoo) */}
              <div className="md:col-span-1 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-emerald-800">
                  بالحبة / Pcs:
                </label>
                <Input
                  type="number"
                  min={1}
                  value={addOdooPieceQty}
                  onChange={(e) => {
                    const pcs = Math.max(0, parseFloat(e.target.value) || 0)
                    setAddOdooPieceQty(pcs)
                    setAddCartonsCount(
                      addCartonSize > 0 ? Number((pcs / addCartonSize).toFixed(2)) : pcs
                    )
                  }}
                  className="h-9 bg-white text-center font-bold text-xs border-emerald-400"
                />
              </div>

              {/* 5. Submit Add Button */}
              <div className="md:col-span-2">
                <Button
                  type="button"
                  onClick={handleAddProductToBranches}
                  disabled={isAddingProduct || !addSelectedProduct || addTargetRequestIds.length === 0}
                  className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5"
                >
                  {isAddingProduct ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>
                    إضافة ({addTargetRequestIds.length}) / Add
                  </span>
                </Button>
              </div>
            </div>

            {/* Target Branches Selector (when multiple branches/invoices are open) */}
            {distinctInvoices.length > 1 && (
              <div className="pt-2 border-t border-indigo-200/80 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-indigo-950">
                  الفروع المستهدفة للإضافة / Target Branches:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAddTargetRequestIds(
                      addTargetRequestIds.length === distinctInvoices.length
                        ? []
                        : distinctInvoices.map((d) => d.id)
                    )
                  }
                  className="text-[11px] font-bold text-indigo-700 underline px-1.5"
                >
                  {addTargetRequestIds.length === distinctInvoices.length
                    ? "إلغاء تحديد الكل / Unselect All"
                    : "تحديد كل الفروع / Select All"}
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {distinctInvoices.map((inv) => {
                    const checked = addTargetRequestIds.includes(inv.id)
                    return (
                      <label
                        key={inv.id}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] cursor-pointer transition-colors ${
                          checked
                            ? "bg-indigo-600 text-white border-indigo-600 font-bold"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAddTargetRequestIds((prev) => [...prev, inv.id])
                            } else {
                              setAddTargetRequestIds((prev) =>
                                prev.filter((id) => id !== inv.id)
                              )
                            }
                          }}
                        />
                        <span>
                          {inv.branchName} ({inv.invoiceName})
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer (RTL: first item is on the Right, second item is on the Left) */}
        <div className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 w-full" dir="rtl">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsAddPanelOpen((prev) => !prev)}
            className={`font-bold text-xs gap-1.5 shadow-sm bg-white text-black border-2 ${
              isAddPanelOpen
                ? "border-slate-800 hover:bg-slate-50"
                : "border-indigo-600 hover:bg-indigo-50"
            }`}
          >
            <PlusCircle className="h-4 w-4 text-indigo-600" />
            <span>
              {isAddPanelOpen
                ? "إغلاق نافذة الإضافة / Close Add"
                : "+ إضافة منتج للفروع / Add Product"}
            </span>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isBulkSaving}>
              إغلاق / Close
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveAll}
              disabled={isBulkSaving || loading || stats.pendingChangesCount === 0}
              className="bg-white text-black border-2 border-emerald-600 hover:bg-emerald-50 font-bold gap-2"
            >
              {isBulkSaving ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              <span>
                تحديث الكل دفعة واحدة / Update All ({stats.pendingChangesCount})
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
