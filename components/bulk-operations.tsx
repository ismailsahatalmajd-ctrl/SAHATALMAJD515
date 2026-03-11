"use client"

import type React from "react"
import * as XLSX from "xlsx"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  ArrowDownAZ, LayoutGrid, List, Plus, Search, Upload, Download,
  Settings2, Trash2, AlertTriangle, Info, MoreHorizontal, RotateCcw,
  ShieldCheck, Link as LinkIcon, Database, X, RefreshCcw
} from "lucide-react"
import { Input } from "@/components/ui/input"
import type { Product } from "@/lib/types"
import {
  getProducts, saveProducts, getCategories, addCategory,
  getLocations, addLocation, getUnits, addUnit, factoryReset, deleteDemoData, initDataStore, hardReset
} from "@/lib/storage"
import { deleteAllProductsApi } from "@/lib/sync-api"
import { performFactoryReset } from "@/lib/system-reset"
import { syncProduct, syncProductImageToCloud, stopRealtimeSync, startRealtimeSync, syncProductsBatch, syncProductImagesBatch } from "@/lib/firebase-sync-engine"
import { db } from "@/lib/db"
import { useToast } from "@/hooks/use-toast"
import { getApiUrl } from "@/lib/api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { useI18n } from "@/components/language-provider"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { BackupRestoreDialog } from "@/components/backup-restore-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/components/auth-provider"
import { hasPermission } from "@/lib/auth-utils"
import { useGranularPermissions } from "@/hooks/use-granular-permissions"

const asyncPool = async <T, R>(concurrency: number, iterable: T[], iteratorFn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const ret: Promise<R>[] = []
  const executing: Promise<any>[] = []
  for (let i = 0; i < iterable.length; i++) {
    const item = iterable[i]
    const p = Promise.resolve().then(() => iteratorFn(item, i))
    ret.push(p)
    if (concurrency <= iterable.length) {
      const e: any = p.then(() => executing.splice(executing.indexOf(e), 1))
      executing.push(e)
      if (executing.length >= concurrency) {
        await Promise.race(executing)
      }
    }
  }
  return Promise.all(ret)
}

interface BulkOperationsProps {
  products: Product[]
  filteredProducts?: Product[]
  onProductsUpdate: (products: Product[]) => void
}

