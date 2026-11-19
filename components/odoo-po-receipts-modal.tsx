"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Loader2,
  PackageCheck,
  Search,
  RefreshCw,
  Printer,
  FileSpreadsheet,
  CheckCircle,
  Eye,
  Plus,
  Minus,
  X,
  AlertTriangle,
  Building2,
  Calendar,
  FileText,
  Save,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { db } from "@/lib/db"
import { useLiveQuery } from "dexie-react-hooks"
import { getSafeImageSrc } from "@/lib/utils"
import {
  generateOdooPOReceiptPDF,
  type POReceiptPrintItem,
} from "@/lib/odoo-po-receipt-pdf-generator"
import { fetchOdooApi } from "@/lib/odoo-client"

interface POReceipt {
  id: number
  name: string
  origin: string | false
  partner_id: [number, string] | false
  picking_type_id: [number, string] | false
  scheduled_date: string | false
  date_done: string | false
  create_date: string
  write_date: string
  state: "draft" | "waiting" | "confirmed" | "assigned" | "done" | "cancel"
  priority: string
  move_ids_without_package?: number[]
}

interface POReceiptLine {
  id: number
  picking_id?: [number, string] | number
  product_id: [number, string] | false
  description: string
  demand: number
  quantity: number
  received_qty?: number
  product_uom_id: [number, string] | false
  product_packaging_id?: [number, string] | false
  product_packaging_qty?: number
  state?: string
  date?: string
  picked?: boolean
  quantityPerCarton?: number
  warehouseUnit?: string
}

