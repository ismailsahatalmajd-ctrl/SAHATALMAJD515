"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Loader2,
  Download,
  X,
  Search,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Unlink,
  Plus,
  Minus,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import ExcelJS from "exceljs"
import { db } from "@/lib/db"
import { useLiveQuery } from "dexie-react-hooks"
import { getSafeImageSrc } from "@/lib/utils"

interface OdooExcelDeductionModalProps {
  isOpen: boolean
  onClose: () => void
  selectedIds: number[]
  fetchLinesForIds: (ids: number[]) => Promise<any[]>
  invoiceType?: string
  mode?: "deduct" | "receive"
}

interface InvoiceDeductionItem {
  id: string
  productCode: string
  productName: string
  odooQty: number
  odooUnit: string
  quantityPerCarton: number
  originalWarehouseQty: number
  disbursedQty: number // Editable disbursed quantity (in warehouse unit)
  warehouseUnit: string
  matchedExcelRowNumber: number | null
  matchType: "auto" | "manual" | "unmatched"
  isDeleted: boolean
  date?: string
  origin?: string
}

interface ExcelColumnMeta {
  colNumber: number
  colLetter: string
  title: string
}

interface ExcelRowData {
  rowNumber: number
  code: string
  rawCode: string
  name: string
  rawName?: string
  unit?: string
  packSize?: number
  currentStock: number
  stockIsFormula: boolean
  stockFormula: string
  currentIssues: number
  issuesIsFormula: boolean
  issuesFormula: string
  rawRowValues: Record<number, number>
}

function extractPackSizeFromText(text: string): number | null {
  if (!text) return null
  // 1. Pattern like "500pcs", "500 pcs", "500 حبة", "180pc"
  const pcsMatch = text.match(/(\d+)\s*(?:pcs|pc|pieces|حبة|حبه|قطعة|عدد)\b/i)
  if (pcsMatch) {
    const n = Number(pcsMatch[1])
    if (n > 1 && n <= 20000) return n
  }
  // 2. Pattern like "260ml*500" or "12oz * 1000" or "*500" at end
  const multMatch =
    text.match(/\b\d+(?:\.\d+)?\s*(?:ml|g|kg|oz|l|لتر|مل|جم|كجم|cm|mm)?\s*[*×xX]\s*(\d+)\b/i) ||
    text.match(/[*×xX]\s*(\d+)\s*$/)
  if (multMatch) {
    const n = Number(multMatch[1])
    if (n > 1 && n <= 20000) return n
  }
  return null
}

async function resolveUnitAndPackForProduct(params: {
  targetCode: string
  excelRow?: ExcelRowData
  fallbackCode?: string
  invoiceProductName: string
  odooUnit: string
}): Promise<{ quantityPerCarton: number; warehouseUnit: string }> {
  const cleanTarget = normalizeCode(params.targetCode)
  const cleanFallback = normalizeCode(params.fallbackCode || "")

  let websiteProduct = cleanTarget
    ? await db.products.where("productCode").equals(cleanTarget).first()
    : undefined

  if (!websiteProduct && cleanFallback && cleanFallback !== cleanTarget) {
    websiteProduct = await db.products
      .where("productCode")
      .equals(cleanFallback)
      .first()
  }

  // Unit priority: Linked Website Product Unit OR Linked Excel Row Unit -> fallback to Odoo unit
  const warehouseUnit =
    (params.excelRow?.unit && params.excelRow.unit.trim()) ||
    (websiteProduct?.unit && websiteProduct.unit.trim()) ||
    params.odooUnit ||
    "Carton"

  let quantityPerCarton = Number(websiteProduct?.quantityPerCarton) || 0

  if (quantityPerCarton <= 1 && params.excelRow?.packSize && params.excelRow.packSize > 1) {
    quantityPerCarton = params.excelRow.packSize
  }

  if (quantityPerCarton <= 1) {
    const isContainerUnit = /كرتون|box|carton|ctn|ربطة|شدة|باكيت|كيس|درزن|pack/i.test(
      warehouseUnit
    )
    const isSingleOdooUnit = /unit|units|حبة|حبه|قطعة|pcs|pc/i.test(
      params.odooUnit || "Units"
    )
    if (isContainerUnit && isSingleOdooUnit) {
      const fromExcelName = extractPackSizeFromText(params.excelRow?.name || "")
      const fromInvoiceName = extractPackSizeFromText(params.invoiceProductName || "")
      if (fromExcelName && fromExcelName > 1) {
        quantityPerCarton = fromExcelName
      } else if (fromInvoiceName && fromInvoiceName > 1) {
        quantityPerCarton = fromInvoiceName
      }
    }
  }

  return {
    quantityPerCarton: Math.max(1, quantityPerCarton || 1),
    warehouseUnit,
  }
}

function normalizeCode(val: any): string {
  if (val === null || val === undefined) return ""
  return String(val)
    .trim()
    .replace(/\.0$/, "")
    .replace(/\s+/g, "")
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
    // Ensure remaining Latin text has a real English word, not just a unit like "25 KG"
    const withoutUnits = stripped
      .replace(/\b(?:kg|gm|g|ml|l|ltr|pcs|pc|box|ctn|pack|oz|cm|mm)\b/gi, "")
      .trim()
    if (/[a-zA-Z]{3,}/.test(withoutUnits)) {
      name = stripped
    }
  }
  return name || rawName
}

function colNumberToLetter(col: number): string {
  let temp = 0
  let letter = ""
  let c = col
  while (c > 0) {
    temp = (c - 1) % 26
    letter = String.fromCharCode(temp + 65) + letter
    c = (c - temp - 1) / 26
  }
  return letter
}

function colLetterToNumber(letter: string): number {
  let col = 0
  const up = letter.toUpperCase()
  for (let i = 0; i < up.length; i++) {
    col = col * 26 + (up.charCodeAt(i) - 64)
  }
  return col
}

function formatReceiptDate(rawDate?: string): string {
  if (rawDate && typeof rawDate === "string") {
    const match = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (match) {
      const year = match[1]
      const month = parseInt(match[2], 10)
      const day = parseInt(match[3], 10)
      return `${day}/${month}/${year}`
    }
  }
  const d = rawDate ? new Date(rawDate) : new Date()
  const validD = isNaN(d.getTime()) ? new Date() : d
  const day = validD.getDate()
  const month = validD.getMonth() + 1
  const year = validD.getFullYear()
  return `${day}/${month}/${year}`
}

function extractCellTextValue(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ""
  const val = cell.value
  if (val === null || val === undefined) return ""
  if (typeof val === "object" && "richText" in val) {
    return ((val as any).richText || [])
      .map((t: any) => t.text || "")
      .join("")
      .replace(/\s+/g, " ")
      .trim()
  }
  if (typeof val === "object" && "result" in val) {
    return String((val as any).result ?? "").trim()
  }
  if (typeof val === "object" && "formula" in val) {
    return String((val as any).result ?? "").trim()
  }
  if (cell.text) {
    return String(cell.text).replace(/\s+/g, " ").trim()
  }
  return String(val).replace(/\s+/g, " ").trim()
}

// Resolve formula string for a cell (handling sharedFormula from master cell)
function resolveCellFormulaString(
  worksheet: ExcelJS.Worksheet,
  cell: ExcelJS.Cell,
  rowNumber: number
): string {
  const val = cell.value
  if (!val || typeof val !== "object") return ""

  if ("formula" in val && (val as any).formula) {
    return String((val as any).formula)
  }

  if ("sharedFormula" in val && (val as any).sharedFormula) {
    const masterRef = String((val as any).sharedFormula)
    const matchMaster = masterRef.match(/^([A-Z]+)(\d+)$/i)
    if (matchMaster) {
      const masterRowNum = parseInt(matchMaster[2], 10)
      const masterCell = worksheet.getCell(masterRef)
      const masterVal = masterCell?.value
      const masterFormula =
        masterVal && typeof masterVal === "object" && "formula" in masterVal
          ? String((masterVal as any).formula || "")
          : ""
      if (masterFormula) {
        return masterFormula.replace(
          /(\$?[A-Z]+)(\$?)(\d+)/gi,
          (full, colPart, dollarRow, rNumStr) => {
            if (dollarRow === "$") return full
            const rNum = parseInt(rNumStr, 10)
            const diff = rowNumber - masterRowNum
            return `${colPart}${rNum + diff}`
          }
        )
      }
    }
  }
  return ""
}

