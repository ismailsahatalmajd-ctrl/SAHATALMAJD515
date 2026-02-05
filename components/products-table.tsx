"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2, ImageIcon, Settings2, ArrowUp, ArrowDown, Filter, Loader2, Download, Printer, RotateCcw, Type, Minus, Plus } from 'lucide-react'
import type { Product } from "@/lib/types"
import { generateProductsPDF } from "@/lib/products-pdf-generator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { updateProduct } from "@/lib/storage"
import { getSafeImageSrc, formatArabicGregorianDate, formatArabicGregorianDateTime, formatEnglishNumber, getApiUrl } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"
import { toast } from "@/hooks/use-toast"
import { db } from "@/lib/db"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { ProductImage } from "@/components/product-image"
import { TurnoverSettingsDialog } from "./turnover-settings-dialog"
import { useAuth } from "@/components/auth-provider"
import { hasPermission } from "@/lib/auth-utils"

const THRESHOLDS_KEY = 'turnover-thresholds'

const convertNumbersToEnglish = (value: any): string => {
  if (value === null || value === undefined) return ""
  const arabicNumbers = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
  const englishNumbers = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
  let result = String(value)
  arabicNumbers.forEach((arabic, index) => {
    result = result.replace(new RegExp(arabic, "g"), englishNumbers[index])
  })
  return result
}

interface ProductsTableProps {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
  // New Filter Props
  categories?: string[]
  selectedCategory?: string
  onCategoryChange?: (val: string) => void
  locations?: string[]
  selectedLocation?: string
  onLocationChange?: (val: string) => void
  searchTerm?: string
  onSearchChange?: (val: string) => void
  onReset?: () => void
}

type DerivedColumn = "turnoverRate" | "status"
type SortColumn = keyof Product | DerivedColumn | null
type SortDirection = "asc" | "desc"