function WebsiteProductImage({
  productCode,
  className = "w-9 h-9 rounded-md object-cover border bg-white flex-shrink-0",
}: {
  productCode: string
  className?: string
}) {
  const cleanCode = (productCode || "").trim().replace(/\.0$/, "").replace(/\s+/g, "")
  const product = useLiveQuery(
    () => (cleanCode ? db.products.where("productCode").equals(cleanCode).first() : undefined),
    [cleanCode]
  )
  const [src, setSrc] = useState<string>("")

  useEffect(() => {
    let active = true
    if (!product?.image) {
      setSrc("")
      return
    }
    if (product.image === "DB_IMAGE") {
      db.productImages.get(product.id).then(async (rec) => {
        if (!active) return
        if (rec?.data) {
          setSrc(getSafeImageSrc(rec.data))
        } else {
          setSrc("")
        }
      })
    } else {
      setSrc(getSafeImageSrc(product.image))
    }
    return () => {
      active = false
    }
  }, [product?.id, product?.image])

  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center text-[9px] text-slate-400 border-dashed`}>
        No Img
      </div>
    )
  }

  return <img src={src} alt={cleanCode} className={className} onError={() => setSrc("")} />
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
      .replace(/^[\s\-/|–—:*]+|[\s\-/|–—:*]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    const withoutUnits = stripped
      .replace(/\b(?:kg|gm|g|ml|l|ltr|pcs|pc|box|ctn|pack|oz|cm|mm)\b/gi, "")
      .trim()
    if (/[a-zA-Z]{3,}/.test(withoutUnits)) {
      name = stripped
    }
  }
  return name || rawName
}

interface OdooPOReceiptsModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenExcelReceiveModal?: (receiptIds: number[]) => void
}

export function OdooPOReceiptsModal({
  isOpen,
  onClose,
  onOpenExcelReceiveModal,
}: OdooPOReceiptsModalProps) {
  const { toast } = useToast()

  // Receipts List State
  const [receipts, setReceipts] = useState<POReceipt[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [stateTab, setStateTab] = useState<"action_needed" | "ready" | "waiting" | "done" | "all">(
    "action_needed"
  )
  const [searchQuery, setSearchQuery] = useState("")

  // Single Receipt Detail State
  const [selectedReceipt, setSelectedReceipt] = useState<POReceipt | null>(null)
  const [lines, setLines] = useState<POReceiptLine[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [savingLines, setSavingLines] = useState(false)
  const [validating, setValidating] = useState(false)
  const [printingPdf, setPrintingPdf] = useState(false)

  const fetchReceipts = async () => {
    setLoading(true)
    try {
      const q = searchQuery.trim()
      const url = `/api/odoo/po-receipts?state=${stateTab}&search=${encodeURIComponent(q)}&limit=100`
      const res = await fetchOdooApi(url, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch PO receipts from Odoo")
      }
      setReceipts(data.receipts || [])
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to load receipts",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchReceipts()
    }
  }, [isOpen, stateTab])

  // Open detail for a specific receipt
  const handleOpenDetail = async (receipt: POReceipt) => {
    setSelectedReceipt(receipt)
    setDetailLoading(true)
    try {
      const res = await fetchOdooApi(`/api/odoo/po-receipts?id=${receipt.id}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load receipt details")
      }

      // Enrich lines with website product info for pack size and carton units
      const enrichedLines: POReceiptLine[] = await Promise.all(
        (data.lines || []).map(async (line: any) => {
          const lineName = line.product_id ? line.product_id[1] : line.description || ""
          const matchCode = lineName.match(/\[(.*?)\]/)
          const code = matchCode ? matchCode[1].trim() : ""

          let quantityPerCarton = 1
          let warehouseUnit = "Carton"

          if (code) {
            const cleanCode = code.replace(/\.0$/, "").replace(/\s+/g, "")
            const websiteProduct = await db.products
              .where("productCode")
              .equals(cleanCode)
              .first()
            if (websiteProduct) {
              quantityPerCarton = Math.max(1, Number(websiteProduct.quantityPerCarton) || 1)
              warehouseUnit = websiteProduct.unit || "Carton"
            }
          }

          // If pack size wasn't in DB, try matching text like 500pcs or *500
          if (quantityPerCarton <= 1) {
            const pcsMatch = lineName.match(/(\d+)\s*(?:pcs|pc|pieces|حبة|قطعة)\b/i)
            if (pcsMatch && Number(pcsMatch[1]) > 1) {
              quantityPerCarton = Number(pcsMatch[1])
            }
          }

          return {
            ...line,
            quantityPerCarton,
            warehouseUnit,
          }
        })
      )

      setLines(enrichedLines)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not load receipt lines",
        variant: "destructive",
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleUpdateLineQty = (moveId: number, newQty: number) => {
    const safeQty = Math.max(0, Number(newQty) || 0)
    setLines((prev) =>
      prev.map((l) => (l.id === moveId ? { ...l, quantity: Number(safeQty.toFixed(2)) } : l))
    )
  }

  const handleSaveLines = async () => {
    if (!selectedReceipt) return
    setSavingLines(true)
    try {
      const payload = {
        id: selectedReceipt.id,
        lines: lines.map((l) => ({ moveId: l.id, quantity: l.quantity })),
      }
      const res = await fetchOdooApi(`/api/odoo/po-receipts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save quantities")
      }
      toast({
        title: "Saved",
        description: "Received quantities updated successfully in Odoo",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not save received quantities",
        variant: "destructive",
      })
    } finally {
      setSavingLines(false)
    }
  }

  const handleValidateReceipt = async () => {
    if (!selectedReceipt) return
    if (!confirm(`Are you sure you want to validate receipt ${selectedReceipt.name} in Odoo?`)) {
      return
    }

    setValidating(true)
    try {
      const payload = {
        id: selectedReceipt.id,
        action: "validate",
        lines: lines.map((l) => ({ moveId: l.id, quantity: l.quantity })),
        createBackorder: false,
      }
      const res = await fetchOdooApi(`/api/odoo/po-receipts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to validate receipt in Odoo")
      }

      toast({
        title: "Validated Successfully! ✅",
        description: `Receipt ${selectedReceipt.name} is now DONE in Odoo.`,
      })

      // Update state locally
      setSelectedReceipt((prev) => (prev ? { ...prev, state: "done" } : null))
      setReceipts((prev) =>
        prev.map((r) => (r.id === selectedReceipt.id ? { ...r, state: "done" } : r))
      )
    } catch (err: any) {
      toast({
        title: "Validation Error",
        description: err.message || "Failed to validate receipt",
        variant: "destructive",
      })
    } finally {
      setValidating(false)
    }
  }

  const handlePrintReceiptPdf = async (targetReceipts: POReceipt[]) => {
    if (targetReceipts.length === 0) return
    setPrintingPdf(true)
    try {
      const ids = targetReceipts.map((r) => r.id)
      const res = await fetchOdooApi("/api/odoo/po-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch moves for PDF printing")
      }

      const rawLines: any[] = data.lines || []
      const printItems: POReceiptPrintItem[] = rawLines.map((l: any) => {
        const pId = Array.isArray(l.picking_id) ? l.picking_id[0] : Number(l.picking_id)
        const parentReceipt = targetReceipts.find((r) => r.id === pId)

        const lineName = Array.isArray(l.product_id) ? l.product_id[1] : l.description || ""
        const matchCode = lineName.match(/\[(.*?)\]/)
        const code = matchCode ? matchCode[1].trim() : ""
        const cleanName = lineName.replace(/^\[.*?\]\s*/, "").trim()

        const vendor = parentReceipt?.partner_id ? parentReceipt.partner_id[1] : ""
        const poNum = parentReceipt?.origin ? parentReceipt.origin : ""
        const rName = parentReceipt?.name || (Array.isArray(l.picking_id) ? l.picking_id[1] : `#${pId}`)

        return {
          receiptNumber: rName,
          poNumber: poNum,
          vendorName: vendor,
          scheduledDate: parentReceipt?.scheduled_date ? String(parentReceipt.scheduled_date) : "-",
          effectiveDate: parentReceipt?.date_done ? String(parentReceipt.date_done) : undefined,
          receiptStatus: parentReceipt?.state,
          productCode: code,
          productName: cleanName,
          demandQty: Number(l.demand) || Number(l.quantity) || 0,
          receivedQty: Number(l.received_qty) || Number(l.quantity) || 0,
          odooUnit: Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : "Units",
        }
      })

      await generateOdooPOReceiptPDF(printItems, "Goods Receipt Note (GRN)")
    } catch (err: any) {
      toast({
        title: "Print Error",
        description: err.message || "Failed to generate receipt PDF",
        variant: "destructive",
      })
    } finally {
      setPrintingPdf(false)
    }
  }

  const translateState = (state: string) => {
    switch (state) {
      case "assigned":
        return { label: "Ready / جاهز للاستلام", color: "bg-emerald-100 text-emerald-800 border-emerald-300" }
      case "confirmed":
      case "waiting":
        return { label: "Waiting / في الانتظار", color: "bg-amber-100 text-amber-800 border-amber-300" }
      case "done":
        return { label: "Done / تم الاستلام", color: "bg-blue-100 text-blue-800 border-blue-300" }
      case "draft":
        return { label: "Draft / مسودة", color: "bg-slate-100 text-slate-800 border-slate-300" }
      case "cancel":
        return { label: "Canceled / ملغي", color: "bg-red-100 text-red-800 border-red-300" }
      default:
        return { label: state, color: "bg-slate-100 text-slate-800 border-slate-300" }
    }
  }

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      const nameMatch = r.name && r.name.toLowerCase().includes(q)
      const originMatch = r.origin && r.origin.toLowerCase().includes(q)
      const vendorMatch = r.partner_id && r.partner_id[1] && r.partner_id[1].toLowerCase().includes(q)
      return nameMatch || originMatch || vendorMatch
    })
  }, [receipts, searchQuery])

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="!max-w-[96vw] w-[96vw] max-h-[94vh] flex flex-col overflow-hidden"
          dir="rtl"
        >
          <DialogHeader className="border-b pb-3 text-right">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                  <PackageCheck className="w-5 h-5 text-emerald-600" />
                  <span>استلام مشتريات المستودع (PO Receipts) • 01000 Shafa</span>
                  <Badge variant="outline" className="bg-white text-black border-emerald-600 text-xs">
                    {filteredReceipts.length} عمليات استلام
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  عرض أوامر استلام المشتريات (MRSHF/IN/...)، مطابقة الأصناف بوحدات الكرتون، اعتماد الاستلام وتحديث ملف المخزون.
                </DialogDescription>
              </div>

              {/* Top Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedIds.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={printingPdf}
                      onClick={() => {
                        const target = receipts.filter((r) => selectedIds.includes(r.id))
                        handlePrintReceiptPdf(target)
                      }}
                      className="h-8 gap-1.5 bg-white border-2 border-emerald-600 text-black hover:bg-emerald-50 font-bold"
                    >
                      {printingPdf ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <Printer className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      Print Selected ({selectedIds.length})
                    </Button>

                    {onOpenExcelReceiveModal && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenExcelReceiveModal(selectedIds)
                          onClose()
                        }}
                        className="h-8 gap-1.5 bg-white border-2 border-blue-600 text-black hover:bg-blue-50 font-bold"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                        Add to Excel Stock ({selectedIds.length})
                      </Button>
                    )}
                  </>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchReceipts}
                  disabled={loading}
                  className="h-8 gap-1.5 bg-white text-black font-semibold"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 mt-1 border-t">
              {/* State Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                {[
                  { id: "action_needed", label: "تحتاج انتباهك / Action Needed" },
                  { id: "ready", label: "جاهزة / Ready" },
                  { id: "waiting", label: "في الانتظار / Waiting" },
                  { id: "done", label: "مكتملة / Done" },
                  { id: "all", label: "كافة الاستلامات / All" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStateTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-md font-bold transition-colors whitespace-nowrap border ${
                      stateTab === tab.id
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative w-full md:w-80">
                <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="بحث برقم الاستلام أو أمر الشراء (P00...) أو المورد..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchReceipts()}
                  className="pr-8 h-8 text-xs bg-white"
                />
              </div>
            </div>
          </DialogHeader>

          {/* Receipts Table */}
          <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <span className="text-xs font-semibold">
                  جاري جلب سندات استلام المشتريات من Odoo...
                </span>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                لا توجد سندات استلام مطابقة للبحث في هذا القسم.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-100 border-b shadow-sm text-slate-800">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-10 border-l">
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.length === filteredReceipts.length &&
                          filteredReceipts.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredReceipts.map((r) => r.id))
                          } else {
                            setSelectedIds([])
                          }
                        }}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3 text-right border-l w-48">
                      رقم سند الاستلام / Reference
                    </th>
                    <th className="py-2.5 px-3 text-right border-l w-36">
                      أمر الشراء / Source PO
                    </th>
                    <th className="py-2.5 px-3 text-right border-l min-w-[240px]">
                      المورد / Vendor
                    </th>
                    <th className="py-2.5 px-3 text-center border-l w-36">
                      تاريخ الاستلام / Date
                    </th>
                    <th className="py-2.5 px-3 text-center border-l w-36">
                      الحالة / Status
                    </th>
                    <th className="py-2.5 px-3 text-center w-32">
                      الإجراءات / Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredReceipts.map((r) => {
                    const st = translateState(r.state)
                    const isSelected = selectedIds.includes(r.id)

                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors hover:bg-slate-50/80 ${
                          r.state === "assigned"
                            ? "bg-emerald-50/20"
                            : r.state === "done"
                            ? "bg-slate-50/40"
                            : ""
                        }`}
                      >
                        <td className="py-2.5 px-2 text-center border-l">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds((prev) => [...prev, r.id])
                              } else {
                                setSelectedIds((prev) => prev.filter((id) => id !== r.id))
                              }
                            }}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3 border-l font-bold text-slate-900" dir="ltr">
                          {r.name}
                        </td>
                        <td className="py-2.5 px-3 border-l font-semibold text-blue-700" dir="ltr">
                          {r.origin || "-"}
                        </td>
                        <td className="py-2.5 px-3 border-l">
                          <div className="font-semibold text-slate-800 line-clamp-1">
                            {r.partner_id ? r.partner_id[1] : "-"}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center border-l text-slate-600" dir="ltr">
                          {r.date_done
                            ? new Date(r.date_done).toLocaleDateString("en-GB")
                            : r.scheduled_date
                            ? new Date(r.scheduled_date).toLocaleDateString("en-GB")
                            : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center border-l">
                          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${st.color}`}>
                            {st.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDetail(r)}
                              className="h-7 px-2 text-[11px] gap-1 bg-white border-slate-300 hover:bg-slate-50 font-bold"
                              title="عرض تفاصيل الاستلام واعتماد البضاعة"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              استلام / تفاصيل
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Single Receipt Detail Modal (Receive, Validate, Adjust Qty) */}
      <Dialog open={!!selectedReceipt} onOpenChange={(open) => !open && setSelectedReceipt(null)}>
        <DialogContent
          className="!max-w-[95vw] w-[95vw] max-h-[94vh] flex flex-col overflow-hidden"
          dir="rtl"
        >
          {selectedReceipt && (
            <>
              <DialogHeader className="border-b pb-3 text-right">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                      <span>سند استلام:</span>
                      <span className="font-mono text-emerald-700 font-extrabold" dir="ltr">
                        {selectedReceipt.name}
                      </span>
                      {selectedReceipt.origin && (
                        <Badge variant="outline" className="bg-white border-blue-500 text-blue-800 text-xs">
                          PO: {selectedReceipt.origin}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${translateState(selectedReceipt.state).color}`}
                      >
                        {translateState(selectedReceipt.state).label}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs mt-1 flex items-center gap-3 text-slate-600 flex-wrap">
                      <span>المورد: <strong className="text-slate-900">{selectedReceipt.partner_id ? selectedReceipt.partner_id[1] : "-"}</strong></span>
                      <span>•</span>
                      <span>المستودع المستلم: <strong>01000 - Main Raw Materials & Packaging W.H - Shafa: Receipts</strong></span>
                      {selectedReceipt.scheduled_date && (
                        <>
                          <span>•</span>
                          <span>الموعد المجدول: <strong>{String(selectedReceipt.scheduled_date)}</strong></span>
                        </>
                      )}
                    </DialogDescription>
                  </div>

                  {/* Actions for this Receipt */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintReceiptPdf([selectedReceipt])}
                      disabled={printingPdf || detailLoading}
                      className="h-8 gap-1.5 bg-white border-emerald-600 text-black hover:bg-emerald-50 font-bold"
                    >
                      {printingPdf ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      ) : (
                        <Printer className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                      Print Receipt (PDF)
                    </Button>

                    {onOpenExcelReceiveModal && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenExcelReceiveModal([selectedReceipt.id])
                          setSelectedReceipt(null)
                          onClose()
                        }}
                        className="h-8 gap-1.5 bg-white border-blue-600 text-black hover:bg-blue-50 font-bold"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                        Add to Excel Stock
                      </Button>
                    )}

                    {selectedReceipt.state !== "done" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveLines}
                          disabled={savingLines || detailLoading}
                          className="h-8 gap-1.5 bg-white border-slate-400 text-black hover:bg-slate-50 font-bold"
                        >
                          {savingLines ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          حفظ التعديلات
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleValidateReceipt}
                          disabled={validating || detailLoading}
                          className="h-8 gap-1.5 bg-white border-2 border-emerald-600 hover:bg-emerald-50 text-black font-extrabold shadow-sm"
                        >
                          {validating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          اعتماد الاستلام في أودو (Validate)
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Products Table */}
              <div className="flex-1 overflow-y-auto border rounded-lg bg-white my-2">
                {detailLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                    <span className="text-xs font-semibold">جاري جلب أصناف أمر الشراء...</span>
                  </div>
                ) : lines.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    لا توجد أصناف في هذا السند.
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-100 border-b shadow-sm text-slate-800">
                      <tr>
                        <th className="py-2.5 px-2 text-center w-10 border-l">#</th>
                        <th className="py-2.5 px-2 text-center w-14 border-l">الصورة</th>
                        <th className="py-2.5 px-3 text-right border-l min-w-[280px]">اسم الصنف / Product Name</th>
                        <th className="py-2.5 px-2 text-center border-l w-32">الكمية المطلوبة (Odoo)</th>
                        <th className="py-2.5 px-2 text-center border-l w-48">الكمية المستلمة (Odoo)</th>
                        <th className="py-2.5 px-2 text-center border-l w-40">معادلة وحدة الموقع (الكرتون)</th>
                        <th className="py-2.5 px-2 text-center w-28">حالة السطر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line, idx) => {
                        const lineName = line.product_id ? line.product_id[1] : line.description || ""
                        const matchCode = lineName.match(/\[(.*?)\]/)
                        const code = matchCode ? matchCode[1].trim() : ""
                        const cleanName = extractCleanEnglishName(lineName)
                        const odooUnit = line.product_uom_id ? line.product_uom_id[1] : "Units"

                        const packSize = line.quantityPerCarton || 1
                        const whQty = Number((line.quantity / Math.max(1, packSize)).toFixed(2))

                        const isDone = selectedReceipt.state === "done"

                        return (
                          <tr key={line.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2 px-2 text-center font-bold text-slate-600 border-l">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-2 text-center border-l">
                              <div className="flex justify-center">
                                <WebsiteProductImage productCode={code} />
                              </div>
                            </td>
                            <td className="py-2 px-3 border-l">
                              <div className="font-bold text-slate-900 text-xs leading-snug" dir="ltr">
                                {cleanName}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {code && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-white text-black font-semibold">
                                    [{code}]
                                  </span>
                                )}
                                {packSize > 1 && (
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    (الشد: {packSize} {odooUnit}/{line.warehouseUnit || "كرتون"})
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Demand Qty */}
                            <td className="py-2 px-2 text-center border-l font-bold text-slate-700">
                              <span className="text-sm text-blue-700">{line.demand}</span>{" "}
                              <span className="text-[10px] text-slate-500">{odooUnit}</span>
                            </td>

                            {/* Received Qty (Editable) */}
                            <td className="py-2 px-2 text-center border-l">
                              {isDone ? (
                                <div className="font-extrabold text-sm text-emerald-700">
                                  {line.quantity}{" "}
                                  <span className="text-[10px] text-slate-500 font-normal">{odooUnit}</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 bg-white"
                                    onClick={() => handleUpdateLineQty(line.id, line.quantity - 1)}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    step="any"
                                    min={0}
                                    dir="ltr"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      handleUpdateLineQty(line.id, parseFloat(e.target.value))
                                    }
                                    className="w-24 px-1.5 h-7 text-center font-bold text-xs bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none border-blue-400 text-blue-900"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 bg-white"
                                    onClick={() => handleUpdateLineQty(line.id, line.quantity + 1)}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </td>

                            {/* Warehouse Unit Converted */}
                            <td className="py-2 px-2 text-center border-l">
                              <div className="font-extrabold text-sm text-purple-700">
                                {whQty}{" "}
                                <span className="text-[11px] font-bold text-slate-700">
                                  {line.warehouseUnit || "كرتون"}
                                </span>
                              </div>
                            </td>

                            {/* Line status */}
                            <td className="py-2 px-2 text-center">
                              {line.quantity >= line.demand ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                                  مكتمل ✔️
                                </Badge>
                              ) : line.quantity > 0 ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">
                                  استلام جزئي ({line.quantity}/{line.demand})
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-300 text-[10px]">
                                  لم يُستلم
                                </Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