export function BulkOperations({ products = [], filteredProducts, onProductsUpdate }: BulkOperationsProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { user } = useAuth()
  const { shouldShow } = useGranularPermissions()
  // States للعمليات الأساسية
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [conversionProgress, setConversionProgress] = useState(0)
  const [conversionStatus, setConversionStatus] = useState("")
  const [backupOpen, setBackupOpen] = useState(false)
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>('all')
  const [opProgress, setOpProgress] = useState(0)
  const [opStatus, setOpStatus] = useState("")
  const [opRunning, setOpRunning] = useState<null | 'delete' | 'factory' | 'demo'>(null)

  // Dialog States
  const [deleteDemoOpen, setDeleteDemoOpen] = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [factoryResetOpen, setFactoryResetOpen] = useState(false)

  const LOG_KEY = 'action_logs_v1'
  const MAPPING_PREF_KEY = 'excel_import_mapping_v1'
  const IMAGE_CACHE_KEY = 'image_base64_cache_v1'

  const imageCacheRef = useRef<Record<string, { data: string; ts: number }>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mappingPrefs, setMappingPrefs] = useState<Record<string, Record<string, number>>>({})

  // Load data from Dexie (with migration)
  useEffect(() => {
    const loadData = async () => {
      await initDataStore()
      // Load Mapping Prefs
      try {
        const mapping = await db.settings.get(MAPPING_PREF_KEY)
        if (mapping?.value) {
          setMappingPrefs(mapping.value)
        } else {
          const raw = localStorage.getItem(MAPPING_PREF_KEY)
          if (raw) {
            const obj = JSON.parse(raw)
            await db.settings.put({ key: MAPPING_PREF_KEY, value: obj })
            setMappingPrefs(obj)
            localStorage.removeItem(MAPPING_PREF_KEY)
          }
        }
      } catch { }

      // Load Image Cache (Migrate Legacy -> Dexie Table)
      try {
        // 1. Check legacy localStorage
        const raw = localStorage.getItem(IMAGE_CACHE_KEY)
        if (raw) {
          try {
            const obj = JSON.parse(raw)
            const entries = Object.entries(obj).map(([k, v]: [string, any]) => ({
              key: k,
              value: v.data,
              timestamp: v.ts || Date.now()
            }))
            if (entries.length > 0) {
              await db.imageCache.bulkPut(entries)
            }
            localStorage.removeItem(IMAGE_CACHE_KEY)
          } catch { }
        }
        // 2. Check legacy db.settings
        const cacheSetting = await db.settings.get(IMAGE_CACHE_KEY)
        if (cacheSetting?.value) {
          try {
            const obj = cacheSetting.value
            const entries = Object.entries(obj).map(([k, v]: [string, any]) => ({
              key: k,
              value: v.data,
              timestamp: v.ts || Date.now()
            }))
            if (entries.length > 0) {
              await db.imageCache.bulkPut(entries)
            }
            await db.settings.delete(IMAGE_CACHE_KEY)
          } catch { }
        }

        // 3. Prune expired entries
        const cutoff = Date.now() - IMAGE_CACHE_TTL_MS
        await db.imageCache.where('timestamp').below(cutoff).delete()

      } catch { }

      // Migrate logs if needed (optional, just moving to DB)
      try {
        const logs = await db.settings.get(LOG_KEY)
        if (!logs) {
          const raw = localStorage.getItem(LOG_KEY)
          if (raw) {
            const arr = JSON.parse(raw)
            await db.settings.put({ key: LOG_KEY, value: arr })
            localStorage.removeItem(LOG_KEY)
          }
        }
      } catch { }
    }
    loadData()
  }, [])

  const log = async (entry: any) => {
    try {
      const record = await db.settings.get(LOG_KEY)
      const arr = record?.value || []
      arr.push({ ts: new Date().toISOString(), ...entry })
      // Limit log size to 1000 entries
      if (arr.length > 1000) arr.shift()
      await db.settings.put({ key: LOG_KEY, value: arr })
    } catch { }
  }

  // حالات وبيانات مطابقة الأعمدة
  const [importMode, setImportMode] = useState<'append' | 'update'>('append')
  const [matchField, setMatchField] = useState<string>('productCode')
  const [updateFields, setUpdateFields] = useState<string[]>(['price', 'currentStock'])
  const [analysisResults, setAnalysisResults] = useState<{ matches: number; newItems: number }>({ matches: 0, newItems: 0 })

  const [mappingDialogOpen, setMappingDialogOpen] = useState(false)
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importPreviewRows, setImportPreviewRows] = useState<string[][]>([])
  const [importAllRows, setImportAllRows] = useState<string[][]>([])
  const [importImagesMap, setImportImagesMap] = useState<Record<string, string>>({})
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({})
  const [autoMappingSuggested, setAutoMappingSuggested] = useState<Record<string, number>>({})
  const [mappingSignature, setMappingSignature] = useState<string>("")
  const [manualMappings, setManualMappings] = useState<Record<number, string>>({}) // rowIndex -> product.id
  const [linkingRow, setLinkingRow] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showOnlyNew, setShowOnlyNew] = useState(false)
  const [ignoredRows, setIgnoredRows] = useState<Set<number>>(new Set())

  // تحديث تلقائي للإحصائيات عند تغيير أي خيار
  useEffect(() => {
    if (mappingDialogOpen && importAllRows.length > 1) {
      const existingProds = getProducts();
      let mCount = 0;
      let nCount = 0;
      const colIdx = columnMapping[matchField];

      importAllRows.slice(1).forEach((row, idx) => {
        const rowIndex = idx + 1;
        if (ignoredRows.has(rowIndex)) return;

        if (manualMappings[rowIndex]) {
          mCount++;
          return;
        }

        if (importMode === 'update' && colIdx !== undefined && colIdx >= 0) {
          const val = String(row[colIdx] || '').trim().toLowerCase();
          if (val && existingProds.some(p => String(p[matchField as keyof Product] || '').trim().toLowerCase() === val)) {
            mCount++;
          } else {
            nCount++;
          }
        } else {
          nCount++;
        }
      });
      setAnalysisResults({ matches: mCount, newItems: nCount });
    }
  }, [mappingDialogOpen, importAllRows, columnMapping, matchField, importMode, manualMappings, ignoredRows]);

  const expectedFields: { key: keyof Product | 'image'; label: string; k: string; required?: boolean; type: 'text' | 'number' }[] = [
    { key: 'productCode', label: 'كود المنتج', k: 'common.code', required: false, type: 'text' },
    { key: 'itemNumber', label: 'رقم المنتج', k: 'common.itemNumber', required: false, type: 'text' },
    { key: 'productName', label: 'اسم المنتج', k: 'common.productName', required: false, type: 'text' },
    { key: 'location', label: 'الموقع', k: 'common.location', required: false, type: 'text' },
    { key: 'category', label: 'التصنيف', k: 'common.category', required: false, type: 'text' },
    { key: 'unit', label: 'الوحدة', k: 'common.unit', required: false, type: 'text' },
    { key: 'quantityPerCarton', label: 'الكمية/الكرتون', k: 'products.columns.quantityPerCarton', required: false, type: 'number' },
    { key: 'openingStock', label: 'المخزون الابتدائي', k: 'products.columns.openingStock', required: false, type: 'number' },
    { key: 'purchases', label: 'المشتريات', k: 'products.columns.purchases', required: false, type: 'number' },
    { key: 'issues', label: 'المصروفات', k: 'products.columns.issues', required: false, type: 'number' },
    { key: 'inventoryCount', label: 'الجرد', k: 'products.columns.inventoryCount', required: false, type: 'number' },
    { key: 'currentStock', label: 'المخزون الحالي', k: 'products.columns.currentStock', required: false, type: 'number' },
    { key: 'difference', label: 'الفرق', k: 'products.columns.difference', required: false, type: 'number' },
    { key: 'price', label: 'السعر', k: 'common.price', required: false, type: 'number' },
    { key: 'averagePrice', label: 'متوسط السعر', k: 'common.avgPrice', required: false, type: 'number' },
    { key: 'currentStockValue', label: 'قيمة المخزون الحالي', k: 'products.columns.currentStockValue', required: false, type: 'number' },
    { key: 'issuesValue', label: 'قيمة المصروفات', k: 'products.columns.issuesValue', required: false, type: 'number' },
    { key: 'cartonLength', label: 'طول الكرتون', k: 'products.columns.cartonLength', required: false, type: 'number' },
    { key: 'cartonWidth', label: 'عرض الكرتون', k: 'products.columns.cartonWidth', required: false, type: 'number' },
    { key: 'cartonHeight', label: 'ارتفاع الكرتون', k: 'products.columns.cartonHeight', required: false, type: 'number' },
    { key: 'cartonBarcode', label: 'باركود الكرتون', k: 'products.columns.cartonBarcode', required: false, type: 'text' },
    { key: 'image', label: 'الصورة', k: 'common.image', required: false, type: 'text' },
  ]

  const normalizeHeader = (h: string) => String(h || '').trim().toLowerCase()
  const computeSignature = (headers: string[]) => headers.map(normalizeHeader).join('|')

  const getMappingPref = (sig: string): Record<string, number> => {
    return mappingPrefs[sig] || {}
  }

  const saveMappingPref = async (sig: string, mapping: Record<string, number>) => {
    try {
      const newPrefs = { ...mappingPrefs, [sig]: mapping }
      setMappingPrefs(newPrefs)
      await db.settings.put({ key: MAPPING_PREF_KEY, value: newPrefs })
    } catch { }
  }

  const autoDetectMapping = (headers: string[]): Record<string, number> => {
    const H = headers.map(normalizeHeader)
    const find = (aliases: string[]) => {
      for (const a of aliases) {
        const idx = H.findIndex((h) => h.includes(a.toLowerCase()))
        if (idx !== -1) return idx
      }
      return -1
    }
    return {
      productCode: find(["كود المنتج", "product code", "code", "barcode", "رقم الباركود"]),
      itemNumber: find(["رقم المنتج", "item number", "item no", "sku"]),
      productName: find(["اسم المنتج", "المنتج", "product", "name", "item name", "description", "الوصف"]),
      location: find(["الموقع", "location", "shelf", "bin", "الرف"]),
      category: find(["التصنيف", "category", "group", "type", "المجموعة"]),
      unit: find(["الوحدة", "unit", "uom"]),
      quantityPerCarton: find(["الكمية/الكرتون", "qty/carton", "qty per carton", "كرتون", "carton qty"]),
      openingStock: find(["المخزون الابتدائي", "opening stock", "start qty", "b.bal"]),
      purchases: find(["المشتريات", "purchases", "in", "received", "وارد"]),
      issues: find(["المصروفات", "issues", "out", "sold", "صادر", "مبيعات"]),
      inventoryCount: find(["الجرد", "inventory count", "counted", "physical"]),
      currentStock: find(["المخزون الحالي", "current stock", "stock", "qty", "quantity", "on hand", "الكمية", "الرصيد"]),
      difference: find(["الفرق", "difference", "diff", "variance", "عجز/زيادة"]),
      price: find(["السعر", "price", "cost", "selling price", "unit price", "سعر الوحدة"]),
      averagePrice: find(["متوسط السعر", "average price", "avg cost", "avg price"]),
      currentStockValue: find(["قيمة المخزون الحالي", "current stock value", "stock value", "total value", "اجمالي القيمة"]),
      issuesValue: find(["قيمة المصروفات", "issues value", "sales value"]),
      cartonLength: find(["طول الكرتون", "carton length", "length", "الطول"]),
      cartonWidth: find(["عرض الكرتون", "carton width", "width", "العرض"]),
      cartonHeight: find(["ارتفاع الكرتون", "carton height", "height", "الارتفاع"]),
      cartonBarcode: find(["باركود الكرتون", "carton barcode", "c.barcode", "باركود ك"]),
      image: find(["الصورة", "image", "img", "photo", "pic", "url"]),
    } as any
  }

  // تخزين مؤقت محلي لصور URL بعد تحويلها، لتسريع الاستيرادات المتكررة
  const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // أسبوع

  const getCached = (url: string): string | null => {
    const hit = imageCacheRef.current[url]
    if (hit && Date.now() - hit.ts < IMAGE_CACHE_TTL_MS) return hit.data
    return null
  }

  const putCache = async (url: string, data: string) => {
    const obj = imageCacheRef.current
    obj[url] = { data, ts: Date.now() }
    const keys = Object.keys(obj)
    if (keys.length > 500) {
      for (let i = 0; i < keys.length - 500; i++) delete obj[keys[i]]
    }
    // Update ref is already done by mutation above
    // Persist to Dexie
    try {
      await db.settings.put({ key: IMAGE_CACHE_KEY, value: obj })
    } catch { }
  }

  const convertImageToBase64 = async (url: string): Promise<string | null> => {
    try {
      const cached = await getCached(url)
      if (cached) return cached

      // في نسخة التصدير الثابت، لا يوجد بروكسي؛ نحاول الجلب مباشرة إن سمحت CORS
      const sourceUrl = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true'
        ? url
        : getApiUrl(`/api/image-proxy?url=${encodeURIComponent(url)}`)
      const response = await fetch(sourceUrl, { headers: { Accept: 'image/*' } })
      if (!response.ok) throw new Error(`Proxy failed: ${response.status}`)
      const blob = await response.blob()

      if (blob.size > 2 * 1024 * 1024) {
        console.log('[perf] Image too large, skipping:', blob.size)
        return null
      }

      const dataUrl: string | null = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
      if (!dataUrl) return null

      let out = dataUrl
      if (dataUrl.length > 300_000) {
        try {
          out = await reencodeDataUrl(dataUrl, 'image/webp', 0.82)
        } catch { }
      }
      putCache(url, out)
      return out
    } catch (error) {
      console.log('[perf] Error converting image:', error)
      return null
    }
  }

  // Normalize any image into a re-importable Data URL
  const normalizeImageForExport = async (img?: string): Promise<string> => {
    if (!img) return ""
    try {
      // If it's an external URL, use existing converter to Base64 Data URL
      if (/^https?:\/\//i.test(img)) {
        const base64 = await convertImageToBase64(img)
        return base64 || ""
      }

      // If it's already a Data URL, optionally re-encode to a web-friendly format
      if (/^data:/i.test(img)) {
        // Try to re-encode to WebP (smaller, widely supported). Fallback to original on failure
        try {
          const dataUrl = await reencodeDataUrl(img, 'image/webp', 0.8)
          return dataUrl || img
        } catch {
          return img
        }
      }

      // If it's a raw Base64 without prefix, wrap it as PNG Data URL
      const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(img)
      if (looksLikeBase64) {
        return `data:image/png;base64,${img}`
      }
      return img
    } catch {
      return ""
    }
  }

  // Re-encode a Data URL via canvas to a target mime/quality
  const reencodeDataUrl = (srcDataUrl: string, mime: string, quality?: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const ctx = canvas.getContext('2d')
            if (!ctx) return resolve(srcDataUrl)
            ctx.drawImage(image, 0, 0)
            const out = canvas.toDataURL(mime, quality)
            resolve(out)
          } catch (err) {
            resolve(srcDataUrl)
          }
        }
        image.onerror = () => resolve(srcDataUrl)
        image.src = srcDataUrl
      } catch (err) {
        resolve(srcDataUrl)
      }
    })
  }

  // اختيار صيغة تصدير الصور
  const [imageExportMode, setImageExportMode] = useState<'png' | 'jpeg' | 'url'>('png')

  // تقدير حجم ملف التصدير لتحذير المستخدم عند تجاوز حد معيّن
  const EXPORT_SIZE_WARN_MB = 20
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
  const bytesOfString = (s: string): number => {
    try {
      if (!s) return 0
      if (encoder) return encoder.encode(s).length
      // تقريب آمن في حال غياب TextEncoder
      return s.length * 2
    } catch {
      return s.length * 2
    }
  }
  const estimateImageBytes = (image?: string, mode: 'png' | 'jpeg' | 'url' = 'png'): number => {
    if (!image) return 0
    // إذا كان Data URL، قد تكون طويلة جداً
    const isDataUrl = image.startsWith('data:image/')
    if (mode === 'url') {
      // نص فقط: نكتب الـ URL/Data URL في الخلية
      return bytesOfString(image)
    }
    // تضمين مرئي: نقدّر حجم البيانات الثنائية بناءً على طول base64 إن وُجد
    if (isDataUrl) {
      const commaIdx = image.indexOf(',')
      const b64len = commaIdx > -1 ? image.length - commaIdx - 1 : image.length
      // تقريب: كل 4 أحرف base64 ≈ 3 بايت
      return Math.floor(b64len * 0.75)
    }
    // رابط خارجي سيعاد ترميزه، نقدّر حجمه بـ 100KB افتراضياً إذا غير معروف
    return 100 * 1024
  }
  const estimateExportSizeBytes = (mode: 'png' | 'jpeg' | 'url'): number => {
    let total = 0
    // رأس الأعمدة + ميتاداتا بسيطة
    total += 5 * 1024
    for (const p of products) {
      // تقدير نص الخلايا
      total += bytesOfString(
        [
          p.productCode, p.itemNumber, p.productName, p.location, p.category, p.unit,
          String(p.openingStock ?? 0), String(p.purchases ?? 0), String(p.issues ?? 0),
          String(p.inventoryCount ?? 0), String(p.currentStock ?? 0), String(p.difference ?? 0),
          String(p.price ?? 0), String(p.averagePrice ?? 0), String(p.currentStockValue ?? 0),
          String(p.issuesValue ?? 0)
        ].filter(Boolean).join('|')
      )
      // تقدير حجم الصورة
      total += estimateImageBytes(p.image, mode)
      // هامش صف
      total += 256
    }
    return total
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const dataset = exportScope === 'filtered' && filteredProducts && filteredProducts.length > 0 ? filteredProducts : products
      // تحذير مبكر إذا كان الحجم المقدر كبيراً
      const estBytes = estimateExportSizeBytes(imageExportMode)
      const warnBytes = EXPORT_SIZE_WARN_MB * 1024 * 1024
      if (estBytes > warnBytes) {
        const estMB = (estBytes / (1024 * 1024)).toFixed(1)
        const proceed = typeof window !== 'undefined'
          ? window.confirm(t("bulk.confirm.largeExport").replace("{size}", estMB))
          : true
        if (!proceed) {
          toast({
            title: t("bulk.toast.exportCancel"),
            description: t("bulk.toast.exportSizeWarn")
              .replace("{size}", estMB)
              .replace("{limit}", String(EXPORT_SIZE_WARN_MB)),
          })
          setIsExporting(false)
          return
        }
      }
      let XLSX
      try {
        const lib = await import("xlsx")
        XLSX = lib.default || lib
      } catch (e) {
        console.error("Failed to load xlsx", e)
        throw new Error("فشل تحميل مكتبة Excel")
      }

      const headers = [
        "كود المنتج",
        "رقم المنتج",
        "اسم المنتج",
        "الموقع",
        "التصنيف",
        "الوحدة",
        "الكمية/الكرتون",
        "المخزون الابتدائي",
        "المشتريات",
        "المصروفات",
        "الجرد",
        "المخزون الحالي",
        "الفرق",
        "السعر",
        "متوسط السعر",
        "قيمة المخزون الحالي",
        "قيمة المصروفات",
        "الصورة",
      ]

      // تحويل الأرقام العربية إلى إنجليزية ثم إرجاع رقم إذا كانت كل المحارف أرقام
      const toNumIfNumeric = (val: any) => {
        const s = String(val ?? "").trim()
        if (!s) return ""
        const english = s
          .replace(/٠/g, '0')
          .replace(/١/g, '1')
          .replace(/٢/g, '2')
          .replace(/٣/g, '3')
          .replace(/٤/g, '4')
          .replace(/٥/g, '5')
          .replace(/٦/g, '6')
          .replace(/٧/g, '7')
          .replace(/٨/g, '8')
          .replace(/٩/g, '9')
        return /^\d+$/.test(english) ? Number(english) : s
      }

      if (imageExportMode === 'url') {
        // نصي فقط: نصدّر Data URL/URL داخل الخلية بدون تضمين مرئي
        const imagesRows: any[][] = [["id", "seq", "chunk"]]
        const data = await Promise.all(
          dataset.map(async (p, idx) => {
            // [Fix] Resolve DB_IMAGE for URL export mode too
            let rawImage = p.image || ''
            if (rawImage === 'DB_IMAGE') {
              try {
                const rec = await db.productImages.get(p.id)
                if (rec?.data) rawImage = rec.data
              } catch (e) {
                console.warn('Failed to load DB_IMAGE for export:', p.id, e)
              }
            }

            const imageValue = await normalizeImageForExport(rawImage)
            let imageCellText = imageValue
            const pid = p.id || String(idx + 1)
            const MAX_CHUNK = 32000
            if (imageValue && imageValue.length > MAX_CHUNK) {
              imageCellText = `EMBED:IMG:${pid}`
              for (let pos = 0, seq = 0; pos < imageValue.length; pos += MAX_CHUNK, seq++) {
                imagesRows.push([pid, seq, imageValue.substring(pos, pos + MAX_CHUNK)])
              }
            }
            return [
              toNumIfNumeric(p.productCode),
              toNumIfNumeric(p.itemNumber),
              p.productName || "",
              p.location || "",
              p.category || "",
              p.unit || "",
              p.quantityPerCarton || 0,
              p.openingStock || 0,
              p.purchases || 0,
              p.issues || 0,
              p.inventoryCount || 0,
              p.currentStock || 0,
              p.difference || 0,
              p.price || 0,
              p.averagePrice || 0,
              p.currentStockValue || 0,
              parseFloat(Number(p.issuesValue || 0).toFixed(5)),
              imageCellText,
            ]
          })
        )

        const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
        ws["!cols"] = [
          { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
          { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 },
          { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 50 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "المنتجات")
        // أضف ورقة الصور إذا كانت هناك صفوف صور طويلة تم تجزئتها
        if (imagesRows.length > 1) {
          const imagesWs = XLSX.utils.aoa_to_sheet(imagesRows)
          XLSX.utils.book_append_sheet(wb, imagesWs, 'Images')
        }
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
        const blob = new Blob([wbout], { type: "application/octet-stream" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `products_${exportScope}_${new Date().toISOString().split("T")[0]}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } else {
        // تضمين مرئي: استخدم ExcelJS وإضافة صور base64 مباشرة
        let ExcelJS: any
        try {
          ExcelJS = await import('exceljs')
        } catch (err) {
          console.warn('[v0] exceljs غير مثبت أو فشل تحميله، سنستخدم تصدير URL فقط')
          // fallback: تصدير نصي باستخدام XLSX بدون تضمين مرئي للصور
          const imagesRows: any[][] = [["id", "seq", "chunk"]]
          const data = await Promise.all(
            dataset.map(async (p, idx) => {
              const imageValue = await normalizeImageForExport(p.image)
              let imageCellText = imageValue
              const pid = p.id || String(idx + 1)
              const MAX_CHUNK = 32000
              if (imageValue && imageValue.length > MAX_CHUNK) {
                imageCellText = `EMBED:IMG:${pid}`
                for (let pos = 0, seq = 0; pos < imageValue.length; pos += MAX_CHUNK, seq++) {
                  imagesRows.push([pid, seq, imageValue.substring(pos, pos + MAX_CHUNK)])
                }
              }
              return [
                toNumIfNumeric(p.productCode),
                toNumIfNumeric(p.itemNumber),
                p.productName || "",
                p.location || "",
                p.category || "",
                p.unit || "",
                p.quantityPerCarton || 0,
                p.openingStock || 0,
                p.purchases || 0,
                p.issues || 0,
                p.inventoryCount || 0,
                p.currentStock || 0,
                p.difference || 0,
                p.price || 0,
                p.averagePrice || 0,
                p.currentStockValue || 0,
                p.issuesValue || 0,
                imageCellText,
              ]
            })
          )

          const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
          ws["!cols"] = [
            { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
            { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 },
            { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 50 },
          ]
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, "المنتجات")
          if (imagesRows.length > 1) {
            const imagesWs = XLSX.utils.aoa_to_sheet(imagesRows)
            XLSX.utils.book_append_sheet(wb, imagesWs, 'Images')
          }
          const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
          const blob = new Blob([wbout], { type: "application/octet-stream" })
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          link.download = `products_${exportScope}_${new Date().toISOString().split("T")[0]}.xlsx`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)

          // أخبر المستخدم بسبب السقوط إلى URL فقط
          toast({
            title: t("bulk.toast.exportSuccess") + " (No Images)",
            description: "exceljs not found; images exported as text/url only",
          })
          return
        }

        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('المنتجات')
        // ورقة لحفظ بيانات الصور المضمنة مجزأة لضمان إعادة الاستيراد
        const imagesSheetName = 'Images'
        const imagesWs = workbook.addWorksheet(imagesSheetName)
        imagesWs.addRow(['id', 'seq', 'chunk'])
        worksheet.columns = headers.map((h, idx) => ({ header: h, key: `col_${idx}`, width: [15, 15, 30, 15, 15, 10, 12, 15, 12, 12, 10, 15, 10, 12, 12, 18, 15, 22][idx] || 15 }))
        // Removed worksheet.addRow(headers) to prevent duplicate header row

        const targetMime = imageExportMode === 'jpeg' ? 'image/jpeg' : 'image/png'
        const targetExt = imageExportMode === 'jpeg' ? 'jpeg' : 'png'

        for (let i = 0; i < dataset.length; i++) {
          const p = dataset[i]

          // Dynamic calculations
          const opening = Number(p.openingStock) || 0
          const purchases = Number(p.purchases) || 0
          const issues = Number(p.issues) || 0
          const currentStock = (p.currentStock !== undefined) ? Number(p.currentStock) : (opening + purchases - issues)
          const inventoryCount = Number(p.inventoryCount) || 0
          const difference = currentStock - inventoryCount

          // ✅ Resolve DB_IMAGE to actual base64
          let imageToExport = p.image || ''
          if (imageToExport === 'DB_IMAGE') {
            try {
              const rec = await db.productImages.get(p.id)
              if (rec?.data) imageToExport = rec.data
            } catch (e) {
              console.warn('Failed to load DB_IMAGE for:', p.id, e)
            }
          }

          const normalized = await normalizeImageForExport(imageToExport)
          const reencoded = normalized ? await reencodeDataUrl(normalized, targetMime, 0.92) : ''

          // أضف بيانات الصف نصياً، وضع معرف مميز للصورة في عمود الصورة لضمان إعادة الاستيراد
          const imageCellText = reencoded ? `EMBED:IMG:${p.id}` : ''
          worksheet.addRow([
            toNumIfNumeric(p.productCode),
            toNumIfNumeric(p.itemNumber),
            p.productName || "",
            p.location || "",
            p.category || "",
            p.unit || "",
            p.quantityPerCarton || 0,
            opening,
            purchases,
            issues,
            inventoryCount,
            currentStock,
            difference,
            p.price || 0,
            p.averagePrice || 0,
            p.currentStockValue || 0,
            parseFloat(Number(p.issuesValue || 0).toFixed(5)),
            imageCellText,
          ])

          if (reencoded) {
            try {
              // ExcelJS (متصفح) يدعم خاصية base64 مباشرة
              const imageId = workbook.addImage({ base64: reencoded, extension: targetExt })
              const targetRow = i + 2 // +1 للرأس، +1 لبدء العد من 1
              worksheet.getRow(targetRow).height = 60
              worksheet.addImage(imageId, {
                tl: { col: 17, row: targetRow - 1 }, // Changed col from 16 to 17 (Image column)
                ext: { width: 80, height: 60 },
              })

              // خزّن الـ Data URL بشكل مجزأ داخل ورقة Images لتجاوز حد طول الخلية
              const MAX_CHUNK = 32000
              for (let pos = 0, seq = 0; pos < reencoded.length; pos += MAX_CHUNK, seq++) {
                const chunk = reencoded.substring(pos, pos + MAX_CHUNK)
                imagesWs.addRow([p.id, seq, chunk])
              }
            } catch (err) {
              console.warn('[v0] فشل تضمين صورة الصف', i, err)
            }
          }
        }

        const buffer = await workbook.xlsx.writeBuffer()
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `products_${exportScope}_${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }

      toast({
        title: t("bulk.toast.exportSuccess"),
        description: t("bulk.toast.exportSuccessDesc")
          .replace("{count}", String(exportScope === 'filtered' && filteredProducts ? filteredProducts.length : products.length)),
      })
    } catch (error) {
      console.error("[v0] Export error:", error)
      toast({
        title: "خطأ في التصدير",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء تصدير الملف",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasPermission(user, 'inventory.add')) {
      toast({ title: t("common.notAllowed"), description: t("common.permissionRequired"), variant: "destructive" })
      return
    }
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setConversionProgress(0)
    setConversionStatus(t("bulk.status.reading"))

    try {
      // التحقق من سلامة قاعدة البيانات
      if (!db || !db.products) {
        throw new Error("قاعدة البيانات غير جاهزة. يرجى تحديث الصفحة أو استخدام متصفح آخر.")
      }

      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][]

      // حاول قراءة ورقة الصور إذا كانت موجودة
      let imagesMap: Record<string, string> = {}
      const imagesSheet = workbook.Sheets['Images']
      if (imagesSheet) {
        try {
          const imagesRows = XLSX.utils.sheet_to_json(imagesSheet, { header: 1 }) as any[][]
          // توقع رؤوس: ['id', 'seq', 'chunk']
          const chunksById: Record<string, { seq: number; chunk: string }[]> = {}
          for (let r = 1; r < imagesRows.length; r++) {
            const row = imagesRows[r]
            if (!row || row.length < 3) continue
            const id = String(row[0] ?? '').trim()
            const seq = Number(row[1] ?? 0)
            const chunk = String(row[2] ?? '')
            if (!id) continue
            if (!chunksById[id]) chunksById[id] = []
            chunksById[id].push({ seq, chunk })
          }
          for (const [id, arr] of Object.entries(chunksById)) {
            arr.sort((a, b) => a.seq - b.seq)
            imagesMap[id] = arr.map((x) => x.chunk).join('')
          }
          console.log('[v0] Images sheet parsed. Count:', Object.keys(imagesMap).length)
        } catch (err) {
          console.warn('[v0] Failed parsing Images sheet', err)
        }
      }

      console.log("[v0] Imported data:", jsonData)
      if (jsonData.length < 2) {
        throw new Error("الملف فارغ أو لا يحتوي على بيانات")
      }

      let headerRowIndex = 0
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (row && row.length > 0 && row.some(c => c && String(c).trim().length > 0)) {
          headerRowIndex = i
          break
        }
      }

      const validData = jsonData.slice(headerRowIndex)
      if (validData.length < 2) {
        throw new Error("لا توجد بيانات كافية بعد صف العناوين")
      }

      const headers = (validData[0] || []).map((h) => String(h ?? ''))
      const signature = computeSignature(headers)
      const pref = getMappingPref(signature)
      const autoMap = autoDetectMapping(headers)

      setImportHeaders(headers)
      setMappingSignature(signature)
      setAutoMappingSuggested(autoMap)
      setColumnMapping(Object.keys(pref).length ? pref : autoMap)
      setImportPreviewRows(validData.slice(1, 101))
      setImportAllRows(validData)
      setImportImagesMap(imagesMap)
      setImportPreviewRows(validData.slice(1, 101))
      setImportAllRows(validData)
      setImportImagesMap(imagesMap)
      setMappingDialogOpen(true)
      setConversionStatus("")
      setIsImporting(false)
    } catch (error) {
      console.error("[v0] Import error:", error)
      toast({
        title: "خطأ في الاستيراد",
        description: error instanceof Error ? error.message : "تأكد من صحة تنسيق الملف",
        variant: "destructive",
      })
      setIsImporting(false)
      setConversionProgress(0)
      setConversionStatus("")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const safeFloat = (num: number): number => {
    return Math.round(num * 1000000) / 1000000
  }

  const parseArabicNum = (val: any): number => {
    const s = String(val ?? "").trim()
    if (!s) return 0
    const english = s
      .replace(/٠/g, '0')
      .replace(/١/g, '1')
      .replace(/٢/g, '2')
      .replace(/٣/g, '3')
      .replace(/٤/g, '4')
      .replace(/٥/g, '5')
      .replace(/٦/g, '6')
      .replace(/٧/g, '7')
      .replace(/٨/g, '8')
      .replace(/٩/g, '9')
      .replace(/,/g, '') // Remove thousands separators if present
    const n = parseFloat(english)
    return isNaN(n) ? 0 : n
  }

  const parseExcelData = async (data: string[][], imagesMap: Record<string, string> = {}, mappingOverride?: Record<string, number>): Promise<Product[]> => {
    const products: Product[] = []

    if (data.length < 2) return products

    let colMap: Record<string, number>
    if (mappingOverride) {
      colMap = mappingOverride
    } else {
      const headers = data[0].map((h) => String(h || "").trim().toLowerCase())
      const findColumn = (possibleNames: string[]): number => {
        for (const name of possibleNames) {
          const index = headers.findIndex((h) => h.includes(name.toLowerCase()))
          if (index !== -1) return index
        }
        return -1
      }
      colMap = {
        productCode: findColumn(["كود المنتج", "product code"]),
        itemNumber: findColumn(["رقم المنتج", "item number"]),
        productName: findColumn(["اسم المنتج", "المنتج", "product"]),
        location: findColumn(["الموقع", "location"]),
        category: findColumn(["التصنيف", "category"]),
        unit: findColumn(["الوحدة", "unit"]),
        cartonLength: findColumn(["الطول", "length", "carton length"]),
        cartonWidth: findColumn(["العرض", "width", "carton width"]),
        cartonHeight: findColumn(["الارتفاع", "height", "carton height"]),
        cartonUnit: findColumn(["وحدة الأبعاد", "dimensions unit", "carton unit", "الوحدة (أبعاد)"]),
        openingStock: findColumn(["المخزون الابتدائي", "opening stock"]),
        purchases: findColumn(["المشتريات", "purchases"]),
        issues: findColumn(["المصروفات", "issues"]),
        inventoryCount: findColumn(["الجرد", "inventory count"]),
        currentStock: findColumn(["المخزون الحالي", "current stock"]),
        difference: findColumn(["الفرق", "difference"]),
        price: findColumn(["السعر", "price"]),
        image: findColumn(["الصورة", "image"]),
        cartonBarcode: findColumn(["باركود الكرتون", "carton barcode", "c.barcode", "باركود ك"]),
      }
    }

    console.log("[v0] Column mapping:", colMap)

    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length === 0) continue

      const productCode = colMap.productCode >= 0 ? String(row[colMap.productCode] || "").trim() : ""
      const itemNumber = colMap.itemNumber >= 0 ? String(row[colMap.itemNumber] || "").trim() : ""
      const productName = colMap.productName >= 0 ? String(row[colMap.productName] || "").trim() : ""
      const location = colMap.location >= 0 ? String(row[colMap.location] || "").trim() : ""
      const category = colMap.category >= 0 ? String(row[colMap.category] || "").trim() : ""
      const unit = colMap.unit >= 0 ? String(row[colMap.unit] || "").trim() : "قطعة"

      if (!productCode && !productName) {
        console.log("[v0] Skipping row - missing essential fields:", row)
        continue
      }

      let openingStock = colMap.openingStock >= 0 && row[colMap.openingStock] !== undefined && row[colMap.openingStock] !== null && String(row[colMap.openingStock]).trim() !== "" ? parseArabicNum(row[colMap.openingStock]) : 0
      const purchases = colMap.purchases >= 0 && row[colMap.purchases] !== undefined && row[colMap.purchases] !== null && String(row[colMap.purchases]).trim() !== "" ? parseArabicNum(row[colMap.purchases]) : 0
      const issues = colMap.issues >= 0 && row[colMap.issues] !== undefined && row[colMap.issues] !== null && String(row[colMap.issues]).trim() !== "" ? parseArabicNum(row[colMap.issues]) : 0

      let currentStock = 0
      const hasCurrentStockCol = colMap.currentStock >= 0 && row[colMap.currentStock] !== undefined && row[colMap.currentStock] !== null && String(row[colMap.currentStock]).trim() !== ""
      if (hasCurrentStockCol) {
        currentStock = parseArabicNum(row[colMap.currentStock])
        // [Intelligent Fix]: If Excel has "Current Stock" but "Opening Stock" is empty/0, backfill "Opening Stock"
        // so that the internal equation (opening + purchases - issues = current) holds true.
        if (openingStock === 0 && currentStock !== (purchases - issues)) {
          openingStock = currentStock - purchases + issues
        }
      } else {
        // Fallback to formula
        currentStock = safeFloat(openingStock + purchases - issues)
      }

      let inventoryCount = 0
      if (colMap.inventoryCount >= 0 && row[colMap.inventoryCount] !== undefined && row[colMap.inventoryCount] !== null && String(row[colMap.inventoryCount]).trim() !== "") {
        inventoryCount = parseArabicNum(row[colMap.inventoryCount])
      } else {
        inventoryCount = currentStock
      }

      const price = colMap.price >= 0 ? parseArabicNum(row[colMap.price]) : 0

      const cartonLength = colMap.cartonLength >= 0 ? Math.max(0, parseArabicNum(row[colMap.cartonLength])) : undefined
      const cartonWidth = colMap.cartonWidth >= 0 ? Math.max(0, parseArabicNum(row[colMap.cartonWidth])) : undefined
      const cartonHeight = colMap.cartonHeight >= 0 ? Math.max(0, parseArabicNum(row[colMap.cartonHeight])) : undefined
      const cartonUnit = colMap.cartonUnit >= 0 ? String(row[colMap.cartonUnit] || "").trim() : undefined
      const quantityPerCarton = colMap.quantityPerCarton >= 0 && row[colMap.quantityPerCarton] !== undefined && String(row[colMap.quantityPerCarton]).trim() !== "" ? Math.max(1, parseArabicNum(row[colMap.quantityPerCarton])) : 1
      const cartonBarcode = colMap.cartonBarcode >= 0 ? String(row[colMap.cartonBarcode] || "").trim() : undefined

      let image: string | undefined = undefined
      if (colMap.image >= 0 && row[colMap.image]) {
        const imageValue = String(row[colMap.image]).trim()
        console.log("[v0] Image import - Product:", productName, "Image value:", imageValue)
        if (imageValue.startsWith('EMBED:IMG:')) {
          const id = imageValue.substring('EMBED:IMG:'.length)
          const reconstructed = imagesMap[id]
          if (reconstructed && reconstructed.length > 0) {
            image = reconstructed
            console.log('[v0] ✅ Reconstructed embedded image for:', productName)
          } else {
            console.warn('[v0] ⚠️ No image chunks found for id:', id, 'product:', productName)
          }
        } else if (imageValue && !imageValue.includes("[صورة مضمنة")) {
          image = imageValue
          console.log("[v0] Image imported successfully for:", productName)
        } else {
          console.log("[v0] Image skipped (placeholder or empty) for:", productName)
        }
      } else {
        console.log("[v0] No image column or empty for:", productName)
      }

      let difference = 0
      if (colMap.difference >= 0 && row[colMap.difference] !== undefined && row[colMap.difference] !== null && String(row[colMap.difference]).trim() !== "") {
        difference = parseArabicNum(row[colMap.difference])
      } else {
        difference = safeFloat(currentStock - inventoryCount)
      }

      const averagePrice = price

      let currentStockValue = 0
      // [Modified] User Request: Use Excel value if present, otherwise calculate
      if (colMap.currentStockValue >= 0 && row[colMap.currentStockValue] !== undefined && row[colMap.currentStockValue] !== null) {
        currentStockValue = parseArabicNum(row[colMap.currentStockValue])
      } else {
        currentStockValue = safeFloat(currentStock * averagePrice)
      }

      const issuesValue = safeFloat(issues * averagePrice)

      products.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productCode: productCode || `AUTO-${Date.now()}`,
        itemNumber,
        productName: productName || productCode,
        location,
        category,
        unit,
        quantity: currentStock,
        openingStock,
        purchases,
        issues,
        inventoryCount,
        currentStock,
        difference,
        price,
        averagePrice,
        currentStockValue,
        issuesValue,
        image,
        cartonLength,
        cartonWidth,
        cartonHeight,
        cartonUnit,
        quantityPerCarton,
        cartonBarcode,
        returns: 0,
        returnsValue: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(), // Initial last activity
      })
    }

    console.log("[v0] Parsed products:", products.length)
    return products
  }

  // Removed incorrect import

  const handleClearAll = async () => {
    if (!hasPermission(user, 'system.settings')) {
      toast({ title: getDualString("common.notAllowed"), description: getDualString("common.permissionRequired"), variant: "destructive" })
      return
    }

    // 🛑 STOP SYNC FIRST
    stopRealtimeSync()

    setOpRunning('delete')
    setOpProgress(0)
    setOpStatus(getDualString("bulk.status.stoppingSync"))

    try {
      // Intentionally wait to ensure listeners detach
      await new Promise(r => setTimeout(r, 1000))

      const rows = getProducts()
      const total = rows.length || 1

      // Delete from Cloud
      if (rows.length > 0) {
        setOpStatus(getDualString("bulk.status.deletingCloud"))
        const ids = rows.map(p => p.id)

        // Delete in batches with delay to ensure backend processes it
        // [Modified] Use smaller batches and yield to event loop
        const CLOUD_BATCH = 50 // Reduced from 200
        for (let i = 0; i < ids.length; i += CLOUD_BATCH) {
          const chunk = ids.slice(i, i + CLOUD_BATCH)
          try {
            await deleteAllProductsApi(chunk)
          } catch (e) {
            console.error("Failed to delete chunk", e)
          }

          setOpProgress(Math.round(((i + chunk.length) / ids.length) * 50)) // Cloud takes 50% progress
          // Yield to event loop
          await new Promise(r => setTimeout(r, 100))
        }
      }

      setOpStatus(getDualString("bulk.status.deletingLocal"))
      // [Modified] Yielding loop for local progress simulation
      let done = 0
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batchEnd = Math.min(rows.length, i + BATCH)
        done = batchEnd
        setOpProgress(50 + Math.round((done / total) * 50)) // Local takes remaining 50%
        await new Promise(r => setTimeout(r, 10))
      }

      // Actually clear the DB table
      await db.products.clear()
      // Put empty array to cache
      saveProducts([])
      onProductsUpdate([])

      // Clear images as well? usually yes for full clear
      await db.productImages.clear()

      // Prevent auto-seeding of demo data after clearing
      if (typeof window !== 'undefined') {
        localStorage.setItem('demo_data_deleted', 'true')
      }
      await db.settings.put({ key: 'demo_data_deleted', value: true })

      log({ action: 'delete_all_products', count: total, status: 'success' })
      toast({
        title: t("bulk.deleteAll.success"),
        description: t("bulk.toast.deleteAllDesc") || `Deleted ${total} products from local and cloud`
      })

      // ✅ Restart Sync (Clean State)
      setOpStatus(getDualString("bulk.status.restarting"))
      await new Promise(r => setTimeout(r, 1000))
      startRealtimeSync()

    } catch (err: any) {
      log({ action: 'delete_all_products', status: 'error', error: String(err?.message || err) })
      toast({ title: t("common.error"), description: String(err?.message || err), variant: 'destructive' })
      // Emergency restart sync
      startRealtimeSync()
    } finally {
      setOpRunning(null)
      setOpProgress(0)
      setOpStatus('')
    }
  }

  const handleFactoryReset = async () => {
    if (!hasPermission(user, 'system.settings')) {
      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
      return
    }

    stopRealtimeSync()

    setOpRunning('factory')
    setOpProgress(0)
    setOpStatus(getDualString("bulk.status.stoppingSync"))

    try {
      await new Promise(r => setTimeout(r, 1000))

      setOpProgress(10)
      setOpStatus(getDualString("bulk.status.clearingPrefs"))

      setOpProgress(40)
      setOpStatus(getDualString("bulk.status.initializingDefaults"))
      await factoryReset() // This function handles extensive clearing

      setOpProgress(90)
      setOpStatus(getDualString("bulk.status.updatingUI"))
      onProductsUpdate(getProducts())

      setOpProgress(100)
      log({ action: 'factory_reset', status: 'success' })
      toast({ title: getDualString("bulk.factoryReset"), description: getDualString("bulk.factoryReset.success.desc") })

      // Note: factoryReset usually reloads the page or clears state significantly
      // We'll restart sync just in case it didn't force reload
      startRealtimeSync()

    } catch (err: any) {
      log({ action: 'factory_reset', status: 'error', error: String(err?.message || err) })
      toast({ title: getDualString("bulk.factoryReset.error.title"), description: getDualString("bulk.factoryReset.error.desc"), variant: 'destructive' })
      startRealtimeSync()
    } finally {
      setOpRunning(null)
      setOpProgress(0)
      setOpStatus('')
    }
  }

  const handleDeleteDemoData = async () => {
    if (!hasPermission(user, 'system.settings')) {
      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
      return
    }

    stopRealtimeSync()

    setOpRunning('demo')
    setOpProgress(0)
    setOpStatus(getDualString("bulk.status.stoppingSync"))

    try {
      await new Promise(r => setTimeout(r, 1000))

      setOpProgress(10)
      setOpStatus(getDualString("bulk.status.deletingDemo"))

      const logs = await deleteDemoData()

      setOpProgress(90)
      onProductsUpdate(getProducts())
      setOpProgress(100)

      log({ action: 'delete_demo_data', status: 'success', logs })
      toast({
        title: t("bulk.deleteDemo.success"),
        description: (
          <div className="max-h-[200px] overflow-auto text-xs space-y-1">
            <div className="text-green-600">{t("bulk.operation.success")}</div>
          </div>
        ),
        duration: 5000,
      })

      startRealtimeSync()

    } catch (err: any) {
      log({ action: 'delete_demo_data', status: 'error', error: String(err?.message || err) })
      toast({ title: t("common.error"), description: t("common.error"), variant: 'destructive' })
      startRealtimeSync()
    } finally {
      setOpRunning(null)
      setOpProgress(0)
      setOpStatus('')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* Image export format selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">{t("bulk.image.exportFormat.label")}</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={imageExportMode}
            onChange={(e) => setImageExportMode(e.target.value as 'png' | 'jpeg' | 'url')}
          >
            <option value="png">{t("bulk.image.exportFormat.pngEmbed")}</option>
            <option value="jpeg">{t("bulk.image.exportFormat.jpegEmbed")}</option>
            <option value="url">{t("bulk.image.exportFormat.urlOption")}</option>
          </select>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={products.length === 0 || isExporting}>
          <Download className="ml-2 h-4 w-4" />
          {isExporting ? t("bulk.exporting") : t("bulk.exportExcel")}
        </Button>

        <input
          type="file"
          ref={fileInputRef}
          accept=".xlsx,.xls"
          onChange={handleImport}
          className="hidden"
          disabled={isImporting}
        />
        {(user as any)?.username !== 'OF123478' && (
          <Button
            variant="outline"
            disabled={isImporting || !hasPermission(user, 'inventory.add')}
            onClick={() => {
              if (!hasPermission(user, 'inventory.add')) {
                toast({ title: t("common.notAllowed"), description: t("common.permissionRequired"), variant: "destructive" })
                return
              }
              fileInputRef.current?.click()
            }}
          >
            <Upload className="ml-2 h-4 w-4" />
            {isImporting ? t("bulk.importing") : t("bulk.importExcel")}
          </Button>
        )}


        {isImporting && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-center">{conversionStatus || t("bulk.status.processing")}</h3>
              <Progress value={conversionProgress} className="mb-2" />
              <p className="text-sm text-center text-muted-foreground">{conversionProgress}%</p>
              <p className="text-xs text-center text-muted-foreground mt-2">
                {t("bulk.images.description")}
              </p>
            </div>
          </div>
        )}

        {opRunning && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-center">{opStatus}</h3>
              <Progress value={opProgress} className="mb-2" />
              <p className="text-sm text-center text-muted-foreground">{opProgress}%</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <Button variant="outline" onClick={() => { setOpRunning(null); setOpProgress(0); setOpStatus('') }}>{t("common.cancel")}</Button>
                {opRunning === 'delete' && (
                  <Button onClick={handleClearAll}>{t("common.retry")}</Button>
                )}
                {opRunning === 'factory' && (
                  <Button onClick={handleFactoryReset}>{t("common.retry")}</Button>
                )}
                {opRunning === 'demo' && (
                  <Button onClick={handleDeleteDemoData}>{t("common.retry")}</Button>
                )}
              </div>
            </div>
          </div>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon">
              <Info className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("bulk.guide.title")}</DialogTitle>
              <DialogDescription><DualText k="bulk.guide.desc" /></DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-right">
              <div>
                <h3 className="font-semibold text-lg mb-2"><DualText k="bulk.guide.columnsTitle" /></h3>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>كود المنتج (Product Code) - رقم</li>
                  <li>رقم المنتج (Item Number) - رقم</li>
                  <li>اسم المنتج (Product Name) - نص</li>
                  <li>الموقع (Location) - نص</li>
                  <li>التصنيف (Category) - نص</li>
                  <li>الوحدة (Unit) - نص</li>
                  <li>المخزون الابتدائي (Opening Stock) - رقم</li>
                  <li>المشتريات (Purchases) - رقم</li>
                  <li>المصروفات (Issues) - رقم</li>
                  <li>الجرد (Inventory Count) - رقم</li>
                  <li>المخزون الحالي (Current Stock) - رقم</li>
                  <li>الفرق (Difference) - رقم</li>
                  <li>السعر (Price) - رقم</li>
                  <li>متوسط السعر (Average Price) - رقم</li>
                  <li>قيمة المخزون الحالي (Current Stock Value) - رقم</li>
                  <li>قيمة المصروفات (Issues Value) - رقم</li>
                  <li className="font-bold text-blue-600">الصورة (Image) - رابط URL أو Data URL ⭐</li>
                </ol>
              </div>

              <div className="border-t pt-4 bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-200">
                <h3 className="font-semibold text-lg mb-3 text-green-900">✅ حل مشكلة الصور - تحويل تلقائي!</h3>
                <div className="space-y-3 text-sm">
                  <div className="bg-white p-3 rounded border border-green-300">
                    <p className="font-semibold mb-2 text-green-800">{t("bulk.images.autoConvert.subtitle")}</p>
                    <p className="text-sm text-gray-700 mb-2">
                      عند استيراد ملف Excel يحتوي على روابط صور خارجية، سيقوم النظام تلقائياً بـ:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 mr-2">
                      <li className="font-bold text-green-600">✅ تحميل الصور من الروابط الخارجية</li>
                      <li className="font-bold text-green-600">✅ تحويلها إلى صيغة Base64 محلية</li>
                      <li className="font-bold text-green-600">✅ حفظها في النظام بدون مشاكل CORS</li>
                      <li className="font-bold text-green-600">✅ عرضها بشكل صحيح في الجدول</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                    <p className="font-semibold mb-2">📸 صيغة عمود الصورة:</p>
                    <p className="text-xs mb-2">ضع رابط الصورة المباشر أو Data URL في العمود رقم 17:</p>
                    <code className="block bg-white p-2 rounded text-xs break-all border" dir="ltr">
                      https://www2.0zz0.com/2025/10/28/22/500545197.png
                    </code>
                    <code className="block bg-white p-2 rounded text-[10px] break-all border mt-2" dir="ltr">
                      data:image/webp;base64,UklGRiIAAABXRUJQVlA4IC4AAAAvAAAA...
                    </code>
                    <p className="text-xs text-blue-700 mt-2 font-medium">
                      💡 الروابط تُحوّل تلقائياً إلى صيغة محلية، وData URL يتم دعمها مباشرةً.
                    </p>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                    <p className="font-semibold text-yellow-900 mb-1">⏱️ ملاحظة:</p>
                    <p className="text-xs text-yellow-800">
                      {t("bulk.images.noteText")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-lg mb-2"><DualText k="bulk.notes.title" /></h3>
                <ul className="list-disc list-inside space-y-1 text-sm mr-4">
                  <li>يجب أن يحتوي الملف على صف رأس (Header) في السطر الأول</li>
                  <li>النظام يتعرف على الأعمدة تلقائياً بناءً على أسمائها</li>
                  <li>الحقول الإلزامية: كود المنتج أو اسم المنتج (أحدهما على الأقل)</li>
                  <li>الحقول الرقمية الفارغة سيتم اعتبارها صفر</li>
                  <li>يمكنك تصدير ملف Excel من الزر "تصدير Excel" لمعرفة التنسيق الصحيح</li>
                  <li>المخزون الحالي يُحسب تلقائياً: المخزون الابتدائي + المشتريات - المصروفات</li>
                  <li>يتم استيراد كل صف كمنتج منفصل؛ لا يتم دمج المنتجات المكررة داخل الملف.</li>
                  <li className="font-bold text-green-600">✅ الصور الخارجية يتم تحويلها تلقائياً لحل مشكلة CORS</li>
                </ul>
              </div>

              <div className="border-t pt-4 bg-green-50 p-3 rounded">
                <h3 className="font-semibold text-sm mb-2"><DualText k="bulk.tips.title" /></h3>
                <p className="text-sm">
                  للحصول على أفضل النتائج، قم بتصدير ملف Excel من النظام أولاً، ثم قم بتعديله وإعادة استيراده. هذا يضمن
                  التوافق الكامل مع النظام. الصور الخارجية سيتم تحويلها تلقائياً عند الاستيراد!
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* واجهة مطابقة الأعمدة يدوياً ومعاينة قبل الاستيراد */}
        {mappingDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full h-[95vh] md:h-auto md:max-h-[90vh] md:max-w-6xl flex flex-col overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                <h3 className="text-lg sm:text-xl font-bold mb-2 text-right"><DualText k="bulk.mapping.title" /></h3>
                <p className="text-sm text-muted-foreground mb-6 text-right"><DualText k="bulk.mapping.desc" /></p>

                <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-6 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select
                        className="border rounded px-2 h-9 text-sm bg-white"
                        value={importMode}
                        onChange={(e) => setImportMode(e.target.value as any)}
                      >
                        <option value="append">إضافة كمنتجات جديدة (Append)</option>
                        <option value="update">تحديث المنتجات الحالية (Update Matches)</option>
                      </select>
                      <label className="text-sm font-bold">وضع الاستيراد:</label>
                    </div>

                    {importMode === 'update' && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                          className="border rounded px-2 h-9 text-sm bg-white"
                          value={matchField}
                          onChange={(e) => setMatchField(e.target.value)}
                        >
                          <option value="productCode">كود المنتج</option>
                          <option value="itemNumber">رقم المنتج</option>
                          <option value="productName">اسم المنتج</option>
                        </select>
                        <label className="text-sm font-bold text-blue-800">الربط بواسطة:</label>
                      </div>
                    )}
                  </div>

                  {importMode === 'update' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-600 block text-right">الأعمدة المراد تحديثها في المنتجات المتطابقة:</label>
                      <div className="flex flex-wrap gap-2 justify-end">
                        {expectedFields.map(f => (
                          <label key={f.key} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border text-xs cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={updateFields.includes(String(f.key))}
                              onChange={(e) => {
                                if (e.target.checked) setUpdateFields([...updateFields, String(f.key)])
                                else setUpdateFields(updateFields.filter(x => x !== String(f.key)))
                              }}
                            />
                            {f.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {expectedFields.map((f) => (
                    <div key={String(f.key)} className="flex flex-col items-end">
                      <label className="text-xs sm:text-sm font-medium mb-1.5 text-gray-700">
                        <DualText k={f.k} />
                      </label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        value={columnMapping[String(f.key)] ?? -1}
                        onChange={(e) => setColumnMapping((m) => ({ ...m, [String(f.key)]: Number(e.target.value) }))}
                      >
                        <option value={-1}>— {t("bulk.mapping.ignore")} —</option>
                        {importHeaders.map((h, idx) => (
                          <option key={idx} value={idx}>{h || `عمود ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 mb-4 border-t pt-4">
                  <div className="text-xs text-muted-foreground text-center sm:text-right w-full sm:w-auto"><DualText k="bulk.mapping.suggested" /></div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button variant="outline" size="sm" onClick={() => { setColumnMapping(autoMappingSuggested) }} className="w-full sm:w-auto"><DualText k="bulk.mapping.auto" /></Button>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="secondary" size="sm" onClick={() => { setMappingDialogOpen(false); setImportHeaders([]); setImportPreviewRows([]) }} className="flex-1 sm:flex-none"><DualText k="common.cancel" /></Button>
                      <Button size="sm" className="flex-1 sm:flex-none" onClick={async () => {
                        saveMappingPref(mappingSignature, columnMapping)
                        setMappingDialogOpen(false)
                        setIsImporting(true)

                        // 🛑 STOP REALTIME SYNC DURING BULK PROCESS
                        // This prevents old cloud data from overwriting new local imports during calculation
                        stopRealtimeSync()

                        setConversionProgress(0)
                        setConversionStatus(getDualString("bulk.status.processing"))

                        let convertedCount = 0
                        let failedCount = 0
                        let addedLocationsCount = 0
                        let addedUnitsCount = 0
                        let addedCategoriesCount = 0

                        try {
                          if (importAllRows.length === 0) {
                            toast({ title: getDualString("common.alert"), description: getDualString("bulk.import.noRows"), variant: "destructive" })
                            throw new Error("No rows found")
                          }

                          const allImported = await parseExcelData(importAllRows, importImagesMap, columnMapping)
                          // نرفق الفهرس الأصلي بكل صف قبل الفلترة لضمان صحة الربط اليدوي
                          const productsWithMeta = allImported.map((p, i) => ({
                            ...p,
                            _originalRowIndex: i + 1
                          }))

                          const importedProducts = productsWithMeta.filter(p => !ignoredRows.has(p._originalRowIndex))

                          if (importedProducts.length === 0) {
                            const hasCode = columnMapping['productCode'] !== -1
                            const hasName = columnMapping['productName'] !== -1
                            if (!hasCode && !hasName) {
                              throw new Error("يجب تحديد عمود 'اسم المنتج' أو 'كود المنتج' على الأقل (Must map 'Product Name' or 'Product Code')")
                            }
                            throw new Error("لم يتم العثور على منتجات صالحة. هل قمت بتعيين الأعمدة (الاسم/الكود) بشكل صحيح؟ (No valid products found. Did you set columns correctly?)")
                          }

                          toast({ title: "نتيجة التحليل (Analysis Result)", description: `تم العثور على ${importedProducts.length} منتج من أصل ${importAllRows.length - 1} صف بيانات (Found ${importedProducts.length} products from ${importAllRows.length - 1} rows)` })

                          // 🛡️ IMAGE GUARD: Only process images if the COLUMN is mapped AND the USER selected it for update
                          const isImageColumnMapped = columnMapping['image'] !== undefined && columnMapping['image'] !== -1
                          const isImageUpdate = updateFields.includes('image') && isImageColumnMapped

                          setConversionStatus(isImageUpdate ? t("bulk.status.convertImages") : getDualString("bulk.status.processing"))

                          // Optimization: Prepare lookup to check matches BEFORE converting images
                          const dbProducts = getProducts()
                          const matchLookup = new Set(dbProducts.map(p => String(p[matchField as keyof Product] || '').trim().toLowerCase()))

                          let completed = 0
                          let lastUpdate = Date.now()
                          const CONCURRENCY = 3
                          const productsWithImages = await asyncPool(CONCURRENCY, importedProducts, async (product: any) => {
                            let out = product

                            // Check if we should convert (Skip if it's an Existing Product update AND we aren't updating images)
                            let shouldConvert = isImageUpdate
                            if (importMode === 'update' && !isImageUpdate) {
                              shouldConvert = false
                            }

                            if (shouldConvert && product.image && (product.image.startsWith('http://') || product.image.startsWith('https://'))) {
                              const base64Image = await convertImageToBase64(product.image)
                              if (base64Image) {
                                out = { ...product, image: base64Image }
                                convertedCount++
                              } else {
                                failedCount++
                              }
                            }
                            completed++

                            const now = Date.now()
                            if (now - lastUpdate > 100 || completed === importedProducts.length) {
                              lastUpdate = now
                              const pct = Math.round((completed / (importedProducts.length || 1)) * 100)
                              setConversionProgress(pct)

                              // 🛠️ FIX UI STATUS: Don't mention images if not updating them
                              if (isImageUpdate) {
                                setConversionStatus(
                                  getDualString("bulk.status.convertImagesProgress", undefined, undefined, {
                                    completed: String(completed),
                                    total: String(importedProducts.length)
                                  })
                                )
                              } else {
                                setConversionStatus(
                                  getDualString("bulk.status.processingProgress", "جاري المعالجة... ({completed}/{total})", undefined, {
                                    completed: String(completed),
                                    total: String(importedProducts.length)
                                  })
                                )
                              }
                            }
                            return out
                          })

                          // --- المبدأ الجديد: التحديث الذكي مقابل الإضافة ---
                          let finalProductsToSave: Product[] = []
                          const existingProducts = getProducts()

                          if (importMode === 'update') {
                            setConversionStatus("جاري مطابقة وتحديث البيانات...")
                            const updatedList = [...existingProducts]
                            const usedTargetIndices = new Set<number>()

                            productsWithImages.forEach((newP: any) => {
                              const rowIndex = newP._originalRowIndex
                              let targetIndex = -1

                              // 1. الربط اليدوي أولاً (له الأولوية القصوى)
                              if (manualMappings[rowIndex]) {
                                targetIndex = updatedList.findIndex((p, idx) => p.id === manualMappings[rowIndex] && !usedTargetIndices.has(idx))
                                // If manually mapped but already used, fallback to standard matching or allow it?
                                // Usually manual means "I want THIS one". Let's respect it but keep tracking.
                              }

                              // 2. الربط التلقائي الاحترافي (Smart Match)
                              if (targetIndex === -1) {
                                const matchValue = String(newP[matchField as keyof Product] || '').trim().toLowerCase()
                                if (matchValue) {
                                  // البحث عن كل المرشحين المتطابقين الذين لم يتم استخدامهم بعد
                                  const candidates: number[] = []
                                  updatedList.forEach((p, idx) => {
                                    if (usedTargetIndices.has(idx)) return
                                    const pValue = String(p[matchField as keyof Product] || '').trim().toLowerCase()
                                    if (pValue === matchValue) candidates.push(idx)
                                  })

                                  if (candidates.length === 1) {
                                    targetIndex = candidates[0]
                                  } else if (candidates.length > 1) {
                                    // 🧠 البحث عن "أفضل مطابقة" (Best Match) بين المكررين
                                    // نقوم بمقارنة الحقول الأخرى لضمان الدقة
                                    let bestIdx = candidates[0]
                                    let maxScore = -1

                                    candidates.forEach(idx => {
                                      const p = updatedList[idx]
                                      let score = 0
                                      // مقارنة الحقول التي تساعد في التمييز
                                      if (p.category && newP.category && p.category.trim().toLowerCase() === newP.category.trim().toLowerCase()) score += 3
                                      if (p.location && newP.location && p.location.trim().toLowerCase() === newP.location.trim().toLowerCase()) score += 2
                                      if (p.unit && newP.unit && p.unit.trim().toLowerCase() === newP.unit.trim().toLowerCase()) score += 1
                                      if (p.productName && newP.productName && p.productName.trim().toLowerCase() === newP.productName.trim().toLowerCase()) score += 5

                                      if (score > maxScore) {
                                        maxScore = score
                                        bestIdx = idx
                                      }
                                    })
                                    targetIndex = bestIdx
                                  }
                                }
                              }

                              if (targetIndex !== -1) {
                                usedTargetIndices.add(targetIndex)
                                // تحديث المنتج الموجود
                                const target = updatedList[targetIndex]
                                const updates: any = { updatedAt: new Date().toISOString() }

                                // NEW LOGIC: If updating ANY stock determinant, reset others to act as a "Stock Reset"
                                const isUpdatingStock =
                                  newP['openingStock'] !== undefined ||
                                  newP['inventoryCount'] !== undefined ||
                                  newP['currentStock'] !== undefined;

                                updateFields.forEach(field => {
                                  if (newP[field] !== undefined) {
                                    // 🛡️ IMAGE GUARD
                                    if (field === 'image' && (!columnMapping['image'] || columnMapping['image'] === -1)) return;
                                    updates[field] = newP[field]
                                  }
                                })

                                if (isUpdatingStock) {
                                  // ⚡ ABSOLUTE TRUTH LOGIC:
                                  // If we are updating stock and these fields were NOT in the Excel (not mapped),
                                  // we FORCE them to 0.
                                  if (!columnMapping['purchases'] || columnMapping['purchases'] === -1) updates['purchases'] = 0;
                                  if (!columnMapping['issues'] || columnMapping['issues'] === -1) updates['issues'] = 0;
                                  if (!columnMapping['returns'] || columnMapping['returns'] === -1) updates['returns'] = 0;

                                  // If Current Stock is provided (Main Truth), and Opening Stock is NOT provided,
                                  // make Opening Stock = Current Stock to satisfy Equation: Stock = Open + 0 - 0.
                                  // This prevents inconsistency after saving.
                                  if (newP['currentStock'] !== undefined && (!columnMapping['openingStock'] || columnMapping['openingStock'] === -1)) {
                                    updates['openingStock'] = newP['currentStock'];
                                  }

                                  // Also ensure currentStock and inventoryCount match what was imported exactly
                                  if (newP['currentStock'] !== undefined) updates['currentStock'] = newP['currentStock'];
                                  if (newP['inventoryCount'] !== undefined) updates['inventoryCount'] = newP['inventoryCount'];

                                  // Reset difference to 0 if we are setting new stock levels without specific inventory count
                                  if (!columnMapping['difference'] || columnMapping['difference'] === -1) {
                                    updates['difference'] = 0;
                                  }
                                }

                                updatedList[targetIndex] = { ...target, ...updates }
                              } else {
                                // إضافة كمنتج جديد (مع تنظيف الميتا)
                                const { _originalRowIndex, ...cleanP } = newP
                                updatedList.push(cleanP as Product)
                              }
                            })
                            finalProductsToSave = updatedList
                          } else {
                            // الوضع الافتراضي: إضافة الكل كجديد
                            finalProductsToSave = [...existingProducts, ...productsWithImages]
                          }

                          // Optimize Images: Split large images to side table
                          const imageRecords: { productId: string; data: string }[] = []
                          const finalOptimized = finalProductsToSave.map(p => {
                            if (p.image && p.image.startsWith('data:image')) {
                              imageRecords.push({ productId: p.id, data: p.image })
                              return { ...p, image: 'DB_IMAGE' }
                            }
                            return p
                          })

                          if (imageRecords.length > 0) {
                            await db.productImages.bulkPut(imageRecords)
                          }

                          saveProducts(finalOptimized)

                          const existingLocations = getLocations()
                          const existingLocationNames = new Set(existingLocations.map((l: any) => l.name.toLowerCase().trim()))
                          const newLocations = new Set<string>()
                          finalOptimized.forEach((product) => {
                            if (product.location && !existingLocationNames.has(product.location.toLowerCase().trim())) {
                              newLocations.add(product.location.trim())
                            }
                          })
                          for (const locationName of Array.from(newLocations)) {
                            await addLocation({
                              name: locationName,
                              description: "تم الإضافة تلقائياً من الاستيراد",
                              createdAt: new Date().toISOString()
                            })
                            addedLocationsCount++
                          }

                          const existingUnits = getUnits()
                          const existingUnitNames = new Set(existingUnits.map((u) => u.name.toLowerCase().trim()))
                          const newUnits = new Set<string>()
                          finalOptimized.forEach((product) => {
                            if (product.unit && !existingUnitNames.has(product.unit.toLowerCase().trim())) {
                              newUnits.add(product.unit.trim())
                            }
                          })
                          for (const unitName of Array.from(newUnits)) {
                            try {
                              await addUnit({
                                name: unitName,
                                abbreviation: unitName.substring(0, 3),
                                createdAt: new Date().toISOString()
                              })
                              addedUnitsCount++
                            } catch (error) {
                              console.error(`[BulkOps] Failed to add unit "${unitName}":`, error)
                            }
                          }

                          const existingCategories = getCategories()
                          const existingCategoryNames = new Set(existingCategories.map((c: any) => c.name.toLowerCase().trim()))
                          const newCategories = new Set<string>()
                          finalOptimized.forEach((product) => {
                            if (product.category && !existingCategoryNames.has(product.category.toLowerCase().trim())) {
                              newCategories.add(product.category.trim())
                            }
                          })
                          for (const catName of Array.from(newCategories)) {
                            await addCategory({ name: catName, color: "blue" })
                            addedCategoriesCount++
                          }

                          // إحصائيات بسيطة للعرض
                          const productsToSync = finalOptimized;
                          const imageRecordsToSync = imageRecords;

                          // --- START CLOUD SYNC FIX: BATCH MODE ---
                          setConversionStatus("جاري المزامنة مع السحابة... (قد يستغرق وقتاً)")

                          // Use Batch Sync to avoid "write stream exhausted"
                          // We split large product lists into smaller chunks of 100 for better progress reporting
                          // although syncProductsBatch handles 300 internally, we want to update UI more often here

                          try {
                            const CHUNK_SIZE = 100
                            let syncedCount = 0
                            const totalItems = productsToSync.length + imageRecordsToSync.length

                            // 1. Sync Products in Chunks
                            for (let i = 0; i < productsToSync.length; i += CHUNK_SIZE) {
                              const chunk = productsToSync.slice(i, i + CHUNK_SIZE)
                              await syncProductsBatch(chunk)
                              syncedCount += chunk.length
                              const progress = Math.round((syncedCount / totalItems) * 100)
                              setConversionProgress(progress)
                            }

                            // 2. Sync Images in Chunks
                            for (let i = 0; i < imageRecordsToSync.length; i += CHUNK_SIZE) {
                              const chunk = imageRecordsToSync.slice(i, i + CHUNK_SIZE)
                              await syncProductImagesBatch(chunk)
                              syncedCount += chunk.length
                              const progress = Math.round((syncedCount / totalItems) * 100)
                              setConversionProgress(progress)
                            }

                            console.log(`[Bulk Import] Batch Synced ${productsToSync.length} products and ${imageRecordsToSync.length} images.`)
                          } catch (e: any) {
                            console.error("Batch Sync Failed", e)
                            if (e?.message?.includes('FIREBASE_QUOTA_EXCEEDED') || e?.message?.includes('Quota') || e?.code === 'resource-exhausted') {
                              toast({
                                title: "تم تجاوز الحد اليومي (Quota Exceeded)",
                                description: "عذراً، لقد تجاوزت الحد المجاني اليومي لقاعدة البيانات. تم حفظ البيانات محلياً بنجاح، ولكن لن تظهر على الأجهزة الأخرى حتى يتم تجديد الحصة غداً.",
                                variant: "destructive",
                                duration: 10000
                              })
                            } else {
                              toast({ title: "تنبيه المزامنة", description: "قد تكون بعض العناصر لم يتم رفعها بنجاح. تحقق من الاتصال.", variant: "destructive" })
                            }
                          }
                          // --- END CLOUD SYNC FIX ---

                          // onProductsUpdate(allProducts) // Removed to prevent blocking UI with granular updates

                          // Prevent auto-seeding of demo data after import
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('demo_data_deleted', 'true')
                          }
                          await db.settings.put({ key: 'demo_data_deleted', value: true })

                          const desc = getDualString("bulk.toast.importSuccess.desc", undefined, undefined, {
                            products: productsWithImages.length,
                            converted: convertedCount,
                            failed: failedCount,
                            categories: addedCategoriesCount,
                            locations: addedLocationsCount,
                            units: addedUnitsCount
                          })
                          toast({ title: getDualString("bulk.toast.importSuccess.title"), description: desc })
                        } catch (error) {
                          console.error("[v0] Import error:", error)
                          toast({ title: getDualString("bulk.toast.importError.title"), description: error instanceof Error ? `${error.message}` : getDualString("bulk.toast.importError.desc"), variant: "destructive" })
                        } finally {
                          setIsImporting(false)
                          setConversionProgress(0)
                          setConversionStatus("")
                          setImportHeaders([])
                          setImportPreviewRows([])
                          setImportAllRows([])
                          setImportImagesMap({})
                          // 🚀 RESTART REALTIME SYNC
                          startRealtimeSync()
                        }
                      }}><DualText k="bulk.mapping.confirm" /></Button>
                    </div>
                  </div>
                </div>

                <h4 className="text-sm font-semibold mb-2 text-right">معاينة البيانات (أول 200 صف)</h4>

                {importMode === 'update' && (
                  <div className="flex gap-4 mb-3 justify-end items-center">
                    <span className="text-[10px] text-muted-foreground mr-auto text-left">
                      💡 يمكنك الضغط على أيقونة 🔗 بجانب أي منتج جديد لربطه بمنتج موجود يدوياً
                    </span>
                    <div className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-green-100 text-green-700 rounded-full border border-green-200">
                      <span>{analysisResults.matches} موجود</span>
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    </div>
                    <div
                      className={`flex items-center gap-2 text-xs font-medium px-3 py-1 cursor-pointer transition-all ${showOnlyNew ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'}`}
                      onClick={() => setShowOnlyNew(!showOnlyNew)}
                      title={showOnlyNew ? "عرض الكل" : "عرض المنتجات الجديدة فقط"}
                    >
                      <span>{analysisResults.newItems} جديد</span>
                      <div className={`w-2 h-2 rounded-full ${showOnlyNew ? 'bg-white animate-pulse' : 'bg-blue-500'}`}></div>
                      {showOnlyNew && <X className="h-3 w-3 ml-1" />}
                    </div>
                  </div>
                )}
                <div className="border rounded-md w-full overflow-hidden">
                  <div className="overflow-x-auto max-h-[45vh]">
                    <table className="w-full text-xs sm:text-sm whitespace-nowrap border-collapse">
                      <thead>
                        <tr className="bg-muted/50 sticky top-0 z-10">
                          <th className="border px-3 py-2 text-center font-bold bg-gray-50 sticky right-0 w-24">الحالة</th>
                          {importHeaders.map((h, i) => (<th key={i} className="border px-3 py-2 text-right font-medium text-muted-foreground">{h || `عمود ${i + 1}`}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const existingMatchValues = new Set(
                            getProducts().map(p => String(p[matchField as keyof Product] || '').trim().toLowerCase())
                          );

                          const rowsWithIndex = importAllRows.slice(1).map((r, i) => ({ data: r, originalIndex: i + 1 }));

                          const filtered = rowsWithIndex.filter(({ data: r, originalIndex }) => {
                            if (ignoredRows.has(originalIndex)) return false;

                            if (showOnlyNew) {
                              if (manualMappings[originalIndex]) return false;
                              if (importMode === 'update') {
                                const colIdx = columnMapping[matchField];
                                if (colIdx >= 0) {
                                  const excelVal = String(r[colIdx] || '').trim().toLowerCase();
                                  if (existingMatchValues.has(excelVal)) return false;
                                }
                              }
                            }
                            return true;
                          });

                          const displayed = filtered.slice(0, 500);

                          return displayed.map(({ data: r, originalIndex: actualRowIndex }) => {
                            let isMatch = false;
                            let isManualLink = !!manualMappings[actualRowIndex];

                            if (manualMappings[actualRowIndex]) {
                              isMatch = true;
                            } else if (importMode === 'update') {
                              const colIdx = columnMapping[matchField];
                              if (colIdx >= 0) {
                                const excelVal = String(r[colIdx] || '').trim().toLowerCase();
                                isMatch = existingMatchValues.has(excelVal);
                              }
                            }

                            return (
                              <tr key={actualRowIndex} className={`${isMatch ? (isManualLink ? "bg-amber-50" : "bg-green-50/50") : ""} group hover:bg-gray-50/50 transition-colors`}>
                                <td className="border px-2 py-1 text-center sticky right-0 bg-inherit z-[5]">
                                  <div className="flex items-center justify-center gap-1.5 min-w-[110px]">
                                    {/* زر الحذف/التجاهل */}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => {
                                        const next = new Set(ignoredRows);
                                        next.add(actualRowIndex);
                                        setIgnoredRows(next);
                                      }}
                                      title="حذف من الاستيراد"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>

                                    {isMatch ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-green-600 font-bold text-[10px]">{isManualLink ? "📍 ربط يدوي" : "✅ موجود"}</span>
                                        {isManualLink && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 text-red-400 hover:text-red-600"
                                            onClick={() => {
                                              const next = { ...manualMappings };
                                              delete next[actualRowIndex];
                                              setManualMappings(next);
                                            }}
                                          >
                                            <X className="h-2 w-2" />
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-2">
                                        <span className="text-blue-600 font-bold text-[10px]">➕ جديد</span>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-6 w-6 rounded-full border-blue-200 hover:bg-blue-50 text-blue-600"
                                          onClick={() => setLinkingRow(actualRowIndex)}
                                          title="ربط بمنتج موجود"
                                        >
                                          <LinkIcon className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {r.map((c, ci) => (<td key={ci} className="border px-3 py-1.5 text-right">{String(c ?? '')}</td>))}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* نافذة الربط اليدوي */}
                <AlertDialog open={linkingRow !== null} onOpenChange={() => setLinkingRow(null)}>
                  <AlertDialogContent className="max-w-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-right">ربط الصف بمنتج موجود</AlertDialogTitle>
                      <AlertDialogDescription className="text-right">
                        ابحث عن المنتج في النظام لربطه بهذا الصف من ملف Excel
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="py-4 space-y-4">
                      <div className="relative">
                        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="ابحث بالاسم أو الكود..."
                          className="pr-10 text-right"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          autoFocus
                        />
                      </div>

                      <div className="max-h-[40vh] overflow-y-auto border rounded-md">
                        {getProducts()
                          .filter(p =>
                            !searchTerm ||
                            p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (p.productCode || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (p.itemNumber || "").toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .slice(0, 50)
                          .map(p => (
                            <div
                              key={p.id}
                              className="p-3 border-b hover:bg-muted cursor-pointer flex items-center justify-between gap-4"
                              onClick={() => {
                                if (linkingRow !== null) {
                                  setManualMappings({ ...manualMappings, [linkingRow]: p.id });
                                  setLinkingRow(null);
                                  setSearchTerm('');
                                }
                              }}
                            >
                              <div className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded">
                                {p.productCode || p.itemNumber || 'بلا كود'}
                              </div>
                              <div className="font-medium text-right flex-1">{p.productName}</div>
                            </div>
                          ))
                        }
                        {searchTerm && getProducts().filter(p => p.productName.includes(searchTerm)).length === 0 && (
                          <div className="p-8 text-center text-muted-foreground">لا توجد نتائج</div>
                        )}
                      </div>
                    </div>

                    <AlertDialogFooter className="flex-row-reverse gap-2">
                      <AlertDialogCancel onClick={() => { setLinkingRow(null); setSearchTerm(''); }}>إلغاء</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        )}


        {/* Maintenance Actions Group */}
        {shouldShow('inventoryPage.quickSettings') && (
          <div className="flex items-center gap-2 border-r pr-2 mr-1">
            <Button
              variant="outline"
              className="gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary"
              onClick={() => {
                if (!hasPermission(user, 'system.backup')) {
                  toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النسخ الاحتياطي"), variant: "destructive" })
                  return
                }
                setBackupOpen(true)
              }}
              disabled={!hasPermission(user, 'system.backup')}
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-semibold">{t("bulk.backup")}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>إدارة النظام</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={async () => {
                    if (!hasPermission(user, 'system.settings')) {
                      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                      return
                    }
                    if (confirm(t('sync.hardResetConfirm'))) {
                      hardReset();
                    }
                  }}
                  disabled={!hasPermission(user, 'system.settings')}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  <span>{t("sync.hardReset", "تصفير النظام")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    if (!hasPermission(user, 'system.settings')) {
                      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                      return
                    }
                    setDeleteDemoOpen(true)
                  }}
                  disabled={!hasPermission(user, 'system.settings')}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>{t("bulk.deleteAutoData")}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    if (!hasPermission(user, 'system.settings')) {
                      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                      return
                    }
                    setDeleteAllOpen(true)
                  }}
                  disabled={!hasPermission(user, 'system.settings')}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  <span>{t("bulk.deleteAll")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-6 w-px bg-border mx-2" />

            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!hasPermission(user, 'system.settings')) {
                  toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                  return
                }
                setFactoryResetOpen(true)
              }}
              disabled={!hasPermission(user, 'system.settings')}
              className="gap-2 shadow-sm hover:bg-red-700"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">تصفير النظام</span>
            </Button>
          </div>
        )}

        <AlertDialog open={deleteDemoOpen} onOpenChange={setDeleteDemoOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("bulk.deleteAutoDataDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("bulk.deleteAutoDataDialog.desc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!hasPermission(user, 'system.settings')) {
                    toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                    setDeleteDemoOpen(false)
                    return
                  }
                  handleDeleteDemoData();
                  setDeleteDemoOpen(false)
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                {t("bulk.deleteAutoDataDialog.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("bulk.deleteAllDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("bulk.deleteAllDialog.desc").replace("{count}", String(products.length))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!hasPermission(user, 'system.settings')) {
                    toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                    setDeleteAllOpen(false)
                    return
                  }
                  handleClearAll();
                  setDeleteAllOpen(false)
                }}
                className="bg-destructive text-destructive-foreground"
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={factoryResetOpen} onOpenChange={setFactoryResetOpen}>
          <AlertDialogContent className="border-red-500 border-2">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                تحذير: تصفير شامل للنظام
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 pt-4 text-right">
                <div className="bg-red-50 p-4 rounded-lg border border-red-100 text-red-900 font-bold">
                  أنت على وشك حذف جميع البيانات من الموقع والقاعدة السحابية (Firebase).
                </div>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mr-4">
                  <li>سيتم حذف جميع المنتجات والمخزون.</li>
                  <li>سيتم حذف سجلات الفواتير والمشتريات.</li>
                  <li>سيتم حذف المستخدمين والصلاحيات.</li>
                  <li>لا يمكن التراجع عن هذه العملية أبداً.</li>
                </ul>
                <div className="font-bold text-black mt-4">
                  هل أنت متأكد تماماً؟
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (!hasPermission(user, 'system.settings')) {
                    toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
                    setFactoryResetOpen(false)
                    return
                  }
                  handleFactoryReset();
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                نعم، امسح كل شيء
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {(user as any)?.username !== 'OF123478' && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">{t("bulk.exportScope")}</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as 'all' | 'filtered')}
            >
              <option value="all">{t("bulk.exportScope.all")}</option>
              <option value="filtered">{t("bulk.exportScope.filtered")}</option>
            </select>
          </div>
        )}
      </div>
      <BackupRestoreDialog open={backupOpen} onOpenChange={setBackupOpen} />
    </>
  )
}