export function ProductsTable({
  products,
  onEdit,
  onDelete,
  categories = [],
  selectedCategory = "all",
  onCategoryChange,
  locations = [],
  selectedLocation = "all",
  onLocationChange,
  searchTerm = "",
  onSearchChange,
  onReset
}: ProductsTableProps) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn>("turnoverRate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [imageUploadId, setImageUploadId] = useState<string | null>(null)
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dropActiveId, setDropActiveId] = useState<string | null>(null)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizingRef = useRef<{ key: string; startWidth: number; startX: number } | null>(null)

  // Search Logic: Prop or Local
  const [localSearchTerm, setLocalSearchTerm] = useState("")
  const effectiveSearchTerm = onSearchChange ? searchTerm : localSearchTerm
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onSearchChange) onSearchChange(e.target.value)
    else setLocalSearchTerm(e.target.value)
  }
  const internalSearchTerm = effectiveSearchTerm
  // For internal filtering use effectiveSearchTerm. 
  // IMPORTANT: Since we use 'searchTerm' in useMemo below as a variable name, 
  // we must alias effectiveSearchTerm to searchTerm to minimize diffs, OR update useMemo deps.
  // Let's aliasing just for the hook.

  // Actually, let's keep the variable name 'searchTerm' for what the component uses internally
  // but pointing to effectiveSearchTerm.
  // Wait, I can't redeclare const searchTerm.
  // I will skip declaring 'const [searchTerm, setSearchTerm]' and instead use specific names.

  const [turnoverFilter, setTurnoverFilter] = useState<"all" | "fast" | "normal" | "slow" | "stagnant" | "new">("all")
  const [exportMode, setExportMode] = useState<"filtered" | "all">("filtered")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSrc, setPreviewSrc] = useState("")
  const [previewTitle, setPreviewTitle] = useState("")
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false)
  /* 
   User Rules:
   - 0: Rakid (Stagnant)
   - <= 0.35: Slow
   - <= 1: Normal
   - > 1: Fast
  */
  const [thresholds, setThresholds] = useState({ stagnant: 0, slow: 0.35, normal: 1, fast: 0 })

  // Stock Level Filter (Available, Low, Out)
  const [stockLevelFilter, setStockLevelFilter] = useState<"all" | "available" | "low" | "out">("all")






  // New Filters State
  const [mergeIdentical, setMergeIdentical] = useState(false)
  const [excludeZeroStock, setExcludeZeroStock] = useState(false)

  // Helper to calculate turnover
  const calculateTurnover = (p: Product) => {
    const stock = Number(p.currentStock || 0)
    const opening = Number(p.openingStock || 0)
    const purchases = Number(p.purchases || 0)
    const soldQty = Number(p.issues || 0)

    // Formula: Turnover = Issues / (CurrentStock > 0 ? CurrentStock : Opening + Purchases)
    const baseStock = stock > 0 ? stock : opening + purchases

    if (baseStock <= 0) return 0
    if (soldQty === 0) return 0 // Return clean 0 for stagnant products

    const ratio = soldQty / baseStock
    // Round very small values to 0
    const result = (isFinite(ratio) && !isNaN(ratio)) ? ratio : 0
    return result < 0.0001 ? 0 : result
  }

  const getStatusKey = (p: Product): "fast" | "normal" | "slow" | "stagnant" | "new" => {
    const openingStock = Number(p.openingStock || 0)
    const purchases = Number(p.purchases || 0)
    const currentStock = Number(p.currentStock || 0)

    // New products: purchases === currentStock, both > 0, and openingStock = 0
    if (openingStock === 0 && purchases > 0 && currentStock > 0 && purchases === currentStock) {
      return "new"
    }

    // For all other cases (including openingStock = 0 but purchases ≠ currentStock),
    // classify based on turnover rate
    const rate = calculateTurnover(p)

    // User: > 1 is Fast
    if (rate > thresholds.normal) return "fast"

    // User: <= 1 is Normal (implies > 0.35)
    if (rate > thresholds.slow) return "normal"

    // User: <= 0.35 is Slow (implies > 0)
    if (rate > 0) return "slow"

    // 0 is Stagnant
    return "stagnant"
  }

  const filteredProducts = useMemo(() => {
    let result = products || []

    // 1. Merge Identical Logic
    if (mergeIdentical) {
      const map = new Map<string, Product>()
      result.forEach(p => {
        const key = `${(p.productName || "").trim()}_${(p.productCode || "").trim()}`
        if (!map.has(key)) {
          map.set(key, { ...p })
        } else {
          const existing = map.get(key)!
          // Sum numeric fields
          existing.openingStock = (Number(existing.openingStock) || 0) + (Number(p.openingStock) || 0)
          existing.purchases = (Number(existing.purchases) || 0) + (Number(p.purchases) || 0)
          existing.issues = (Number(existing.issues) || 0) + (Number(p.issues) || 0)

          // Recalculate stock for merged item
          // Since we forced the equation, we can just sum the components
          // existing.currentStock will be calculated via equation in render/sort
        }
      })
      result = Array.from(map.values())
    }

    // 2. Filter Logic
    return result.filter((p) => {
      /* Exclude Zero Stock Logic */
      if (excludeZeroStock) {
        const op = Number(p.openingStock) || 0
        const pu = Number(p.purchases) || 0
        const iss = Number(p.issues) || 0
        const stock = op + pu - iss
        if (stock === 0) return false
      }

      if (!p) return false
      const matchesSearch = internalSearchTerm
        ? String(p.productName ?? "").toLowerCase().includes(internalSearchTerm.toLowerCase()) ||
        String(p.productCode ?? "").toLowerCase().includes(internalSearchTerm.toLowerCase()) ||
        String(p.itemNumber ?? "").toLowerCase().includes(internalSearchTerm.toLowerCase())
        : true
      const statusOk = turnoverFilter === "all" ? true : getStatusKey(p) === turnoverFilter

      let stockLevelOk = true
      if (stockLevelFilter !== 'all') {
        const current = Number(p.currentStock || 0)
        // Helper to determine status
        // Out: <= 0
        // Low: <= 25% of (Opening + Purchase) or simple threshold? 
        // Let's use simple logic: Out <= 0. Low < threshold (e.g. 5 or logic from page.tsx: opening * 0.33).
        // Let's replicate logic from page.tsx:
        // if <= 0 -> out
        // limit = (opening + purchase) * (threshold || 33%)
        // if <= limit -> low
        // else -> available

        if (stockLevelFilter === 'out') {
          stockLevelOk = current <= 0
        } else {
          const limit = ((Number(p.openingStock) || 0) + (Number(p.purchases) || 0)) * ((p.lowStockThresholdPercentage || 33.33) / 100)
          const isLow = current > 0 && current <= limit
          if (stockLevelFilter === 'low') stockLevelOk = isLow
          if (stockLevelFilter === 'available') stockLevelOk = current > limit
        }
      }

      return matchesSearch && statusOk && stockLevelOk
    })
  }, [products, internalSearchTerm, turnoverFilter, thresholds, mergeIdentical, excludeZeroStock, stockLevelFilter]) // Add deps

  // ... (useEffect omitted, logic handled below)

  // Helper to calculate turnover
  // ... existing code ...

  const saveThresholds = async (newThresholds: typeof thresholds) => {
    setThresholds(newThresholds)
    try {
      await db.settings.put({ key: THRESHOLDS_KEY, value: newThresholds })
    } catch { }
  }

  // ... (useEffect omitted, logic handled below)



  const getStatusLabel = (key: string) => {
    switch (key) {
      case "fast": return <DualText k="status.fast" />
      case "normal": return <DualText k="status.normal" />
      case "slow": return <DualText k="status.slow" />
      case "stagnant": return <DualText k="status.stagnant" />
      case "new": return <DualText k="status.new" />
      default: return key
    }
  }

  const [visibleColumns, setVisibleColumns] = useState({
    image: true,
    productCode: true,
    itemNumber: true,
    productName: true,
    location: true,
    category: true,
    unit: true,
    quantityPerCarton: false,
    cartonDimensions: false,
    openingStock: true,
    purchases: true,
    issues: true,
    inventoryCount: true,
    currentStock: true,
    difference: true,
    price: true,
    averagePrice: true,
    currentStockValue: true,
    issuesValue: true,
    turnoverRate: true,
    status: true,
    lastActivity: true,
  })
  const [columnsLoaded, setColumnsLoaded] = useState(false)

  const COLUMN_WIDTHS_KEY = 'products_column_widths_v1'
  const VISIBLE_COLUMNS_KEY = 'products_visible_columns_v1'
  const FONT_SIZE_KEY = 'products_table_font_size'

  const [fontSize, setFontSize] = useState(13)

  useEffect(() => {
    db.settings.get(FONT_SIZE_KEY).then(s => { if (s?.value) setFontSize(s.value) })
  }, [])

  const updateFontSize = (size: number) => {
    const s = Math.min(16, Math.max(7, size))
    setFontSize(s)
    db.settings.put({ key: FONT_SIZE_KEY, value: s }).catch(() => { })
  }

  // Load column widths
  useEffect(() => {
    const loadWidths = async () => {
      try {
        const setting = await db.settings.get(COLUMN_WIDTHS_KEY)
        if (setting?.value) {
          setColumnWidths(setting.value)
        }
      } catch { }
    }
    loadWidths()
  }, [])

  // Load visible columns
  useEffect(() => {
    const loadVisible = async () => {
      try {
        const setting = await db.settings.get(VISIBLE_COLUMNS_KEY)
        if (setting?.value) {
          setVisibleColumns(setting.value)
        }
      } catch { } finally {
        setColumnsLoaded(true)
      }
    }
    loadVisible()
  }, [])

  const saveWidths = async (widths: Record<string, number>) => {
    try {
      await db.settings.put({ key: COLUMN_WIDTHS_KEY, value: widths })
    } catch { }
  }

  const saveVisibleColumns = async (visible: typeof visibleColumns) => {
    try {
      await db.settings.put({ key: VISIBLE_COLUMNS_KEY, value: visible })
    } catch { }
  }

  // Auto-save visible columns whenever they change
  useEffect(() => {
    if (columnsLoaded) {
      saveVisibleColumns(visibleColumns)
    }
  }, [visibleColumns, columnsLoaded])

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault()
    e.stopPropagation()
    const header = (e.target as HTMLElement).parentElement
    if (!header) return
    const startWidth = header.offsetWidth
    resizingRef.current = { key, startWidth, startX: e.pageX }

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = moveEvent.pageX - resizingRef.current.startX
      // Support RTL: If in RTL, delta should be reversed? Actually, browser handles offsetWidth/pageX naturally usually.
      // But for Arabic UI (RTL), dragging left usually increases width?
      // Let's check dir
      const dir = document.documentElement.dir || "rtl"
      const adjustedDelta = dir === "rtl" ? -delta : delta
      const newWidth = Math.max(50, resizingRef.current.startWidth + adjustedDelta)

      setColumnWidths(prev => {
        if (!resizingRef.current) return prev // Add safety check
        return {
          ...prev,
          [resizingRef.current.key]: newWidth
        }
      })
    }

    const onMouseUp = () => {
      if (resizingRef.current) {
        setColumnWidths(prev => {
          saveWidths(prev)
          return prev
        })
      }
      resizingRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
  }

  const resetColumnWidths = async () => {
    setColumnWidths({})
    try {
      await db.settings.delete(COLUMN_WIDTHS_KEY)
    } catch { }
  }

  const COLUMN_LABELS_KEY = 'products_column_labels_v1'
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({})
  const [renameKey, setRenameKey] = useState<string>('productName')
  const [renameValue, setRenameValue] = useState<string>('')

  const labelsLoaded = useRef(false)
  useEffect(() => {
    if (labelsLoaded.current) return
    labelsLoaded.current = true

    const loadLabels = async () => {
      try {
        const key = COLUMN_LABELS_KEY
        const setting = await db.settings.get(key)
        let obj: any = {}
        if (setting?.value) {
          obj = setting.value
        } else {
          const raw = localStorage.getItem(key)
          obj = raw ? JSON.parse(raw) : {}
          if (raw) {
            await db.settings.put({ key, value: obj })
            localStorage.removeItem(key)
          }
        }
        setColumnLabels(obj || {})
        setRenameValue(obj['productName'] || t('products.columns.productName'))
      } catch { }
    }
    loadLabels()
  }, [t])

  const saveColumnLabels = async (obj: Record<string, string>) => {
    try {
      await db.settings.put({ key: COLUMN_LABELS_KEY, value: obj })
      localStorage.removeItem(COLUMN_LABELS_KEY)
    } catch { }
    setColumnLabels(obj)
  }

  const defaultLabelFor = (key: string): string => {
    return t(`products.columns.${key}`) || key
  }

  const getColumnLabel = (key: string): string => {
    const v = columnLabels[key]
    return typeof v === 'string' && v.trim().length > 0 ? v : defaultLabelFor(key)
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getHeaderContent = (colKey: string) => {
    if (columnLabels[colKey]) return columnLabels[colKey]
    return <DualText k={`products.columns.${colKey}`} forceArFirst className="whitespace-nowrap" />
  }

  // Old filteredProducts logic replaced by useMemo above

  function getComparableValue(p: Product, col: SortColumn): string | number {
    if (!col) return 0
    if (col === "turnoverRate") {
      const r = calculateTurnover(p)
      return isFinite(r) && !isNaN(r) ? r : 0
    }
    if (col === "itemNumber") {
      const raw = String(p.itemNumber || "").trim()
      const s = convertNumbersToEnglish(raw)
      const digits = s.replace(/\D/g, "")
      if (digits.length > 0) {
        const n = parseInt(digits, 10)
        return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
      }
      return Number.MAX_SAFE_INTEGER
    }

    // Explicitly handle numeric columns for sorting
    if (['openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference', 'price', 'averagePrice', 'currentStockValue', 'issuesValue', 'quantityPerCarton'].includes(col)) {
      if (col === 'currentStock') {
        // Dynamic Calc for Sorting
        const op = Number(p.openingStock) || 0
        const pu = Number(p.purchases) || 0
        const iss = Number(p.issues) || 0
        return op + pu - iss
      }
      if (col === 'difference') {
        const op = Number(p.openingStock) || 0
        const pu = Number(p.purchases) || 0
        const iss = Number(p.issues) || 0
        const curr = op + pu - iss
        const inv = Number(p.inventoryCount) || 0
        return curr - inv
      }
      if (col === 'issuesValue') {
        const iss = Number(p.issues) || 0
        const pr = Number(p.price) || 0
        return iss * pr
      }
      return Number((p as any)[col] || 0)
    }

    return (p as any)[col]
  }

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortColumn) return 0
    const aValue = getComparableValue(a, sortColumn)
    const bValue = getComparableValue(b, sortColumn)
    if (aValue === null || aValue === undefined) return 1
    if (bValue === null || bValue === undefined) return -1
    let comparison = 0
    if (typeof aValue === "number" && typeof bValue === "number") {
      comparison = aValue - bValue
    } else if (typeof aValue === "string" && typeof bValue === "string") {
      comparison = aValue.localeCompare(bValue, "ar-SA")
    } else {
      comparison = String(aValue).localeCompare(String(bValue), "ar-SA")
    }
    return sortDirection === "asc" ? comparison : -comparison
  })

  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: sortedProducts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 10,
  })

  const handlePreview = async (p: Product) => {
    if (!p.image) {
      setImageUploadId(p.id)
      fileInputRef.current?.click()
      return
    }

    let src = ""
    if (p.image === 'DB_IMAGE') {
      try {
        const rec = await db.productImages.get(p.id)
        if (rec?.data) src = rec.data
      } catch { }
    } else {
      src = p.image
    }

    if (src) {
      setPreviewSrc(getSafeImageSrc(src))
      setPreviewOpen(true)
    }
  }

  const handleDelete = () => {
    if (deleteId) {
      onDelete(deleteId)
      setDeleteId(null)
    }
  }

  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }))
  }
  const showAllColumns = () => {
    const all: any = {}
    Object.keys(visibleColumns).forEach(k => { all[k] = true })
    setVisibleColumns(all)
  }
  const hideAllColumns = () => {
    const none: any = {}
    Object.keys(visibleColumns).forEach(k => { none[k] = false })
    setVisibleColumns(none)
  }

  const handleImageUpload = (product: Product, file: File) => {
    setUploadingImageId(product.id)
    setUploadProgress(0)

    // Validate format
    const allowedFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedFormats.includes(file.type)) {
      toast({
        title: getDualString("products.table.image.invalidFormat"),
        description: getDualString("products.table.image.invalidFormatDesc")
      })
      setUploadingImageId(null)
      return
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: getDualString("products.table.image.tooLarge"),
        description: getDualString("products.table.image.tooLargeDesc")
      })
      setUploadingImageId(null)
      return
    }

    // Client-Side Base64 Upload (Matches Product Form logic)
    // "Same logic as saving in database" -> Direct Base64 storage
    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = reader.result as string

      try {
        const updated = await updateProduct(product.id, {
          image: base64,
        })

        if (updated) {
          toast({
            title: getDualString("products.table.image.saveSuccess"),
            description: getDualString("products.table.image.saveDesc")
          })
        } else {
          console.error("[ImageUpload] Update returned null")
        }
      } catch (err: any) {
        console.error("Image Save Error:", err)
        toast({
          title: getDualString("products.table.image.uploadError"),
          description: err.message,
          variant: "destructive"
        })
      } finally {
        setUploadingImageId(null)
        setUploadProgress(0)
      }
    }

    reader.onerror = () => {
      toast({
        title: getDualString("products.table.image.uploadError"),
        variant: "destructive"
      })
      setUploadingImageId(null)
    }

    reader.readAsDataURL(file)
  }


  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const order: Array<keyof typeof visibleColumns | 'actions'> = [
        'image', 'productCode', 'itemNumber', 'productName', 'location', 'category', 'unit', 'quantityPerCarton', 'cartonDimensions',
        'openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference',
        'price', 'averagePrice', 'currentStockValue', 'issuesValue', 'turnoverRate', 'status', 'lastActivity'
      ]
      const active = order.filter((k) => k !== 'actions' && (visibleColumns as any)[k])
      const headers = active.map((k) => getColumnLabel(k))
      const dataset = exportMode === 'filtered' ? sortedProducts : products
      // Pre-process rows to resolve images (async)
      const rows = await Promise.all(dataset.map(async (p) => {
        let imageData = p.image || ''
        if (imageData === 'DB_IMAGE') {
          try {
            // We need db instance here. Ensure db is imported from @/lib/db
            const rec = await db.productImages.get(p.id)
            if (rec?.data) imageData = rec.data
          } catch { }
        }

        return active.map((k) => {
          switch (k) {
            case 'image': return imageData // Export actual base64/URL
            case 'productCode': return convertNumbersToEnglish(p.productCode)
            case 'itemNumber': return convertNumbersToEnglish(p.itemNumber)
            case 'productName': return p.productName
            case 'location': return p.location
            case 'category': return p.category
            case 'unit': return p.unit
            case 'quantityPerCarton': return p.quantityPerCarton
            case 'cartonDimensions': {
              const L = p.cartonLength
              const W = p.cartonWidth
              const H = p.cartonHeight
              const parts = [L, W, H].filter(v => v !== undefined && v !== null && v !== 0)
              const base = parts.length ? parts.join(" × ") : ''
              return base ? (p.cartonUnit ? `${base} ${p.cartonUnit}` : base) : ''
            }
            case 'openingStock': return p.openingStock
            case 'purchases': return p.purchases
            case 'openingStock': return Number(p.openingStock || 0)
            case 'purchases': return Number(p.purchases || 0)
            case 'issues': return Number(p.issues || 0)
            case 'inventoryCount': {
              const op = Number(p.openingStock) || 0
              const pu = Number(p.purchases) || 0
              const iss = Number(p.issues) || 0
              // [User Request] ALWAYS use Equation (System Stock) regardless of manual entry
              return op + pu - iss
            }
            case 'currentStock': {
              const op = Number(p.openingStock) || 0
              const pu = Number(p.purchases) || 0
              const iss = Number(p.issues) || 0
              return op + pu - iss
            }
            case 'difference': {
              // [User Request] Since Inventory is forced to System Stock, Difference is always 0
              return 0
            }
            case 'price': return Number(p.price || 0)
            case 'averagePrice': return Number(p.averagePrice || 0)
            case 'currentStockValue': return Number(p.currentStockValue || 0)
            case 'issuesValue': {
              const issues = Number(p.issues || 0)
              const price = Number(p.price || 0)
              return Number((issues * price).toFixed(5))
            }
            case 'turnoverRate': {
              const r = calculateTurnover(p)
              const v = isFinite(r) && !isNaN(r) ? r : 0
              return `${(v * 100).toFixed(2)}%`
            }
            case 'status': return getStatusKey(p)
            case 'lastActivity': return p.lastActivity || ''
            default: return ''
          }
        })
      }))
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, exportMode === 'filtered' ? 'Filtered' : 'All')
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products_${exportMode}_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      const count = dataset.length
      const modeKey = exportMode === 'filtered' ? "products.table.export.mode.filtered" : "products.table.export.mode.all"
      toast({
        title: getDualString("products.table.export.success"),
        description: getDualString("products.table.export.excelDesc", undefined, undefined, { count, mode: getDualString(modeKey) })
      })
    } catch (err) {
      toast({
        title: getDualString("products.table.export.error"),
        description: getDualString("products.table.export.excelError"),
        variant: 'destructive'
      })
    }
  }

  const exportDimensionsCSV = () => {
    try {
      const dataset = exportMode === 'filtered' ? sortedProducts : products
      const headers = ['كود المنتج', 'اسم المنتج', 'الطول', 'العرض', 'الارتفاع', 'الوحدة']
      const rows = dataset.map((p) => {
        const L = p.cartonLength ?? ''
        const W = p.cartonWidth ?? ''
        const H = p.cartonHeight ?? ''
        const U = p.cartonUnit ?? ''
        return [convertNumbersToEnglish(p.productCode), p.productName, L, W, H, U]
      })
      const csv = [headers, ...rows].map(r => r.map(v => String(v).replace(/"/g, '""')).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carton_dimensions_${exportMode}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({
        title: getDualString("products.table.export.success"),
        description: getDualString("products.table.export.csvDesc", undefined, undefined, { count: rows.length })
      })
    } catch (err) {
      toast({
        title: getDualString("products.table.export.error"),
        description: getDualString("products.table.export.csvError"),
        variant: 'destructive'
      })
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file || !imageUploadId) return
          const targetProduct = sortedProducts.find((p) => p.id === imageUploadId) || products.find((p) => p.id === imageUploadId)
          if (targetProduct) {
            handleImageUpload(targetProduct, file)
          }
          setImageUploadId(null)
          e.currentTarget.value = ""
        }}
      />
      <div className="rounded-lg border bg-card overflow-auto max-h-[70vh]">
        <div className="sticky top-0 z-30 bg-card px-3 py-2 flex flex-col md:flex-row justify-between gap-4 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t("common.filter")}</span>
            </div>
            <Input
              className="w-[150px] sm:w-[200px] h-8"
              placeholder={t("products.search.placeholder")}
              value={internalSearchTerm}
              onChange={handleSearchChange}
            />
            <Select value={turnoverFilter} onValueChange={(v: any) => setTurnoverFilter(v)}>
              <SelectTrigger className="w-full sm:w-[130px] h-8">
                <SelectValue placeholder={t("products.turnover.filter.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><DualText k="products.turnover.filter.all" /></SelectItem>
                <SelectItem value="fast"><DualText k="products.turnover.filter.fast" /></SelectItem>
                <SelectItem value="normal"><DualText k="products.turnover.filter.normal" /></SelectItem>
                <SelectItem value="slow"><DualText k="products.turnover.filter.slow" /></SelectItem>
                <SelectItem value="stagnant"><DualText k="products.turnover.filter.stagnant" /></SelectItem>
                <SelectItem value="new"><DualText k="products.turnover.filter.new" /></SelectItem>
              </SelectContent>
            </Select>

            {/* Moved Category Filter */}
            {onCategoryChange && (
              <Select value={selectedCategory} onValueChange={onCategoryChange}>
                <SelectTrigger className="w-[130px] h-8">
                  <Filter className="ml-2 h-3 w-3" />
                  <SelectValue placeholder={t("common.category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><DualText k="branches.report.filters.allCategories" /></SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Stock Level Filter (New) */}
            <Select value={stockLevelFilter} onValueChange={(v: any) => setStockLevelFilter(v)}>
              <SelectTrigger className="w-[130px] h-8">
                <Filter className="ml-2 h-3 w-3" />
                <SelectValue placeholder={t("products.stockStatus.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><DualText k="products.stockStatus.all" /></SelectItem>
                <SelectItem value="available"><DualText k="products.stockStatus.available" /></SelectItem>
                <SelectItem value="low"><DualText k="products.stockStatus.low" /></SelectItem>
                <SelectItem value="out"><DualText k="products.stockStatus.out" /></SelectItem>
              </SelectContent>
            </Select>

            {/* Moved Location Filter */}
            {onLocationChange && (
              <Select value={selectedLocation} onValueChange={onLocationChange}>
                <SelectTrigger className="w-[130px] h-8">
                  <Filter className="ml-2 h-3 w-3" />
                  <SelectValue placeholder={t("common.location")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><DualText k="reports.filters.allLocations" /></SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Reset Button */}
            {(effectiveSearchTerm || turnoverFilter !== 'all' || stockLevelFilter !== 'all' || selectedCategory !== 'all' || selectedLocation !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 lg:px-3"
                onClick={() => {
                  if (onSearchChange) onSearchChange("")
                  else setLocalSearchTerm("")
                  setTurnoverFilter("all")
                  setStockLevelFilter("all")
                  if (onReset) onReset()
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                <span className="sr-only lg:not-sr-only"><DualText k="common.reset" /></span>
              </Button>
            )}

            {/* New Filters */}
            <div className="flex items-center gap-4 px-2 bg-muted/20 p-1 rounded-md border">
              <div className="flex items-center gap-2">
                <Checkbox id="excludeZero" checked={excludeZeroStock} onCheckedChange={(c) => setExcludeZeroStock(!!c)} />
                <label htmlFor="excludeZero" className="text-sm cursor-pointer select-none"><DualText k="home.filters.excludeZero" /></label>
              </div>

              <div className="h-4 w-px bg-border" />

              <div className="flex items-center gap-2">
                <Checkbox id="mergeIdentical" checked={mergeIdentical} onCheckedChange={(c) => setMergeIdentical(!!c)} />
                <label htmlFor="mergeIdentical" className="text-sm cursor-pointer select-none"><DualText k="home.filters.mergeDuplicates" /></label>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  <DualText k="products.columns.show" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto">
                {Object.keys(visibleColumns).map((key) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={(visibleColumns as any)[key]}
                    onCheckedChange={() => toggleColumn(key as any)}
                  >
                    {getColumnLabel(key)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={showAllColumns}><DualText k="common.showAll" /></Button>
            <Button variant="ghost" size="sm" onClick={hideAllColumns}><DualText k="common.hideAll" /></Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><DualText k="products.columns.toggleLabel" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80 p-4">
                <div className="space-y-2">
                  <select
                    className="w-full border rounded h-9 px-2 text-sm"
                    value={renameKey}
                    onChange={(e) => { const k = e.target.value; setRenameKey(k); setRenameValue(getColumnLabel(k)) }}
                  >
                    {Object.keys(visibleColumns).map((k) => (
                      <option key={k} value={k}>{defaultLabelFor(k)}</option>
                    ))}
                    {/* ... */}

                  </select>
                  <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder={t("form.name")} className="h-9" />
                  <Button size="sm" onClick={() => { const obj = { ...columnLabels, [renameKey]: renameValue.trim() }; saveColumnLabels(obj) }} className="w-full"><DualText k="common.save" /></Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Font Size Removed */}

            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
              <DualText k="products.turnover.settings" />
            </Button>

            <Select value={exportMode} onValueChange={(v: any) => setExportMode(v)}>
              <SelectTrigger className="w-[170px] h-8">
                <SelectValue placeholder={t("products.export.modePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="filtered"><DualText k="products.export.filtered" /></SelectItem>
                <SelectItem value="all"><DualText k="products.export.all" /></SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => generateProductsPDF({
              products: exportMode === 'filtered' ? sortedProducts : products,
              visibleColumns,
              columnLabels,
              title: t("products.list")
            })}
              disabled={exportMode === 'filtered' ? sortedProducts.length === 0 : false}
            >
              <Printer className="ml-2 h-4 w-4" />
              <DualText k="products.export.printPdf" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportMode === 'filtered' ? sortedProducts.length === 0 : false}>
              <Download className="ml-2 h-4 w-4" />
              <DualText k="products.export.excel" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportDimensionsCSV} disabled={exportMode === 'filtered' ? sortedProducts.length === 0 : false}>
              <Download className="ml-2 h-4 w-4" />
              <DualText k="products.export.dimensionsCsv" />
            </Button>
          </div>
        </div>

        <div ref={parentRef} className="rounded-b-lg border bg-card overflow-auto max-h-[70vh]">
          <table
            className="w-full caption-bottom border-collapse transition-all"
            style={{ fontSize: `${fontSize}px` }}
          >
            <thead className="sticky top-0 bg-card z-40 shadow-sm border-b">
              <tr className="text-xs">
                {Object.keys(visibleColumns).map(key => {
                  if (!(visibleColumns as any)[key]) return null
                  const width = columnWidths[key]
                  return (
                    <th
                      key={key}
                      className="text-center p-2 border-b cursor-pointer hover:bg-muted/50 relative group select-none whitespace-nowrap"
                      style={{ width: width ? `${width}px` : 'auto', minWidth: width ? `${width}px` : 'auto' }}
                      onClick={() => handleSort(key as any)}
                    >
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        {getHeaderContent(key)}
                        {sortColumn === key && (
                          sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        )}
                      </div>
                      {/* Resize Handle */}
                      <div
                        className="absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary bg-transparent transition-colors z-50"
                        style={{ [t("common.dir") === 'rtl' ? 'left' : 'right']: 0 }}
                        onMouseDown={(e) => handleResizeStart(e, key)}
                      />
                    </th>
                  )
                })}
                <th className="text-center p-2 border-b bg-card whitespace-nowrap">{t("products.columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={Object.keys(visibleColumns).length + 1} className="text-center py-8 text-muted-foreground border-b">
                    {t("products.empty")}
                  </td>
                </tr>
              ) : (
                <>
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }}>
                      <td colSpan={Object.keys(visibleColumns).length + 1} style={{ padding: 0, border: 0 }} />
                    </tr>
                  )}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const product = sortedProducts[virtualRow.index]
                    return (
                      <tr key={product.id} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} className="hover:bg-muted/30 transition-colors">
                        {Object.keys(visibleColumns).map(key => {
                          if (!(visibleColumns as any)[key]) return null
                          if (key === 'image') {
                            return (
                              <td
                                key={key}
                                className={`p-2 text-center border-b align-middle transition-colors ${dropActiveId === product.id ? "bg-blue-100 border-blue-500" : ""}`}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setDropActiveId(product.id)
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  if (dropActiveId === product.id) {
                                    setDropActiveId(null)
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setDropActiveId(null)

                                  const files = e.dataTransfer.files
                                  if (files && files.length > 0) {
                                    const file = files[0]
                                    handleImageUpload(product, file)
                                  }
                                }}
                              >
                                <div className="flex items-center justify-center relative">
                                  {dropActiveId === product.id && (
                                    <div className="absolute inset-0 z-10 bg-blue-500/10 flex items-center justify-center rounded pointer-events-none">
                                      <div className="bg-background text-primary px-2 py-1 rounded text-xs shadow-sm font-medium">
                                        Drop to upload
                                      </div>
                                    </div>
                                  )}
                                  {uploadingImageId === product.id && (
                                    <div className="absolute inset-0 z-20 bg-background/50 flex items-center justify-center rounded">
                                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    </div>
                                  )}
                                  <ProductImage
                                    key={product.image || 'no-image'}
                                    product={product}
                                    className="h-10 w-10 cursor-pointer"
                                    onClick={() => handlePreview(product)}
                                  />
                                </div>
                              </td>
                            )
                          }
                          let content: React.ReactNode = (product as any)[key]

                          // Dynamic calculations for derived columns
                          if (key === 'currentStock') {
                            // Calculate current stock: Opening + Purchases - Issues
                            const opening = Number(product.openingStock) || 0
                            const purchases = Number(product.purchases) || 0
                            const issues = Number(product.issues) || 0
                            const calculatedStock = opening + purchases - issues
                            content = calculatedStock
                          }

                          if (key === 'difference') {
                            // [User Request] Force Difference to 0 as Manual Inventory is disabled
                            content = 0
                          }

                          if (key === 'inventoryCount') {
                            // [User Request] Force Inventory to System Stock Equation
                            const opening = Number(product.openingStock) || 0
                            const purchases = Number(product.purchases) || 0
                            const issues = Number(product.issues) || 0
                            const calculatedStock = opening + purchases - issues
                            content = calculatedStock // FORCE EQUATION
                          }

                          if (key === 'cartonDimensions') {
                            const L = product.cartonLength
                            const W = product.cartonWidth
                            const H = product.cartonHeight
                            const parts = [L, W, H].filter(v => v !== undefined && v !== null && v !== 0)
                            const base = parts.length ? parts.join(" × ") : ""
                            content = base ? (product.cartonUnit ? `${base} ${product.cartonUnit}` : base) : ""
                          }

                          if (key === 'status') content = getStatusLabel(getStatusKey(product))
                          if (key === 'turnoverRate') content = `${(calculateTurnover(product) * 100).toFixed(2)}%`

                          // Formatting
                          if (key === 'issuesValue') {
                            // ✅ Calculate dynamically: issues × price
                            const issues = Number(product.issues || 0)
                            const price = Number(product.price || 0)
                            const calculatedValue = issues * price
                            const val = parseFloat(calculatedValue.toFixed(5))
                            content = formatEnglishNumber(val)
                          }
                          if (['price', 'averagePrice', 'currentStockValue'].includes(key)) content = formatEnglishNumber(Number(content).toFixed(2))

                          // Quantity Formatting with Carton Breakdown
                          if (['openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference'].includes(key)) {
                            let numVal = Number(content || 0)

                            // [User Request] For Inventory Count, default to System Stock if undefined
                            if (key === 'inventoryCount' && (product.inventoryCount === undefined || product.inventoryCount === null)) {
                              const op = Number(product.openingStock) || 0
                              const pu = Number(product.purchases) || 0
                              const iss = Number(product.issues) || 0
                              numVal = op + pu - iss
                              content = numVal // Update content for "difference" calculation logic below? No, difference logic is separate above.
                            }
                            const perCarton = Number(product.quantityPerCarton || 1)

                            if (perCarton > 1 && numVal !== 0 && !isNaN(numVal)) {
                              const absVal = Math.abs(numVal)
                              const cartons = Math.floor(absVal / perCarton)
                              const remainder = absVal % perCarton
                              const sign = numVal < 0 ? "-" : ""

                              const parts = []
                              const cartonLabel = product.cartonUnit || 'كرتون'
                              const unitLabel = product.unit || 'حبة'

                              if (cartons > 0) parts.push(`${cartons} ${cartonLabel}`)
                              // Helper logic: if remainder is 0, we can omit it usually, or for clarity "5 Box + 0 Piece".
                              // Usually "5 Box" is cleaner.
                              if (remainder > 0) parts.push(`${remainder} ${unitLabel}`)

                              // If parts is empty (e.g. 0), generic format. But we checked numVal !== 0.

                              if (parts.length > 0) {
                                content = (
                                  <div className="flex flex-col items-center justify-center leading-tight">
                                    <span className="font-medium text-foreground">{formatEnglishNumber(numVal)}</span>
                                    <span className="text-[10px] whitespace-nowrap" dir="rtl">
                                      {sign}({parts.join(' + ')})
                                    </span>
                                  </div>
                                )
                              } else {
                                content = formatEnglishNumber(numVal)
                              }
                            } else {
                              content = formatEnglishNumber(numVal)
                            }
                          } else if (key === 'quantityPerCarton') {
                            content = formatEnglishNumber(Number(content || 0))
                          }

                          // Explicitly ensure productCode and itemNumber are NOT formatted (raw strings/numbers)
                          if (['productCode', 'itemNumber'].includes(key)) content = (product as any)[key]

                          if (key === 'lastActivity' && content) {
                            try {
                              content = formatArabicGregorianDateTime(new Date(String(content)))
                            } catch { }
                          }

                          const cellWidth = columnWidths[key]
                          // Default widths if not set (auto)
                          let defaultWidth = 'auto'
                          if (!cellWidth) {
                            if (key === 'productName') defaultWidth = '300px'
                            if (key === 'productCode') defaultWidth = '140px'
                            if (key === 'location') defaultWidth = '120px'
                            if (key === 'category') defaultWidth = '120px'
                            if (key === 'unit') defaultWidth = '80px'
                          }

                          const finalWidth = cellWidth ? `${cellWidth}px` : defaultWidth

                          return (
                            <td
                              key={key}
                              className="p-2 text-center border-b align-middle"
                              style={{ width: finalWidth, minWidth: finalWidth }}
                            >
                              <div
                                className="line-clamp-2 overflow-hidden text-ellipsis break-words"
                                title={
                                  (() => {
                                    if (['currentStock', 'inventoryCount'].includes(key)) {
                                      const op = Number(product.openingStock) || 0
                                      const pu = Number(product.purchases) || 0
                                      const iss = Number(product.issues) || 0
                                      const calc = op + pu - iss
                                      let tooltip = `المعادلة: افتتاحي (${op}) + مشتريات (${pu}) - مصروفات (${iss}) = ${calc}`

                                      if (key === 'inventoryCount' && product.inventoryCount !== undefined && product.inventoryCount !== null) {
                                        tooltip += `\n (قيمة يدوية: ${product.inventoryCount})`
                                      }
                                      return tooltip
                                    }
                                    return typeof content === 'string' || typeof content === 'number' ? String(content) : undefined
                                  })()
                                }
                              >
                                {content}
                              </div>
                            </td>
                          )
                        })}
                        <td className="p-2 text-center border-b align-middle">
                          <div className="flex items-center gap-1 justify-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600" onClick={() => onEdit(product)} disabled={!hasPermission(user, 'inventory.edit')}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => setDeleteId(product.id)} disabled={!hasPermission(user, 'inventory.delete')}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px` }}>
                      <td colSpan={Object.keys(visibleColumns).length + 1} style={{ padding: 0, border: 0 }} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(() => {
        const totalFiltered = filteredProducts.length
        const statusKeys: Array<"fast" | "normal" | "slow" | "stagnant" | "new"> = ["fast", "normal", "slow", "stagnant", "new"]
        const statusMeta: Record<string, { titleKey: string; bg: string; border: string; text: string; hintKey: string }> = {
          fast: { titleKey: "status.fast", bg: "bg-green-50", border: "border-green-200", text: "text-green-900", hintKey: "status.fast" },
          normal: { titleKey: "status.normal", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900", hintKey: "status.normal" },
          slow: { titleKey: "status.slow", bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-900", hintKey: "status.slow" },
          stagnant: { titleKey: "status.stagnant", bg: "bg-red-50", border: "border-red-200", text: "text-red-900", hintKey: "status.stagnant" },
          new: { titleKey: "status.new", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-900", hintKey: "status.new" },
        }
        const items = statusKeys.map((key) => {
          const list = filteredProducts.filter((p) => getStatusKey(p) === key)
          const count = list.length
          const value = list.reduce((sum, p) => sum + Number(p.currentStockValue || 0), 0)
          return { key, count, value }
        })
        return (
          <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {items.map(({ key, count, value }) => {
              const m = statusMeta[key]
              return (
                <Card key={key} className={`${m.bg} ${m.border} ${m.text} border`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm"><DualText k={m.titleKey} /></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatEnglishNumber(String(count))} <DualText k="common.product" /></div>
                    <div className="text-sm">{formatEnglishNumber((value || 0).toFixed(2))} <DualText k="common.currency" /></div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      })()}

      <TurnoverSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        thresholds={thresholds}
        onSave={saveThresholds}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-auto p-0">
          <img src={previewSrc} alt="Preview" className="w-full h-auto object-contain" />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[95vw] w-full sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("products.delete.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("products.delete.confirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
