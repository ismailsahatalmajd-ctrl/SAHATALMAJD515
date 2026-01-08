"use client"

import { useState, useRef, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2, ImageIcon, Settings2, ArrowUp, ArrowDown, Filter, Loader2, Download, Printer } from 'lucide-react'
import type { Product } from "@/lib/types"
import { generateProductsPDF } from "@/lib/products-pdf-generator"
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
import { updateProduct } from "@/lib/storage"
import { getSafeImageSrc, formatArabicGregorianDate, formatEnglishNumber } from "@/lib/utils"
import { useI18n } from "@/components/language-provider"
import { toast } from "@/hooks/use-toast"
import { db } from "@/lib/db"
import { DualText } from "@/components/ui/dual-text"
import { ProductImage } from "@/components/product-image"

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
}

type DerivedColumn = "turnoverRate" | "status"
type SortColumn = keyof Product | DerivedColumn | null
type SortDirection = "asc" | "desc"

export function ProductsTable({ products, onEdit, onDelete }: ProductsTableProps) {
  const { t } = useI18n()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn>("turnoverRate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [imageUploadId, setImageUploadId] = useState<string | null>(null)
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dropActiveId, setDropActiveId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [turnoverFilter, setTurnoverFilter] = useState<"all" | "fast" | "normal" | "slow" | "stagnant" | "new">("all")
  const [exportMode, setExportMode] = useState<"filtered" | "all">("filtered")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSrc, setPreviewSrc] = useState("")
  const [previewTitle, setPreviewTitle] = useState("")
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false)
  const [thresholds, setThresholds] = useState({ stagnant: 0.2, slow: 0.5, normal: 1 })

  useEffect(() => {
    const loadThresholds = async () => {
      try {
        const s = await db.settings.get('turnover_thresholds')
        if (s?.value) setThresholds(s.value)
      } catch { }
    }
    loadThresholds()
  }, [])

  const applyThresholds = async (newThresholds: typeof thresholds) => {
    setThresholds(newThresholds)
    try {
      await db.settings.put({ key: 'turnover_thresholds', value: newThresholds })
    } catch { }
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const calculateTurnover = (p: Product) => {
    const sold = p.issues || 0
    const totalAvailable = (p.openingStock || 0) + (p.purchases || 0)
    if (totalAvailable === 0) return 0
    return sold / totalAvailable
  }

  const getStatusKey = (p: Product): "fast" | "normal" | "slow" | "stagnant" | "new" => {
    const rate = calculateTurnover(p)
    if (rate >= thresholds.normal) return "fast"
    if (rate >= thresholds.slow) return "normal"
    if (rate >= thresholds.stagnant) return "slow"
    return "stagnant"
  }

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

  const getHeaderContent = (colKey: string) => {
    if (columnLabels[colKey]) return columnLabels[colKey]
    return <DualText k={`products.columns.${colKey}`} />
  }

  const filteredProducts = (products || []).filter((p) => {
    if (!p) return false
    const matchesSearch = searchTerm
      ? String(p.productName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(p.productCode ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(p.itemNumber ?? "").toLowerCase().includes(searchTerm.toLowerCase())
      : true
    const statusOk = turnoverFilter === "all" ? true : getStatusKey(p) === turnoverFilter
    return matchesSearch && statusOk
  })

  function getComparableValue(p: Product, col: SortColumn): string | number {
    if (!col) return 0
    if (col === "turnoverRate") {
      const r = calculateTurnover(p)
      return isFinite(r) && !isNaN(r) ? r : 0
    }
    if (col === "status") return ["stagnant", "slow", "normal", "fast", "new"].indexOf(getStatusKey(p))
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
      toast({ title: "فشل إضافة الصورة", description: "صيغة غير مدعومة. استخدم JPG أو PNG أو GIF" })
      setUploadingImageId(null)
      return
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "فشل إضافة الصورة", description: "حجم الصورة كبير جداً (أقصى حد 5 ميجابايت)" })
      setUploadingImageId(null)
      return
    }

    // Firebase Storage Upload
    const uploadToFirebase = async () => {
      try {
        const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage")
        const { storage } = await import("@/lib/firebase")

        // Create a reference - using timestamp to avoid caching issues with same name
        const filename = `product-images/${product.id}/${Date.now()}-${file.name}`
        const storageRef = ref(storage, filename)

        // Upload
        const snapshot = await uploadBytes(storageRef, file)

        // Get URL
        const downloadURL = await getDownloadURL(snapshot.ref)

        // Update Product with URL
        const updated = await updateProduct(product.id, {
          image: downloadURL,
        })

        if (updated) {
          toast({ title: "تم حفظ الصورة", description: "تم رفع الصورة للسحابة بنجاح" })
          try {
            sessionStorage.setItem("productFormFocusSection", "image")
            sessionStorage.setItem("productFormAutoCloseMs", String(1500))
          } catch { }
        }
      } catch (err) {
        console.error("Firebase Storage Error:", err)
        toast({ title: "فشل رفع الصورة", description: "تأكد من الاتصال بالإنترنت", variant: "destructive" })
      } finally {
        setUploadingImageId(null)
        setUploadProgress(0)
      }
    }

    uploadToFirebase()
  }

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const order: Array<keyof typeof visibleColumns | 'actions'> = [
        'image', 'productCode', 'itemNumber', 'productName', 'location', 'category', 'unit', 'cartonDimensions',
        'openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference',
        'price', 'averagePrice', 'currentStockValue', 'issuesValue', 'turnoverRate', 'status', 'lastActivity'
      ]
      const active = order.filter((k) => k !== 'actions' && (visibleColumns as any)[k])
      const headers = active.map((k) => getColumnLabel(k))
      const dataset = exportMode === 'filtered' ? sortedProducts : products
      const rows = dataset.map((p) => {
        return active.map((k) => {
          switch (k) {
            case 'image': return (p.image || '')
            case 'productCode': return convertNumbersToEnglish(p.productCode)
            case 'itemNumber': return convertNumbersToEnglish(p.itemNumber)
            case 'productName': return p.productName
            case 'location': return p.location
            case 'category': return p.category
            case 'unit': return p.unit
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
            case 'issues': return p.issues
            case 'inventoryCount': return p.inventoryCount
            case 'currentStock': return p.currentStock
            case 'difference': {
              const opening = Number(p.openingStock) || 0
              const purchases = Number(p.purchases) || 0
              const issues = Number(p.issues) || 0
              const currentStock = (p.currentStock !== undefined) ? Number(p.currentStock) : (opening + purchases - issues)
              const inventoryCount = Number(p.inventoryCount) || 0
              return currentStock - inventoryCount
            }
            case 'price': return p.price
            case 'averagePrice': return p.averagePrice
            case 'currentStockValue': return p.currentStockValue
            case 'issuesValue': {
              const val = parseFloat(Number(p.issuesValue || 0).toFixed(5))
              return val
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
      })
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
      toast({ title: 'تم التصدير', description: `تم تصدير ${count} صف إلى Excel (${exportMode === 'filtered' ? 'المفلتر' : 'الكامل'})` })
    } catch (err) {
      toast({ title: 'فشل التصدير', description: 'تعذر إنشاء ملف Excel', variant: 'destructive' })
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
      toast({ title: 'تم التصدير', description: `تم تصدير ${rows.length} صف أبعاد إلى CSV` })
    } catch (err) {
      toast({ title: 'فشل التصدير', description: 'تعذر إنشاء ملف CSV', variant: 'destructive' })
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select value={turnoverFilter} onValueChange={(v: any) => setTurnoverFilter(v)}>
              <SelectTrigger className="w-full sm:w-[180px] h-8">
                <SelectValue placeholder={t("products.turnover.filter.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("products.turnover.filter.all")}</SelectItem>
                <SelectItem value="fast">{t("products.turnover.filter.fast")}</SelectItem>
                <SelectItem value="normal">{t("products.turnover.filter.normal")}</SelectItem>
                <SelectItem value="slow">{t("products.turnover.filter.slow")}</SelectItem>
                <SelectItem value="stagnant">{t("products.turnover.filter.stagnant")}</SelectItem>
                <SelectItem value="new">{t("products.turnover.filter.new", "جديد")}</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  {t("products.columns.show")}
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
            <Button variant="outline" size="sm" onClick={showAllColumns}>إظهار الكل</Button>
            <Button variant="ghost" size="sm" onClick={hideAllColumns}>إخفاء الكل</Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">تعديل الأسماء</Button>
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
                  </select>
                  <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="اسم العمود الجديد" className="h-9" />
                  <Button size="sm" onClick={() => { const obj = { ...columnLabels, [renameKey]: renameValue.trim() }; saveColumnLabels(obj) }} className="w-full">حفظ</Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
              {t("products.turnover.settings")}
            </Button>

            <Select value={exportMode} onValueChange={(v: any) => setExportMode(v)}>
              <SelectTrigger className="w-[170px] h-8">
                <SelectValue placeholder="نوع التصدير" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="filtered">تصدير المفلتر</SelectItem>
                <SelectItem value="all">تصدير الكامل</SelectItem>
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
              طباعة / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportMode === 'filtered' ? sortedProducts.length === 0 : false}>
              <Download className="ml-2 h-4 w-4" />
              تصدير Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportDimensionsCSV} disabled={exportMode === 'filtered' ? sortedProducts.length === 0 : false}>
              <Download className="ml-2 h-4 w-4" />
              تصدير الأبعاد CSV
            </Button>
          </div>
        </div>

        <div ref={parentRef} className="rounded-b-lg border bg-card overflow-auto max-h-[70vh]">
          <table className="w-full caption-bottom text-sm border-collapse">
            <thead className="sticky top-0 bg-card z-40 shadow-sm border-b">
              <tr className="text-xs">
                {Object.keys(visibleColumns).map(key => {
                  if (!(visibleColumns as any)[key]) return null
                  return (
                    <th key={key} className="text-center p-2 border cursor-pointer hover:bg-muted/50" onClick={() => handleSort(key as any)}>
                      <div className="flex items-center justify-center gap-1">
                        {getHeaderContent(key)}
                        {sortColumn === key && (
                          sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                  )
                })}
                <th className="text-center p-2 border bg-card whitespace-nowrap">{t("products.columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={Object.keys(visibleColumns).length + 1} className="text-center py-8 text-muted-foreground border">
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
                              <td key={key} className="p-2 text-center border align-middle">
                                <div className="flex items-center justify-center">
                                  <ProductImage
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
                            // Calculate difference: Current Stock - Inventory Count
                            // Use calculated current stock if available, else use stored
                            const opening = Number(product.openingStock) || 0
                            const purchases = Number(product.purchases) || 0
                            const issues = Number(product.issues) || 0
                            const currentStock = (product.currentStock !== undefined) ? Number(product.currentStock) : (opening + purchases - issues)

                            const inventoryCount = Number(product.inventoryCount) || 0
                            content = currentStock - inventoryCount
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
                            // Limit to 5 decimals, remove trailing zeros
                            const val = parseFloat(Number(content || 0).toFixed(5))
                            content = formatEnglishNumber(val)
                          }
                          if (['price', 'averagePrice', 'currentStockValue'].includes(key)) content = formatEnglishNumber(Number(content).toFixed(2))
                          // Apply number formatting to quantity columns, BUT NOT to code/id columns
                          if (['openingStock', 'purchases', 'issues', 'inventoryCount', 'currentStock', 'difference'].includes(key)) content = formatEnglishNumber(content)
                          // Explicitly ensure productCode and itemNumber are NOT formatted (raw strings/numbers)
                          if (['productCode', 'itemNumber'].includes(key)) content = (product as any)[key]


                          return <td key={key} className="p-2 text-center border align-middle">{content}</td>
                        })}
                        <td className="p-2 text-center border align-middle">
                          <div className="flex items-center gap-1 justify-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600" onClick={() => onEdit(product)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => setDeleteId(product.id)}>
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.turnover.settings")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <label>Stagnant Threshold</label>
              <Input type="number" value={thresholds.stagnant} onChange={e => setThresholds({ ...thresholds, stagnant: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <label>Slow Threshold</label>
              <Input type="number" value={thresholds.slow} onChange={e => setThresholds({ ...thresholds, slow: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <label>Normal Threshold</label>
              <Input type="number" value={thresholds.normal} onChange={e => setThresholds({ ...thresholds, normal: Number(e.target.value) })} />
            </div>
            <Button onClick={() => applyThresholds(thresholds)}>Apply</Button>
          </div>
        </DialogContent>
      </Dialog>

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