// Fallback evaluator only when Excel cell has no cached <v> result
function evaluateFormulaOnRow(
  worksheet: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  rowNumber: number,
  formulaStr: string,
  depth: number = 0
): number | null {
  if (!formulaStr || depth > 3) return null
  if (formulaStr.includes("[") || formulaStr.includes("#REF!")) return null
  try {
    let expr = formulaStr.trim().replace(/^=/, "")

    expr = expr.replace(/SUM\(([^)]+)\)/gi, (_, inner) => {
      const parts = String(inner).split(",")
      let sum = 0
      for (const p of parts) {
        const rangeMatch = p
          .trim()
          .match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i)
        if (rangeMatch) {
          const c1 = colLetterToNumber(rangeMatch[1])
          const r1 = parseInt(rangeMatch[2], 10)
          const c2 = colLetterToNumber(rangeMatch[3])
          const r2 = parseInt(rangeMatch[4], 10)
          if (r1 === r2) {
            const targetRow = r1 === rowNumber ? row : worksheet.getRow(r1)
            for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
              const v = extractCellNumericValue(
                worksheet,
                targetRow,
                r1,
                targetRow.getCell(c),
                depth + 1
              )
              sum += v.num
            }
          }
        } else {
          const singleMatch = p.trim().match(/^\$?([A-Z]+)\$?(\d+)$/i)
          if (singleMatch) {
            const c = colLetterToNumber(singleMatch[1])
            const r = parseInt(singleMatch[2], 10)
            const targetRow = r === rowNumber ? row : worksheet.getRow(r)
            const v = extractCellNumericValue(
              worksheet,
              targetRow,
              r,
              targetRow.getCell(c),
              depth + 1
            )
            sum += v.num
          }
        }
      }
      return String(sum)
    })

    expr = expr.replace(/\$?([A-Z]+)\$?(\d+)/gi, (full, colLet, rStr) => {
      const c = colLetterToNumber(colLet)
      const r = parseInt(rStr, 10)
      if (c <= 0 || c > 200) return "0"
      const targetRow = r === rowNumber ? row : worksheet.getRow(r)
      const v = extractCellNumericValue(
        worksheet,
        targetRow,
        r,
        targetRow.getCell(c),
        depth + 1
      )
      return `(${v.num})`
    })

    if (/^[0-9+\-*/().\s]+$/.test(expr)) {
      const evaluated = Function(`"use strict"; return (${expr});`)()
      if (typeof evaluated === "number" && Number.isFinite(evaluated)) {
        return evaluated
      }
    }
  } catch {}
  return null
}

function extractCellNumericValue(
  worksheet: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  rowNumber: number,
  cell: ExcelJS.Cell,
  depth: number = 0
): {
  num: number
  isFormula: boolean
  formula: string
} {
  if (!cell) return { num: 0, isFormula: false, formula: "" }
  const val = cell.value
  if (val === null || val === undefined) {
    return { num: 0, isFormula: false, formula: "" }
  }
  if (typeof val === "number") {
    return { num: val, isFormula: false, formula: "" }
  }

  const isFormulaObj =
    typeof val === "object" &&
    ("formula" in val || "sharedFormula" in val)

  if (isFormulaObj) {
    const formulaStr = resolveCellFormulaString(worksheet, cell, rowNumber)
    const rawResult = (val as any).result ?? cell.result

    let cachedNum: number | null = null
    if (typeof rawResult === "number" && Number.isFinite(rawResult)) {
      cachedNum = rawResult
    } else if (
      typeof rawResult === "string" &&
      rawResult.trim() !== "" &&
      !rawResult.startsWith("#")
    ) {
      const p = parseFloat(rawResult.replace(/,/g, ""))
      if (Number.isFinite(p)) cachedNum = p
    }

    // Priority 1: Use Excel's own saved <v> cached result if available!
    // Priority 2: Fallback to formula evaluator if cachedNum is null.
    const finalNum =
      cachedNum !== null
        ? cachedNum
        : evaluateFormulaOnRow(worksheet, row, rowNumber, formulaStr, depth) ?? 0

    return {
      num: finalNum,
      isFormula: true,
      formula: formulaStr || "Formula",
    }
  }

  if (typeof val === "object" && "result" in val) {
    const rObj = val as { result?: any }
    const resNum =
      typeof rObj.result === "number"
        ? rObj.result
        : parseFloat(String(rObj.result ?? "0").replace(/,/g, "")) || 0
    return { num: resNum, isFormula: false, formula: "" }
  }

  const txt = extractCellTextValue(cell)
  if (!txt || txt === "-") {
    return { num: 0, isFormula: false, formula: "" }
  }
  const parsed = parseFloat(txt.replace(/,/g, ""))
  return {
    num: Number.isFinite(parsed) ? parsed : 0,
    isFormula: false,
    formula: "",
  }
}

function WebsiteProductImage({
  productCode,
  fallbackCode,
  className = "w-9 h-9 rounded-md object-cover border bg-white flex-shrink-0",
}: {
  productCode: string
  fallbackCode?: string
  className?: string
}) {
  const cleanCode = normalizeCode(productCode || "")
  const cleanFallback = normalizeCode(fallbackCode || "")
  const product = useLiveQuery(async () => {
    if (cleanCode) {
      const p = await db.products.where("productCode").equals(cleanCode).first()
      if (p) return p
    }
    if (cleanFallback && cleanFallback !== cleanCode) {
      return await db.products.where("productCode").equals(cleanFallback).first()
    }
    return undefined
  }, [cleanCode, cleanFallback])
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
          try {
            const { storage } = await import("@/lib/firebase")
            const { ref, getDownloadURL } = await import("firebase/storage")
            const storageRef = ref(storage, `product-images/${product.id}`)
            const url = await getDownloadURL(storageRef)
            if (active) setSrc(url)
            await db.productImages
              .put({ productId: product.id, data: url })
              .catch(() => {})
          } catch {
            if (active) setSrc("")
          }
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
      <div
        className={`${className} flex items-center justify-center text-[9px] text-slate-400 border-dashed`}
      >
        No Img
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={cleanCode}
      className={className}
      onError={() => setSrc("")}
    />
  )
}

function ExcelRowMatcherPopover({
  item,
  excelRows,
  matchedRow,
  onSelectRow,
}: {
  item: InvoiceDeductionItem
  excelRows: ExcelRowData[]
  matchedRow?: ExcelRowData
  onSelectRow: (rowNumber: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return excelRows.slice(0, 80)
    return excelRows
      .filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.rawName && r.rawName.toLowerCase().includes(q)) ||
          String(r.rowNumber).includes(q)
      )
      .slice(0, 80)
  }, [excelRows, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full text-right p-1.5 rounded-md border text-xs transition-colors flex items-center justify-between gap-1.5 ${
            matchedRow
              ? item.matchType === "manual"
                ? "bg-white border-blue-500 text-black hover:bg-blue-50/40"
                : "bg-white border-emerald-500 text-black hover:bg-emerald-50/40"
              : "bg-white border-red-400 text-red-700 hover:bg-red-50/40"
          }`}
          title="Click to change match or link another product from Excel"
        >
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            {matchedRow && (
              <WebsiteProductImage
                productCode={matchedRow.code}
                className="w-8 h-8 rounded object-cover border bg-white flex-shrink-0"
              />
            )}
            <div className="flex flex-col overflow-hidden flex-1">
              {matchedRow ? (
                <>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 bg-white text-black ${
                        item.matchType === "manual"
                          ? "border-blue-600"
                          : "border-emerald-600"
                      }`}
                    >
                      {item.matchType === "manual" ? "🔗 Manual Link" : "✅ Matched"} (Row #{matchedRow.rowNumber})
                    </Badge>
                    {matchedRow.rawCode && (
                      <span className="font-mono text-[10px] font-bold text-slate-700">
                        [{matchedRow.rawCode}]
                      </span>
                    )}
                  </div>
                  <span
                    className="font-semibold text-[11px] text-slate-900 mt-0.5 leading-snug line-clamp-2"
                    dir="ltr"
                  >
                    {matchedRow.name || `Item Row #${matchedRow.rowNumber}`}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-1 font-bold text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Unmatched — Click to link Excel product</span>
                </div>
              )}
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: "520px", maxWidth: "95vw" }}
      >
        <div className="flex flex-col max-h-[320px]" dir="rtl">
          <div className="p-2 border-b bg-slate-50 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search Excel items by name, code, or row #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8 h-7 text-xs bg-white"
              />
            </div>
            {matchedRow && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px] gap-1 text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => {
                  onSelectRow(null)
                  setOpen(false)
                }}
              >
                <Unlink className="w-3 h-3" />
                Unlink
              </Button>
            )}
          </div>
          <div
            className="overflow-y-auto flex-1 p-1 divide-y"
            onWheel={(e) => e.stopPropagation()}
          >
            {filteredRows.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching items found in Excel
              </div>
            ) : (
              filteredRows.map((r) => {
                const isSelected = matchedRow?.rowNumber === r.rowNumber
                return (
                  <button
                    key={r.rowNumber}
                    type="button"
                    onClick={() => {
                      onSelectRow(r.rowNumber)
                      setOpen(false)
                      setSearch("")
                    }}
                    className={`w-full text-right px-2.5 py-2 text-xs flex items-center justify-between gap-2.5 hover:bg-slate-100 rounded transition-colors ${
                      isSelected ? "bg-blue-50 font-bold" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                      <WebsiteProductImage
                        productCode={r.code}
                        className="w-9 h-9 rounded-md object-cover border bg-white flex-shrink-0"
                      />
                      <div className="flex flex-col overflow-hidden flex-1">
                        <span
                          className="truncate text-slate-900 font-semibold"
                          dir="ltr"
                        >
                          {r.name || `Unnamed (Row #${r.rowNumber})`}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                          <span className="font-mono font-semibold text-slate-700">
                            Code: {r.rawCode || "-"}
                          </span>
                          <span>•</span>
                          <span>Row #{r.rowNumber}</span>
                          {r.unit && (
                            <>
                              <span>•</span>
                              <span className="text-blue-700 font-semibold">
                                {r.unit}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end text-[10px] flex-shrink-0">
                      <span className="text-blue-700 font-semibold">
                        Issues: {r.currentIssues}
                      </span>
                      <span className="text-emerald-700 font-semibold">
                        Stock: {r.currentStock}
                      </span>
                    </div>
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

export function OdooExcelDeductionModal({
  isOpen,
  onClose,
  selectedIds,
  fetchLinesForIds,
  mode = "deduct",
}: OdooExcelDeductionModalProps) {
  const isReceiveMode = mode === "receive"
  const { toast } = useToast()

  // Excel Workbook & Columns state (stored by 1-based column number)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0)
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1)
  const [excelColumns, setExcelColumns] = useState<ExcelColumnMeta[]>([])
  const [excelCodeCol, setExcelCodeCol] = useState<number>(0)
  const [excelNameCol, setExcelNameCol] = useState<number>(0)
  const [excelStockCol, setExcelStockCol] = useState<number>(0)
  const [excelIssuesCol, setExcelIssuesCol] = useState<number>(0)
  const [appendExtraCols, setAppendExtraCols] = useState(false)

  // Extracted rows from the Excel sheet
  const [excelRows, setExcelRows] = useState<ExcelRowData[]>([])

  // Invoice items state
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceDeductionItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showDeleted, setShowDeleted] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // 1. Load & aggregate invoice lines when modal opens or selectedIds change
  useEffect(() => {
    if (!isOpen || selectedIds.length === 0) return
    let active = true

    const loadInvoiceLines = async () => {
      setLoadingInvoices(true)
      try {
        const allLines = await fetchLinesForIds(selectedIds)
        const map = new Map<
          string,
          {
            code: string
            name: string
            odooQty: number
            odooUnit: string
            date?: string
            origin?: string
          }
        >()

        for (const line of allLines) {
          const lineName = line.product_id
            ? line.product_id[1]
            : line.display_name || line.name || line.description || ""
          const matchCode = lineName.match(/\[(.*?)\]/)
          const rawCode = matchCode ? matchCode[1].trim() : ""
          const code = normalizeCode(rawCode)
          const cleanName = extractCleanEnglishName(lineName)
          const qty =
            Number(line.quantity || line.product_qty || line.qty_received) || 0

          if (qty <= 0) continue

          const key = code || cleanName
          if (!key) continue

          const lineDate = line.date || line.scheduled_date || line.date_done || ""
          const lineOrigin = line.origin || ""
          const odooUnit = line.product_uom_id
            ? line.product_uom_id[1]
            : "Units"
          const existing = map.get(key)
          if (existing) {
            existing.odooQty += qty
            if (!existing.date && lineDate) existing.date = lineDate
            if (!existing.origin && lineOrigin) existing.origin = lineOrigin
          } else {
            map.set(key, {
              code,
              name: cleanName,
              odooQty: qty,
              odooUnit,
              date: lineDate,
              origin: lineOrigin,
            })
          }
        }

        const items: InvoiceDeductionItem[] = []
        for (const [key, val] of map.entries()) {
          let quantityPerCarton = 1
          let warehouseUnit = ""

          if (val.code) {
            const websiteProduct = await db.products
              .where("productCode")
              .equals(val.code)
              .first()
            if (websiteProduct) {
              quantityPerCarton = Math.max(
                1,
                Number(websiteProduct.quantityPerCarton) || 1
              )
              warehouseUnit = websiteProduct.unit || "Carton"
            }
          }

          const whQty = Number(
            (val.odooQty / Math.max(1, quantityPerCarton)).toFixed(2)
          )

          items.push({
            id: key,
            productCode: val.code,
            productName: val.name,
            odooQty: Number(val.odooQty.toFixed(2)),
            odooUnit: val.odooUnit,
            quantityPerCarton,
            originalWarehouseQty: whQty,
            disbursedQty: whQty,
            warehouseUnit: warehouseUnit || val.odooUnit || "Carton",
            matchedExcelRowNumber: null,
            matchType: "unmatched",
            isDeleted: false,
            date: val.date,
            origin: val.origin,
          })
        }

        if (active) {
          setInvoiceItems(items)
        }
      } catch (err: any) {
        if (active) {
          toast({
            title: "خطأ",
            description: "فشل في جلب أصناف الفواتير المحددة",
            variant: "destructive",
          })
        }
      } finally {
        if (active) setLoadingInvoices(false)
      }
    }

    loadInvoiceLines()
    return () => {
      active = false
    }
  }, [isOpen, selectedIds])

  // 2. Smart Excel Header & Column Auto-Detector
  const parseWorksheetHeaders = async (
    file: File,
    sheetIdx: number,
    customHeaderRow?: number
  ) => {
    try {
      const buffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)

      const names = workbook.worksheets.map((ws) => ws.name)
      setSheetNames(names)

      const worksheet = workbook.worksheets[sheetIdx] || workbook.worksheets[0]
      if (!worksheet) {
        throw new Error("لم يتم العثور على ورقة عمل نشطة في الملف.")
      }

      // Detect header row automatically if not specified
      let targetHeaderRow = customHeaderRow || 1
      if (!customHeaderRow) {
        let bestRow = 1
        let maxTextCells = 0
        for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
          const row = worksheet.getRow(r)
          let count = 0
          row.eachCell((cell) => {
            const txt = extractCellTextValue(cell)
            if (txt && isNaN(Number(txt))) count++
          })
          if (count > maxTextCells) {
            maxTextCells = count
            bestRow = r
          }
        }
        targetHeaderRow = bestRow
        setHeaderRowNumber(targetHeaderRow)
      }

      const headerRow = worksheet.getRow(targetHeaderRow)
      const cols: ExcelColumnMeta[] = []
      const maxCol = Math.max(worksheet.columnCount, headerRow.cellCount)

      for (let colNumber = 1; colNumber <= maxCol; colNumber++) {
        const cell = headerRow.getCell(colNumber)
        const text = extractCellTextValue(cell)
        const colLetter = colNumberToLetter(colNumber)
        if (text) {
          cols.push({
            colNumber,
            colLetter,
            title: text,
          })
        }
      }

      setExcelColumns(cols)

      // Collect known invoice product codes to auto-detect which column holds the codes!
      const knownInvoiceCodes = new Set(
        invoiceItems.map((i) => normalizeCode(i.productCode)).filter(Boolean)
      )

      let detectedCodeCol = 0
      if (knownInvoiceCodes.size > 0) {
        let bestMatches = 0
        for (const col of cols) {
          let matches = 0
          for (
            let r = targetHeaderRow + 1;
            r <= Math.min(worksheet.rowCount, targetHeaderRow + 1600);
            r++
          ) {
            const val = normalizeCode(
              extractCellTextValue(worksheet.getRow(r).getCell(col.colNumber))
            )
            if (val && knownInvoiceCodes.has(val)) {
              matches++
            }
          }
          if (matches > bestMatches) {
            bestMatches = matches
            detectedCodeCol = col.colNumber
          }
        }
      }

      if (!detectedCodeCol) {
        const codeMatch = cols.find((c) => {
          const hL = c.title.toLowerCase()
          return (
            hL.includes("كود") ||
            hL.includes("رمز") ||
            hL.includes("code") ||
            hL.includes("sku") ||
            hL.includes("barcode") ||
            hL.includes("رقم الصنف")
          )
        })
        detectedCodeCol = codeMatch?.colNumber || cols[0]?.colNumber || 0
      }

      // Detect Product Name Column
      const nameMatch = cols.find((c) => {
        if (c.colNumber === detectedCodeCol) return false
        const hL = c.title.toLowerCase()
        return (
          hL.includes("اسم المنتج") ||
          hL.includes("product name") ||
          hL.includes("اسم الصنف") ||
          hL.includes("item name") ||
          hL.includes("البيان") ||
          hL.includes("اسم") ||
          hL.includes("name") ||
          hL.includes("description")
        )
      })
      const detectedNameCol = nameMatch?.colNumber || cols[1]?.colNumber || 0

      // Detect Issues / Disbursed Column (or Purchases / Inbound Column in receive mode)
      const issuesMatch = cols.find((c) => {
        const hL = c.title.toLowerCase()
        if (
          hL.includes("قيمة") ||
          hL.includes("value") ||
          hL.includes("سعر") ||
          hL.includes("issued value")
        ) {
          return false
        }
        if (isReceiveMode) {
          return (
            hL.includes("وارد") ||
            hL.includes("مشتريات") ||
            hL.includes("استلام") ||
            hL.includes("purchase") ||
            hL.includes("inbound") ||
            hL.includes("received")
          )
        }
        return (
          hL.includes("صرف") ||
          hL.includes("مصروف") ||
          hL.includes("منصرف") ||
          hL.includes("issues")
        )
      })
      const detectedIssuesCol = issuesMatch?.colNumber || 0

      // Detect Current / Closing Stock Column (عمود الرصيد الحالي / النهائي — NEVER Opening or Count or Value!)
      let bestStockCol = 0
      let bestStockScore = -9999

      for (const c of cols) {
        if (
          c.colNumber === detectedCodeCol ||
          c.colNumber === detectedNameCol ||
          c.colNumber === detectedIssuesCol
        ) {
          continue
        }
        const hL = c.title.toLowerCase()

        // Disqualify Opening stock, Physical Count (جرد), Diff (فرق), Value/Price, Inbound/Purchases, Units
        if (
          hL.includes("افتتاح") ||
          hL.includes("opening") ||
          hL.includes("أول المدة") ||
          hL.includes("اول المدة") ||
          hL.includes("جرد") ||
          hL.includes("count") ||
          hL.includes("فرق") ||
          hL.includes("diff") ||
          hL.includes("قيمة") ||
          hL.includes("value") ||
          hL.includes("سعر") ||
          hL.includes("price") ||
          hL.includes("وارد") ||
          hL.includes("مشتريات") ||
          hL.includes("purchase") ||
          hL.includes("وحدة") ||
          hL.includes("unit") ||
          hL.includes("شد") ||
          hL.includes("صرف") ||
          hL.includes("issues") ||
          hL.includes("تالف") ||
          hL.includes("مرتجع")
        ) {
          continue
        }

        let score = 0
        if (
          hL.includes("الرصيد الحالي") ||
          hL.includes("رصيد حالي") ||
          hL.includes("الرصيد النهائي") ||
          hL.includes("رصيد نهائي") ||
          hL.includes("current stock") ||
          hL.includes("closing stock")
        ) {
          score += 200
        } else if (
          hL.includes("نهائي") ||
          hL.includes("حالي") ||
          hL.includes("متبقي") ||
          hL.includes("ختامي") ||
          hL.includes("closing") ||
          hL.includes("current") ||
          hL.includes("ending") ||
          hL.includes("available") ||
          hL.includes("remaining") ||
          hL.includes("balance") ||
          hL.includes("on hand")
        ) {
          score += 120
        } else if (
          hL.includes("رصيد") ||
          hL.includes("مخزون") ||
          hL.includes("مخزن") ||
          hL.includes("stock") ||
          hL.includes("كمية") ||
          hL.includes("qty")
        ) {
          score += 70
        }

        if (score > 0) {
          if (detectedIssuesCol && c.colNumber > detectedIssuesCol) {
            score += 25
          }
          score += c.colNumber * 0.1

          if (score > bestStockScore) {
            bestStockScore = score
            bestStockCol = c.colNumber
          }
        }
      }

      setExcelCodeCol(detectedCodeCol)
      setExcelNameCol(detectedNameCol)
      setExcelIssuesCol(detectedIssuesCol)
      setExcelStockCol(bestStockCol)
    } catch (err: any) {
      toast({
        title: "خطأ",
        description:
          err.message ||
          "فشل قراءة ملف الإكسل. تأكد من صحة الملف وصيغة xlsx.",
        variant: "destructive",
      })
    }
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)
    setSelectedSheetIndex(0)
    await parseWorksheetHeaders(file, 0)
  }

  const clearExcelFile = () => {
    setExcelFile(null)
    setSheetNames([])
    setExcelColumns([])
    setExcelCodeCol(0)
    setExcelNameCol(0)
    setExcelStockCol(0)
    setExcelIssuesCol(0)
    setExcelRows([])
    setInvoiceItems((prev) =>
      prev.map((item) => ({
        ...item,
        matchedExcelRowNumber: null,
        matchType: "unmatched",
      }))
    )
  }

  // 3. Extract rows from Excel whenever column selections change, and auto-match with invoice items
  useEffect(() => {
    if (!excelFile || !excelCodeCol) {
      setExcelRows([])
      return
    }
    let active = true

    const extractRowsAndMatch = async () => {
      try {
        const buffer = await excelFile.arrayBuffer()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer)
        const worksheet =
          workbook.worksheets[selectedSheetIndex] || workbook.worksheets[0]
        if (!worksheet) return

        // Detect Unit column (Unit - الوحدة) & Pack column (الشد / Pack) in Excel
        const unitColMeta = excelColumns.find((c) => {
          const hL = c.title.toLowerCase()
          return hL.includes("وحدة") || hL.includes("الوحده") || hL.includes("unit")
        })
        const packColMeta = excelColumns.find((c) => {
          const hL = c.title.toLowerCase()
          return (
            hL.includes("الشد") ||
            hL.includes("حبة/كرتون") ||
            hL.includes("عبوة") ||
            hL.includes("pack") ||
            hL.includes("carton size")
          )
        })

        const rows: ExcelRowData[] = []
        const codeToRowMap = new Map<string, ExcelRowData>()
        const invoiceEnglishNameByCode = new Map<string, string>()
        for (const inv of invoiceItems) {
          const c = normalizeCode(inv.productCode)
          if (c && inv.productName && /[a-zA-Z]{3,}/.test(inv.productName)) {
            invoiceEnglishNameByCode.set(c, inv.productName)
          }
        }

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= headerRowNumber) return

          const rawCode = extractCellTextValue(row.getCell(excelCodeCol))
          const code = normalizeCode(rawCode)
          const rawName =
            excelNameCol > 0
              ? extractCellTextValue(row.getCell(excelNameCol))
              : ""
          let name = extractCleanEnglishName(rawName)
          if (/[\u0600-\u06FF]/.test(name) && code && invoiceEnglishNameByCode.has(code)) {
            name = invoiceEnglishNameByCode.get(code)!
          }

          if (!code && !name) return

          const unitText =
            unitColMeta && unitColMeta.colNumber > 0
              ? extractCellTextValue(row.getCell(unitColMeta.colNumber))
              : ""

          const packVal =
            packColMeta && packColMeta.colNumber > 0
              ? extractCellNumericValue(
                  worksheet,
                  row,
                  rowNumber,
                  row.getCell(packColMeta.colNumber)
                ).num
              : 0

          const stockInfo =
            excelStockCol > 0
              ? extractCellNumericValue(
                  worksheet,
                  row,
                  rowNumber,
                  row.getCell(excelStockCol)
                )
              : { num: 0, isFormula: false, formula: "" }

          const issuesInfo =
            excelIssuesCol > 0
              ? extractCellNumericValue(
                  worksheet,
                  row,
                  rowNumber,
                  row.getCell(excelIssuesCol)
                )
              : { num: 0, isFormula: false, formula: "" }

          const rawRowValues: Record<number, number> = {}
          for (const col of excelColumns) {
            const v = extractCellNumericValue(
              worksheet,
              row,
              rowNumber,
              row.getCell(col.colNumber)
            )
            rawRowValues[col.colNumber] = Number(v.num.toFixed(2))
          }

          const rowData: ExcelRowData = {
            rowNumber,
            code,
            rawCode: rawCode || code,
            name,
            rawName,
            unit: unitText || undefined,
            packSize: packVal > 1 ? packVal : undefined,
            currentStock: Number(stockInfo.num.toFixed(2)),
            stockIsFormula: stockInfo.isFormula,
            stockFormula: stockInfo.formula,
            currentIssues: Number(issuesInfo.num.toFixed(2)),
            issuesIsFormula: issuesInfo.isFormula,
            issuesFormula: issuesInfo.formula,
            rawRowValues,
          }

          rows.push(rowData)
          if (code && !codeToRowMap.has(code)) {
            codeToRowMap.set(code, rowData)
          }
        })

        if (!active) return
        setExcelRows(rows)

        // Auto-match invoice items by code and resolve unit/pack from the matched Excel row & DB
        const rowByNum = new Map<number, ExcelRowData>()
        for (const r of rows) rowByNum.set(r.rowNumber, r)

        setInvoiceItems((prev) => {
          // Kick off async unit/pack resolution for all matched rows
          Promise.all(
            prev.map(async (item) => {
              let matched: ExcelRowData | undefined
              let matchType: "auto" | "manual" | "unmatched" = "unmatched"

              if (
                item.matchType === "manual" &&
                item.matchedExcelRowNumber &&
                rowByNum.has(item.matchedExcelRowNumber)
              ) {
                matched = rowByNum.get(item.matchedExcelRowNumber)
                matchType = "manual"
              } else {
                const cleanItemCode = normalizeCode(item.productCode)
                matched = cleanItemCode
                  ? codeToRowMap.get(cleanItemCode)
                  : undefined
                matchType = matched ? "auto" : "unmatched"
              }

              if (!matched) {
                return {
                  ...item,
                  matchedExcelRowNumber: null,
                  matchType: "unmatched" as const,
                }
              }

              const resolved = await resolveUnitAndPackForProduct({
                targetCode: matched.code || item.productCode,
                excelRow: matched,
                fallbackCode: item.productCode,
                invoiceProductName: item.productName,
                odooUnit: item.odooUnit,
              })

              const newWhQty = Number(
                (
                  item.odooQty / Math.max(1, resolved.quantityPerCarton)
                ).toFixed(2)
              )
              const wasManuallyEditedQty =
                item.disbursedQty !== item.originalWarehouseQty

              return {
                ...item,
                matchedExcelRowNumber: matched.rowNumber,
                matchType,
                quantityPerCarton: resolved.quantityPerCarton,
                warehouseUnit: resolved.warehouseUnit,
                originalWarehouseQty: newWhQty,
                disbursedQty: wasManuallyEditedQty ? item.disbursedQty : newWhQty,
              }
            })
          ).then((updatedItems) => {
            if (active) setInvoiceItems(updatedItems)
          })

          return prev
        })
      } catch (err) {
        console.error("Error parsing Excel rows:", err)
      }
    }

    extractRowsAndMatch()
    return () => {
      active = false
    }
  }, [
    excelFile,
    selectedSheetIndex,
    headerRowNumber,
    excelCodeCol,
    excelNameCol,
    excelStockCol,
    excelIssuesCol,
    excelColumns,
    invoiceItems.length,
  ])

  const excelRowMap = useMemo(() => {
    const m = new Map<number, ExcelRowData>()
    for (const r of excelRows) {
      m.set(r.rowNumber, r)
    }
    return m
  }, [excelRows])

  // First matched row for showing live sample numbers inside the column dropdowns
  const firstMatchedExcelRow = useMemo(() => {
    for (const item of invoiceItems) {
      if (item.matchedExcelRowNumber) {
        const r = excelRowMap.get(item.matchedExcelRowNumber)
        if (r) return r
      }
    }
    return excelRows[0]
  }, [invoiceItems, excelRowMap, excelRows])

  const handleUpdateDisbursedQty = (id: string, val: number) => {
    const safeVal = Math.max(0, Number(val) || 0)
    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, disbursedQty: safeVal } : item
      )
    )
  }

  const handleManualMatchRow = async (id: string, rowNumber: number | null) => {
    const targetItem = invoiceItems.find((i) => i.id === id)
    if (!targetItem) return

    const matchedRow = rowNumber ? excelRowMap.get(rowNumber) : undefined

    const resolved = await resolveUnitAndPackForProduct({
      targetCode: matchedRow?.code || targetItem.productCode,
      excelRow: matchedRow,
      fallbackCode: targetItem.productCode,
      invoiceProductName: targetItem.productName,
      odooUnit: targetItem.odooUnit,
    })

    const newWhQty = Number(
      (
        targetItem.odooQty / Math.max(1, resolved.quantityPerCarton)
      ).toFixed(2)
    )

    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              matchedExcelRowNumber: rowNumber,
              matchType: rowNumber ? "manual" : "unmatched",
              quantityPerCarton: resolved.quantityPerCarton,
              warehouseUnit: resolved.warehouseUnit,
              originalWarehouseQty: newWhQty,
              disbursedQty: newWhQty,
            }
          : item
      )
    )
  }

  const handleToggleDelete = (id: string, deleted: boolean) => {
    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isDeleted: deleted } : item
      )
    )
  }

  const filteredItems = useMemo(() => {
    return invoiceItems.filter((item) => {
      if (!showDeleted && item.isDeleted) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.trim().toLowerCase()
      const matchedRow = item.matchedExcelRowNumber
        ? excelRowMap.get(item.matchedExcelRowNumber)
        : undefined
      return (
        item.productName.toLowerCase().includes(q) ||
        item.productCode.toLowerCase().includes(q) ||
        (matchedRow?.name && matchedRow.name.toLowerCase().includes(q)) ||
        (matchedRow?.rawCode && matchedRow.rawCode.toLowerCase().includes(q))
      )
    })
  }, [invoiceItems, showDeleted, searchTerm, excelRowMap])

  const stats = useMemo(() => {
    const active = invoiceItems.filter((i) => !i.isDeleted)
    const deletedCount = invoiceItems.filter((i) => i.isDeleted).length
    const matchedCount = active.filter(
      (i) => i.matchedExcelRowNumber !== null
    ).length
    const unmatchedCount = active.length - matchedCount
    return {
      total: invoiceItems.length,
      activeCount: active.length,
      matchedCount,
      unmatchedCount,
      deletedCount,
    }
  }, [invoiceItems])

  // 4. Surgical OpenXML (JSZip + DOMParser) Export — 100% Preserves Excel Tables, Shared Formulas & All Sheets!
  const processExcel = async () => {
    if (!excelFile || !excelCodeCol || (!excelStockCol && !excelIssuesCol)) {
      toast({
        title: "خطأ",
        description: "يرجى تحديد الملف وأعمدة المطابقة (الرصيد أو المصروفات)",
        variant: "destructive",
      })
      return
    }

    const activeMatchedItems = invoiceItems.filter(
      (i) =>
        !i.isDeleted &&
        i.matchedExcelRowNumber !== null &&
        i.disbursedQty > 0
    )

    if (activeMatchedItems.length === 0) {
      toast({
        title: "لا توجد أصناف مطابقة للخصم",
        description:
          "تأكد من وجود أصناف مطابقة مع ملف الإكسل وغير محذوفة قبل التصدير.",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    try {
      const buffer = await excelFile.arrayBuffer()
      const JSZip = (await import("jszip")).default
      const zip = await JSZip.loadAsync(buffer)

      // 1. Resolve target worksheet XML path inside the .xlsx zip archive
      let sheetXmlPath = `xl/worksheets/sheet${selectedSheetIndex + 1}.xml`
      try {
        const wbXmlStr = await zip.file("xl/workbook.xml")?.async("string")
        const relsXmlStr = await zip
          .file("xl/_rels/workbook.xml.rels")
          ?.async("string")
        if (wbXmlStr && relsXmlStr) {
          const parser = new DOMParser()
          const wbDoc = parser.parseFromString(wbXmlStr, "application/xml")
          const relsDoc = parser.parseFromString(relsXmlStr, "application/xml")
          const sheets = Array.from(wbDoc.getElementsByTagName("sheet"))
          const targetSheet = sheets[selectedSheetIndex] || sheets[0]
          const rId =
            targetSheet?.getAttribute("r:id") ||
            targetSheet?.getAttributeNS(
              "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
              "id"
            )
          if (rId) {
            const rels = Array.from(
              relsDoc.getElementsByTagName("Relationship")
            )
            const matchedRel = rels.find((r) => r.getAttribute("Id") === rId)
            const target = matchedRel?.getAttribute("Target")
            if (target) {
              const cleanTarget = target.replace(/^\//, "")
              sheetXmlPath = cleanTarget.startsWith("xl/")
                ? cleanTarget
                : `xl/${cleanTarget}`
            }
          }

          // Enable fullCalcOnLoad="1" in xl/workbook.xml so Excel recalculates all formulas on open
          const calcPrList = wbDoc.getElementsByTagName("calcPr")
          if (calcPrList.length > 0) {
            calcPrList[0].setAttribute("fullCalcOnLoad", "1")
          } else if (wbDoc.documentElement) {
            const calcPr = wbDoc.createElementNS(
              wbDoc.documentElement.namespaceURI,
              "calcPr"
            )
            calcPr.setAttribute("fullCalcOnLoad", "1")
            wbDoc.documentElement.appendChild(calcPr)
          }
          const updatedWbXml = new XMLSerializer().serializeToString(wbDoc)
          zip.file("xl/workbook.xml", updatedWbXml)
        }
      } catch {}

      const sheetFile = zip.file(sheetXmlPath)
      if (!sheetFile) {
        throw new Error(`تعذر العثور على ورقة العمل داخل الملف (${sheetXmlPath})`)
      }

      const sheetXmlStr = await sheetFile.async("string")
      const parser = new DOMParser()
      const sheetDoc = parser.parseFromString(sheetXmlStr, "application/xml")
      const ns =
        sheetDoc.documentElement.namespaceURI ||
        "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

      // Map all <row> elements by row number
      const rowElementsMap = new Map<number, Element>()
      const allRowEls = sheetDoc.getElementsByTagName("row")
      for (let i = 0; i < allRowEls.length; i++) {
        const rEl = allRowEls[i]
        const rNum = parseInt(rEl.getAttribute("r") || "0", 10)
        if (rNum > 0) {
          rowElementsMap.set(rNum, rEl)
        }
      }

      // Helper to get or create a <c> element inside a <row> in proper column order
      const getOrCreateCellElement = (
        rowEl: Element,
        rowNumber: number,
        colNumber: number
      ): Element => {
        const targetRef = `${colNumberToLetter(colNumber)}${rowNumber}`
        const cells = rowEl.getElementsByTagName("c")
        let styleRef: string | null = null
        let insertBeforeEl: Element | null = null

        for (let i = 0; i < cells.length; i++) {
          const cEl = cells[i]
          const cRef = cEl.getAttribute("r") || ""
          const matchCol = cRef.match(/^([A-Z]+)/i)
          if (cRef === targetRef) {
            return cEl
          }
          if (matchCol) {
            const cNum = colLetterToNumber(matchCol[1])
            if (!styleRef && cEl.getAttribute("s")) {
              styleRef = cEl.getAttribute("s")
            }
            if (cNum > colNumber && !insertBeforeEl) {
              insertBeforeEl = cEl
            }
          }
        }

        const newCell = sheetDoc.createElementNS(ns, "c")
        newCell.setAttribute("r", targetRef)
        if (styleRef) {
          newCell.setAttribute("s", styleRef)
        }
        if (insertBeforeEl) {
          rowEl.insertBefore(newCell, insertBeforeEl)
        } else {
          rowEl.appendChild(newCell)
        }
        return newCell
      }

      // Helper to update a numeric cell in XML while preserving formulas
      const updateNumericCellXml = (
        rowEl: Element,
        rowNumber: number,
        colNumber: number,
        newVal: number,
        deltaQty: number,
        mode: "issues" | "stock"
      ) => {
        const cEl = getOrCreateCellElement(rowEl, rowNumber, colNumber)
        const fEls = cEl.getElementsByTagName("f")
        const hasFormula = fEls.length > 0

        if (hasFormula) {
          const fEl = fEls[0]
          const isShared = fEl.getAttribute("t") === "shared"
          const fText = (fEl.textContent || "").trim()

          if (mode === "issues") {
            // If Issues itself has an explicit non-shared formula, append +deltaQty
            if (fText && !isShared) {
              fEl.textContent = `${fText}+${deltaQty}`
            }
          } else if (mode === "stock") {
            // If Stock is a formula and Issues/Purchases column was NOT updated, adjust formula
            if (excelIssuesCol === 0 && fText && !isShared) {
              fEl.textContent = isReceiveMode
                ? `(${fText})+${deltaQty}`
                : `(${fText})-${deltaQty}`
            }
            // Otherwise, Issues/Purchases column WAS updated, so Stock's existing formula (=Q+R+S-T or Table1[...])
            // will automatically recalculate it! Keep <f> 100% untouched!
          }
        } else {
          // Plain value cell: ensure it's treated as a number (remove string type attributes)
          const cellType = cEl.getAttribute("t")
          if (cellType === "s" || cellType === "str" || cellType === "inlineStr" || cellType === "e") {
            cEl.removeAttribute("t")
          }
          const isEls = Array.from(cEl.getElementsByTagName("is"))
          for (const isEl of isEls) {
            cEl.removeChild(isEl)
          }
        }

        // Set or update <v> cached numeric value
        const vEls = cEl.getElementsByTagName("v")
        if (vEls.length > 0) {
          vEls[0].textContent = String(newVal)
        } else {
          const vEl = sheetDoc.createElementNS(ns, "v")
          vEl.textContent = String(newVal)
          cEl.appendChild(vEl)
        }
      }

      // Helper to write inline string cell (for optional extra columns)
      const setInlineStringCellXml = (
        rowEl: Element,
        rowNumber: number,
        colNumber: number,
        textVal: string
      ) => {
        const cEl = getOrCreateCellElement(rowEl, rowNumber, colNumber)
        cEl.setAttribute("t", "inlineStr")
        while (cEl.firstChild) {
          cEl.removeChild(cEl.firstChild)
        }
        const isEl = sheetDoc.createElementNS(ns, "is")
        const tEl = sheetDoc.createElementNS(ns, "t")
        tEl.textContent = textVal
        isEl.appendChild(tEl)
        cEl.appendChild(isEl)
      }

      // Helper to check if a cell has content (formula, text, inline string, or cached value)
      const isCellOccupied = (
        rowEl: Element,
        rowNumber: number,
        colNumber: number
      ): boolean => {
        const targetRef = `${colNumberToLetter(colNumber)}${rowNumber}`
        const cells = rowEl.getElementsByTagName("c")
        for (let i = 0; i < cells.length; i++) {
          const cEl = cells[i]
          if (cEl.getAttribute("r") === targetRef) {
            const fEls = cEl.getElementsByTagName("f")
            if (fEls.length > 0 && (fEls[0].textContent || "").trim().length > 0) {
              return true
            }
            const isEls = cEl.getElementsByTagName("is")
            if (isEls.length > 0 && (isEls[0].textContent || "").trim().length > 0) {
              return true
            }
            const tEls = cEl.getElementsByTagName("t")
            if (tEls.length > 0 && (tEls[0].textContent || "").trim().length > 0) {
              return true
            }
            const vEls = cEl.getElementsByTagName("v")
            if (vEls.length > 0 && (vEls[0].textContent || "").trim().length > 0) {
              return true
            }
            return false
          }
        }
        return false
      }

      // Group active matched items by target Excel rowNumber
      const rowDeductions = new Map<
        number,
        {
          disbursedQty: number
          odooQty: number
          warehouseUnit: string
          odooUnit: string
        }
      >()

      for (const item of activeMatchedItems) {
        const rNum = item.matchedExcelRowNumber!
        const existing = rowDeductions.get(rNum)
        if (existing) {
          existing.disbursedQty += item.disbursedQty
          existing.odooQty += item.odooQty
        } else {
          rowDeductions.set(rNum, {
            disbursedQty: item.disbursedQty,
            odooQty: item.odooQty,
            warehouseUnit: item.warehouseUnit,
            odooUnit: item.odooUnit,
          })
        }
      }

      const maxColNumber =
        excelColumns.length > 0
          ? Math.max(...excelColumns.map((c) => c.colNumber))
          : 26
      const warehouseQtyColIndex = maxColNumber + 1
      const odooQtyColIndex = maxColNumber + 2

      if (appendExtraCols) {
        const headerRowEl = rowElementsMap.get(headerRowNumber)
        if (headerRowEl) {
          setInlineStringCellXml(
            headerRowEl,
            headerRowNumber,
            warehouseQtyColIndex,
            "Qty Warehouse"
          )
          setInlineStringCellXml(
            headerRowEl,
            headerRowNumber,
            odooQtyColIndex,
            "Qty Odoo"
          )
        }
      }

      let deductionCount = 0

      for (const [rowNumber, ded] of rowDeductions.entries()) {
        const rowEl = rowElementsMap.get(rowNumber)
        const rowData = excelRowMap.get(rowNumber)
        if (!rowEl || !rowData) continue

        const wQtyNum = Number(ded.disbursedQty.toFixed(2))
        const oQtyNum = Number(ded.odooQty.toFixed(2))

        // 1. Update Issues (المصروفات) cell
        if (excelIssuesCol > 0) {
          const newIssuesVal = Number(
            (rowData.currentIssues + wQtyNum).toFixed(2)
          )
          updateNumericCellXml(
            rowEl,
            rowNumber,
            excelIssuesCol,
            newIssuesVal,
            wQtyNum,
            "issues"
          )
        }

        // 2. Update Stock (الرصيد) cell (keeping <f> formula untouched!)
        if (excelStockCol > 0) {
          const newStockVal = Number(
            (
              isReceiveMode
                ? rowData.currentStock + wQtyNum
                : rowData.currentStock - wQtyNum
            ).toFixed(2)
          )
          updateNumericCellXml(
            rowEl,
            rowNumber,
            excelStockCol,
            newStockVal,
            wQtyNum,
            "stock"
          )
        }

        // 3. In Receive Mode: Write receipt log starting from Column AB (colNumber = 28)
        if (isReceiveMode) {
          const itemsForRow = activeMatchedItems.filter(
            (it) => it.matchedExcelRowNumber === rowNumber
          )
          for (const it of itemsForRow) {
            const itQty = Number(it.disbursedQty.toFixed(2))
            if (itQty <= 0) continue

            const dateStr = formatReceiptDate(it.date)
            const qtyFormatted = Number.isInteger(itQty) ? String(itQty) : itQty.toFixed(2)
            const rawUnit = (it.warehouseUnit || "carton").trim().toLowerCase()
            let unitFormatted = "carton"
            if (rawUnit === "pcs" || rawUnit === "pc" || rawUnit === "حبة" || rawUnit === "قطعة") {
              unitFormatted = "pcs"
            } else if (rawUnit !== "carton" && rawUnit !== "ctn" && rawUnit !== "كرتون") {
              unitFormatted = it.warehouseUnit || "carton"
            }

            let extraRef = ""
            if (it.origin) {
              const qcMatch = it.origin.match(/\bQC\s*[-_]?\s*\d+\b/i)
              if (qcMatch) {
                extraRef = ` ${qcMatch[0].toUpperCase()}`
              }
            }

            const logText = `${dateStr} Received ${qtyFormatted} ${unitFormatted}${extraRef}`

            // Find first empty column starting from column AB (colNumber = 28)
            let targetCol = 28 // Column AB
            while (isCellOccupied(rowEl, rowNumber, targetCol)) {
              targetCol++
            }

            setInlineStringCellXml(rowEl, rowNumber, targetCol, logText)

            // Ensure header row has a title if expanding past existing headers
            const headerRowEl = rowElementsMap.get(headerRowNumber)
            if (headerRowEl && targetCol >= 28) {
              if (!isCellOccupied(headerRowEl, headerRowNumber, targetCol)) {
                const colIndex = targetCol - 26
                setInlineStringCellXml(
                  headerRowEl,
                  headerRowNumber,
                  targetCol,
                  `Column${colIndex}`
                )
              }
            }
          }
        }

        // 4. Optional extra columns at the end
        if (appendExtraCols) {
          setInlineStringCellXml(
            rowEl,
            rowNumber,
            warehouseQtyColIndex,
            ded.warehouseUnit ? `${wQtyNum} ${ded.warehouseUnit}` : `${wQtyNum}`
          )
          setInlineStringCellXml(
            rowEl,
            rowNumber,
            odooQtyColIndex,
            ded.odooUnit ? `${oQtyNum} ${ded.odooUnit}` : `${oQtyNum}`
          )
        }

        deductionCount++
      }

      // Serialize only the modified worksheet XML back into the original ZIP archive
      const updatedSheetXml = new XMLSerializer().serializeToString(sheetDoc)
      zip.file(sheetXmlPath, updatedSheetXml)

      const updatedBlob = await zip.generateAsync({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        compression: "DEFLATE",
      })

      const url = URL.createObjectURL(updatedBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `updated_odoo_${excelFile.name}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Success",
        description: isReceiveMode
          ? `Successfully updated and added ${deductionCount} received items into Excel stock.`
          : `Successfully updated and deducted ${deductionCount} items while preserving 100% of original Excel tables and formulas.`,
      })
      onClose()
    } catch (err: any) {
      console.error("Excel process error:", err)
      toast({
        title: "Error",
        description: err.message || "An error occurred while processing the Excel file",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="!max-w-[98vw] w-[98vw] max-h-[96vh] flex flex-col overflow-hidden"
        style={{ maxWidth: "98vw", width: "98vw" }}
        dir="rtl"
      >
        <DialogHeader className="border-b pb-3 text-right">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <span>
                  {isReceiveMode
                    ? "Auto Add Received Stock & Excel Reconciliation"
                    : "Auto Deduct Stock & Excel Reconciliation"}
                </span>
                <Badge
                  variant="outline"
                  className="bg-white text-black border-emerald-600 text-xs"
                >
                  {selectedIds.length} {isReceiveMode ? "Selected Receipts" : "Selected Invoices"}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {isReceiveMode
                  ? "Review received quantities from selected PO receipts and match them with your Excel stock file before updating stock (100% formulas preserved)."
                  : "Review disbursed quantities from selected invoices and match them with your Excel stock file before exporting (100% formulas preserved)."}
              </DialogDescription>
            </div>

            {/* Summary Badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="outline"
                className="bg-white text-black border-slate-300 text-xs px-2.5 py-1"
              >
                Invoice Items: <strong className="mr-1">{stats.total}</strong>
              </Badge>
              {excelFile && (
                <>
                  <Badge
                    variant="outline"
                    className="bg-white text-black border-emerald-600 text-xs px-2.5 py-1"
                  >
                    ✅ Matched: <strong className="mr-1">{stats.matchedCount}</strong>
                  </Badge>
                  {stats.unmatchedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-white text-black border-red-500 text-xs px-2.5 py-1"
                    >
                      ⚠️ Unmatched: <strong className="mr-1">{stats.unmatchedCount}</strong>
                    </Badge>
                  )}
                </>
              )}
              {stats.deletedCount > 0 && (
                <Badge
                  variant="outline"
                  className="bg-white text-black border-amber-500 text-xs px-2.5 py-1 cursor-pointer"
                  onClick={() => setShowDeleted((prev) => !prev)}
                  title="Click to show or hide excluded items"
                >
                  🗑️ Excluded: <strong className="mr-1">{stats.deletedCount}</strong>
                  <span className="mr-1 underline text-[10px] text-blue-600">
                    ({showDeleted ? "Hide" : "Show to restore"})
                  </span>
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Top Upload & Column Mapping Bar */}
        <div className="bg-slate-50 border rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4 space-y-1">
              <Label className="text-xs font-bold">
                1. Upload Stock File (Excel)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleExcelUpload}
                  className="cursor-pointer h-8 text-xs bg-white flex-1"
                />
                {excelFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearExcelFile}
                    className="h-8 px-2 text-red-600 border-red-300 bg-white hover:bg-red-50"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {sheetNames.length > 1 && (
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs font-bold">Worksheet (Sheet)</Label>
                <select
                  className="w-full h-8 px-2 border rounded-md text-xs bg-white font-semibold"
                  value={selectedSheetIndex}
                  onChange={async (e) => {
                    const idx = Number(e.target.value)
                    setSelectedSheetIndex(idx)
                    if (excelFile) await parseWorksheetHeaders(excelFile, idx)
                  }}
                >
                  {sheetNames.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name.replace(/^ورقة\s*(\d+)$/, "Sheet $1")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-4 space-y-1">
              <Label className="text-xs font-bold">
                Quick Search in Matching Table
              </Label>
              <div className="relative">
                <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search by product name or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-8 h-8 text-xs bg-white"
                />
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none bg-white px-2.5 py-1.5 rounded border w-full">
                <input
                  type="checkbox"
                  checked={appendExtraCols}
                  onChange={(e) => setAppendExtraCols(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span
                  className="truncate"
                  title="Append Qty Warehouse & Qty Odoo columns at the end of the sheet"
                >
                  Append Extra Columns
                </span>
              </label>
            </div>
          </div>

          {excelColumns.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-200">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  Product Code Column (Match)
                </Label>
                <select
                  className="w-full h-8 px-2 border rounded-md text-xs bg-white font-semibold"
                  value={excelCodeCol}
                  onChange={(e) => setExcelCodeCol(Number(e.target.value))}
                >
                  <option value={0}>Select column...</option>
                  {excelColumns.map((c) => (
                    <option key={c.colNumber} value={c.colNumber}>
                      [{c.colLetter}] {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  Product Name Column (Excel)
                </Label>
                <select
                  className="w-full h-8 px-2 border rounded-md text-xs bg-white font-semibold"
                  value={excelNameCol}
                  onChange={(e) => setExcelNameCol(Number(e.target.value))}
                >
                  <option value={0}>Optional...</option>
                  {excelColumns.map((c) => (
                    <option key={c.colNumber} value={c.colNumber}>
                      [{c.colLetter}] {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-blue-700">
                  {isReceiveMode
                    ? "Inbound / Purchases Column (+Add)"
                    : "Issues / Disbursed Column (+Add)"}
                </Label>
                <select
                  className="w-full h-8 px-2 border border-blue-300 rounded-md text-xs bg-white font-semibold"
                  value={excelIssuesCol}
                  onChange={(e) => setExcelIssuesCol(Number(e.target.value))}
                >
                  <option value={0}>
                    {isReceiveMode ? "No inbound/purchases column..." : "No issues column..."}
                  </option>
                  {excelColumns.map((c) => {
                    const sampleVal =
                      firstMatchedExcelRow?.rawRowValues?.[c.colNumber]
                    return (
                      <option key={c.colNumber} value={c.colNumber}>
                        [{c.colLetter}] {c.title}
                        {sampleVal !== undefined ? ` (${sampleVal})` : ""}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-emerald-700">
                  Current Stock Column ({isReceiveMode ? "+Add" : "-Deduct"})
                </Label>
                <select
                  className="w-full h-8 px-2 border border-emerald-300 rounded-md text-xs bg-white font-semibold"
                  value={excelStockCol}
                  onChange={(e) => setExcelStockCol(Number(e.target.value))}
                >
                  <option value={0}>No stock column...</option>
                  {excelColumns.map((c) => {
                    const sampleVal =
                      firstMatchedExcelRow?.rawRowValues?.[c.colNumber]
                    return (
                      <option key={c.colNumber} value={c.colNumber}>
                        [{c.colLetter}] {c.title}
                        {sampleVal !== undefined ? ` (${sampleVal})` : ""}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">
                  Header Row Number
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={headerRowNumber}
                  onChange={async (e) => {
                    const r = Math.max(1, parseInt(e.target.value) || 1)
                    setHeaderRowNumber(r)
                    if (excelFile) {
                      await parseWorksheetHeaders(
                        excelFile,
                        selectedSheetIndex,
                        r
                      )
                    }
                  }}
                  className="h-8 text-xs bg-white text-center font-bold"
                />
              </div>
            </div>
          )}
        </div>

        {/* Interactive Reconciliation Table */}
        <div className="flex-1 overflow-y-auto border rounded-lg bg-white">
          {loadingInvoices ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <span className="text-xs font-semibold">
                Loading and aggregating products from selected invoices...
              </span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-14 text-slate-400 text-sm">
              No products found in the selected invoices.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-100 border-b shadow-sm text-slate-800">
                <tr>
                  <th className="py-2.5 px-2 text-center w-10 border-l">#</th>
                  <th className="py-2.5 px-2 text-center w-14 border-l">
                    Image
                  </th>
                  <th className="py-2.5 px-3 text-right border-l min-w-[280px]">
                    {isReceiveMode ? "Product Name (Receipts)" : "Product Name (Invoices)"}
                  </th>
                  <th className="py-2.5 px-2.5 text-right border-l min-w-[330px]">
                    Excel Match (Edit / Link Another Product)
                  </th>
                  <th className="py-2.5 px-2 text-center border-l w-48 min-w-[175px]">
                    {isReceiveMode ? "Received Qty (Receipts)" : "Disbursed Qty (Invoices)"}
                  </th>
                  <th className="py-2.5 px-2 text-center border-l w-28">
                    {isReceiveMode ? "Excel Inbound" : "Excel Issues"}
                  </th>
                  <th className="py-2.5 px-2 text-center border-l w-28">
                    {isReceiveMode ? "Final Inbound" : "Final Issues"}
                  </th>
                  <th className="py-2.5 px-2 text-center border-l w-36">
                    {isReceiveMode ? "Excel Stock → Final" : "Excel Stock ← Final"}
                  </th>
                  <th className="py-2.5 px-2 text-center w-16">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredItems.map((item, idx) => {
                  const matchedRow = item.matchedExcelRowNumber
                    ? excelRowMap.get(item.matchedExcelRowNumber)
                    : undefined

                  const excelIssues = matchedRow ? matchedRow.currentIssues : 0
                  const finalIssues = Number(
                    (excelIssues + item.disbursedQty).toFixed(2)
                  )

                  const excelStock = matchedRow ? matchedRow.currentStock : 0
                  const finalStock = Number(
                    (
                      isReceiveMode
                        ? excelStock + item.disbursedQty
                        : excelStock - item.disbursedQty
                    ).toFixed(2)
                  )

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        item.isDeleted
                          ? "bg-red-50/40 opacity-60 line-through"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="py-2 px-2 text-center font-bold text-slate-600 border-l">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2 text-center border-l">
                        <div className="flex justify-center">
                          <WebsiteProductImage
                            productCode={item.productCode}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 border-l">
                        <div
                          className="font-bold text-slate-900 text-xs leading-snug"
                          dir="ltr"
                        >
                          {item.productName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {item.productCode && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-white text-black font-semibold">
                              [{item.productCode}]
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            Odoo: <strong>{item.odooQty}</strong> {item.odooUnit}
                          </span>
                          {item.quantityPerCarton > 1 && (
                            <span className="text-[10px] text-slate-500">
                              (Pack: {item.quantityPerCarton})
                            </span>
                          )}
                          {isReceiveMode && (
                            <div className="w-full mt-0.5">
                              <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 font-mono inline-block">
                                Log: {formatReceiptDate(item.date)} Received {item.disbursedQty} {(item.warehouseUnit || "carton").toLowerCase() === "pcs" ? "pcs" : (item.warehouseUnit || "carton")} → Col AB+
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Excel Match & Manual Link Column */}
                      <td className="py-2 px-2.5 border-l">
                        {!excelFile ? (
                          <span className="text-[11px] text-slate-400">
                            Upload Excel file first to match...
                          </span>
                        ) : (
                          <ExcelRowMatcherPopover
                            item={item}
                            excelRows={excelRows}
                            matchedRow={matchedRow}
                            onSelectRow={(rowNum) =>
                              handleManualMatchRow(item.id, rowNum)
                            }
                          />
                        )}
                      </td>

                      {/* Editable Disbursed Quantity from Invoices */}
                      <td className="py-2 px-2 text-center border-l">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={item.isDeleted}
                            className="h-7 w-7 bg-white"
                            onClick={() =>
                              handleUpdateDisbursedQty(
                                item.id,
                                Math.max(
                                  0,
                                  Number((item.disbursedQty - 1).toFixed(2))
                                )
                              )
                            }
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            dir="ltr"
                            disabled={item.isDeleted}
                            value={item.disbursedQty}
                            onChange={(e) =>
                              handleUpdateDisbursedQty(
                                item.id,
                                parseFloat(e.target.value)
                              )
                            }
                            className={`w-24 px-1.5 h-7 text-center font-bold text-xs bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              item.disbursedQty !== item.originalWarehouseQty
                                ? "border-amber-500 text-amber-800"
                                : "border-blue-400 text-blue-900"
                            }`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={item.isDeleted}
                            className="h-7 w-7 bg-white"
                            onClick={() =>
                              handleUpdateDisbursedQty(
                                item.id,
                                Number((item.disbursedQty + 1).toFixed(2))
                              )
                            }
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          <span className="text-[10px] font-semibold text-blue-700">
                            {item.warehouseUnit}
                          </span>
                          {item.disbursedQty !== item.originalWarehouseQty && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateDisbursedQty(
                                  item.id,
                                  item.originalWarehouseQty
                                )
                              }
                              className="text-[9px] text-amber-700 underline"
                              title="Reset to original invoice quantity"
                            >
                              (Orig: {item.originalWarehouseQty})
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Current Issues in Excel */}
                      <td className="py-2 px-2 text-center border-l font-bold text-slate-700">
                        {matchedRow && excelIssuesCol > 0 ? (
                          <div>
                            <span>{excelIssues}</span>
                            {matchedRow.issuesIsFormula && (
                              <span
                                className="block text-[9px] text-purple-700 font-mono"
                                title={`Excel Formula: =${matchedRow.issuesFormula}`}
                              >
                                ƒx Formula
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Final Issues (Excel Issues + Invoice Disbursed) */}
                      <td className="py-2 px-2 text-center border-l">
                        {matchedRow ? (
                          <div className="font-extrabold text-sm text-blue-700">
                            {finalIssues}
                            <span className="block text-[9px] font-normal text-slate-500">
                              ({excelIssues} + {item.disbursedQty})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Stock in Excel -> Final Stock */}
                      <td
                        className={`py-2 px-2 text-center border-l transition-colors ${
                          matchedRow &&
                          excelStockCol > 0 &&
                          (finalStock < 0 || excelStock < 0)
                            ? "bg-red-100/80"
                            : ""
                        }`}
                      >
                        {matchedRow && excelStockCol > 0 ? (
                          <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1 font-bold text-xs">
                              <span className="text-slate-600" dir="ltr">
                                {excelStock}
                              </span>
                              <span>{isReceiveMode ? "→" : "←"}</span>
                              <span
                                dir="ltr"
                                className={
                                  finalStock < 0
                                    ? "text-red-700 font-extrabold"
                                    : "text-emerald-700 font-extrabold"
                                }
                              >
                                {finalStock}
                              </span>
                            </div>
                            {matchedRow.stockIsFormula && (
                              <span
                                className="text-[9px] text-purple-700 font-mono"
                                title={`Protected Excel Formula: =${matchedRow.stockFormula}`}
                              >
                                ƒx Formula Kept
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Delete / Restore Action */}
                      <td className="py-2 px-2 text-center">
                        {item.isDeleted ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleDelete(item.id, false)}
                            className="h-7 px-2 text-[10px] gap-1 bg-white text-blue-700 border-blue-400"
                            title="Restore item for deduction"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleDelete(item.id, true)}
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Exclude from deduction (will not be deducted from Excel)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t">
          <div className="text-xs text-slate-600">
            {excelFile ? (
              <span>
                Will update <strong>{stats.matchedCount}</strong> matched items in Excel{" "}
                {stats.deletedCount > 0 && (
                  <span className="text-red-600 font-semibold">
                    ({stats.deletedCount} deleted items excluded)
                  </span>
                )}
              </span>
            ) : (
              <span>Please upload an Excel stock file to match items and enable export.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
              className="bg-white text-black"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="bg-white text-black border-2 border-emerald-600 hover:bg-emerald-50 font-bold gap-2"
              onClick={processExcel}
              disabled={
                isProcessing ||
                !excelFile ||
                !excelCodeCol ||
                (!excelStockCol && !excelIssuesCol) ||
                stats.matchedCount === 0
              }
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <Download className="w-4 h-4 text-emerald-600" />
              )}
              Export Updated Excel (Keep Formulas)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
