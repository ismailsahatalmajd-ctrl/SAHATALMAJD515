"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Download, Upload, Trash2, Info, RotateCcw, RefreshCcw } from 'lucide-react'
import type { Product } from "@/lib/types"
import { getProducts, saveProducts, getCategories, addCategory, getLocations, addLocation, factoryReset, deleteDemoData, initDataStore } from "@/lib/storage"
import { deleteAllProductsApi } from "@/lib/sync-api"
import { performFactoryReset } from "@/lib/system-reset"
import { syncProduct, syncProductImageToCloud } from "@/lib/firebase-sync-engine"
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
import { DualText } from "@/components/ui/dual-text"
import { BackupRestoreDialog } from "@/components/backup-restore-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ShieldCheck, MoreHorizontal, AlertTriangle, Database } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { hasPermission } from "@/lib/auth-utils"

interface BulkOperationsProps {
  products: Product[]
  filteredProducts?: Product[]
  onProductsUpdate: (products: Product[]) => void
}

export function BulkOperations({ products = [], filteredProducts, onProductsUpdate }: BulkOperationsProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { user } = useAuth()
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


  const [mappingDialogOpen, setMappingDialogOpen] = useState(false)
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importPreviewRows, setImportPreviewRows] = useState<string[][]>([])
  const [importAllRows, setImportAllRows] = useState<string[][]>([])
  const [importImagesMap, setImportImagesMap] = useState<Record<string, string>>({})
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({})
  const [autoMappingSuggested, setAutoMappingSuggested] = useState<Record<string, number>>({})
  const [mappingSignature, setMappingSignature] = useState<string>("")

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

  // تنفيذ معالجة متزامنة محدودة (async pool)
  async function asyncPool<T, R>(limit: number, items: T[], iterate: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const ret: R[] = new Array(items.length)
    let i = 0
    const executing: Promise<void>[] = []
    async function enqueue() {
      if (i >= items.length) return
      const index = i++
      const p = (async () => {
        const r = await iterate(items[index], index)
        ret[index] = r
      })()
      let ref: Promise<void>
      ref = p.then(() => { executing.splice(executing.indexOf(ref), 1 as any) })
      executing.push(ref)
      if (executing.length >= limit) await Promise.race(executing)
      return enqueue()
    }
    await enqueue()
    await Promise.all(executing)
    return ret
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
        worksheet.addRow(headers)

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
                tl: { col: 16, row: targetRow - 1 },
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
      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية إضافة المخزون"), variant: "destructive" })
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

      let XLSX
      try {
        const lib = await import("xlsx")
        XLSX = lib.default || lib
      } catch (e) {
        console.error("Failed to load xlsx", e)
        throw new Error("فشل تحميل مكتبة Excel")
      }

      const reader = new FileReader()

      reader.onload = async (event) => {
        try {
          const data = event.target?.result
          // Yield to main thread to allow UI to show "Reading..." spinner
          await new Promise(resolve => setTimeout(resolve, 100))

          const workbook = XLSX.read(data, { type: "array" })
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

          // Find first non-empty row to use as header
          let headerRowIndex = 0
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i]
            // Check if row has at least one non-empty string cell
            if (row && row.length > 0 && row.some(c => c && String(c).trim().length > 0)) {
              headerRowIndex = i
              break
            }
          }

          console.log("[v0] Header row index:", headerRowIndex)

          // Extract data starting from header row
          const validData = jsonData.slice(headerRowIndex)
          if (validData.length < 2) {
            throw new Error("لا توجد بيانات كافية بعد صف العناوين")
          }

          // إعداد مطابقة الأعمدة وفتح واجهة المطابقة/المعاينة
          const headers = (validData[0] || []).map((h) => String(h ?? ''))
          const signature = computeSignature(headers)
          const pref = getMappingPref(signature)
          const autoMap = autoDetectMapping(headers)
          setImportHeaders(headers)
          setMappingSignature(signature)
          setAutoMappingSuggested(autoMap)
          setColumnMapping(Object.keys(pref).length ? pref : autoMap)
          setImportPreviewRows(validData.slice(1, 21))
          setImportAllRows(validData)
          setImportImagesMap(imagesMap)
          setMappingDialogOpen(true)
          setConversionStatus("")
          setIsImporting(false)
          return


        } catch (error) {
          console.error("[v0] Import error description:", error)
          const msg = error instanceof Error ? error.message : "خطأ غير معروف"

          if (msg.includes("Script error")) {
            toast({
              title: "خطأ في تحميل المكتبة",
              description: "يرجى التحقق من اتصال الإنترنت أو تحديث الصفحة",
              variant: "destructive"
            })
          } else {
            toast({
              title: "خطأ في الاستيراد",
              description: msg,
              variant: "destructive",
            })
          }
        } finally {
          setIsImporting(false)
          setConversionProgress(0)
          setConversionStatus("")
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = ""
          }
        }
      }

      reader.onerror = () => {
        console.error("FileReader error", reader.error)
        toast({
          title: "خطأ في قراءة الملف",
          description: "حدث خطأ أثناء قراءة الملف، حاول مرة أخرى",
          variant: "destructive",
        })
        setIsImporting(false)
        setConversionProgress(0)
        setConversionStatus("")
        if (fileInputRef.current) fileInputRef.current.value = ""
      }

      reader.readAsArrayBuffer(file)
    } catch (error) {
      console.error("[v0] Import setup error:", error)
      toast({
        title: "خطأ بداية الاستيراد",
        description: "فشل تهيئة عملية الاستيراد",
        variant: "destructive",
      })
      setIsImporting(false)
      setConversionProgress(0)
      setConversionStatus("")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }

    // Moved reset to finally/onerror blocks to ensure it happens
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

      const openingStock = colMap.openingStock >= 0 ? parseArabicNum(row[colMap.openingStock]) : 0
      const purchases = colMap.purchases >= 0 ? parseArabicNum(row[colMap.purchases]) : 0
      const issues = colMap.issues >= 0 ? parseArabicNum(row[colMap.issues]) : 0

      let inventoryCount = 0
      if (colMap.inventoryCount >= 0) {
        inventoryCount = parseArabicNum(row[colMap.inventoryCount])
      } else {
        inventoryCount = openingStock + purchases - issues
      }

      const price = colMap.price >= 0 ? parseArabicNum(row[colMap.price]) : 0

      const cartonLength = colMap.cartonLength >= 0 ? Math.max(0, parseArabicNum(row[colMap.cartonLength])) : undefined
      const cartonWidth = colMap.cartonWidth >= 0 ? Math.max(0, parseArabicNum(row[colMap.cartonWidth])) : undefined
      const cartonHeight = colMap.cartonHeight >= 0 ? Math.max(0, parseArabicNum(row[colMap.cartonHeight])) : undefined
      const cartonUnit = colMap.cartonUnit >= 0 ? String(row[colMap.cartonUnit] || "").trim() : undefined

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

      let currentStock = 0
      // Enforce the formula: Opening + Purchases - Issues
      // Even if Excel has "Current Stock", recalculate it to ensure consistency
      currentStock = openingStock + purchases - issues

      let difference = 0
      if (colMap.difference >= 0 && row[colMap.difference] !== undefined && row[colMap.difference] !== null) {
        difference = parseArabicNum(row[colMap.difference])
      } else {
        difference = currentStock - inventoryCount
      }

      const averagePrice = price
      const currentStockValue = currentStock * averagePrice
      const issuesValue = issues * averagePrice

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    console.log("[v0] Parsed products:", products.length)
    return products
  }

  const handleClearAll = async () => {
    if (!hasPermission(user, 'system.settings')) {
      toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية النظام"), variant: "destructive" })
      return
    }
    setOpRunning('delete')
    setOpProgress(0)
    setOpStatus('جاري حذف المنتجات...')
    try {
      const rows = getProducts()
      const total = rows.length || 1

      // Delete from Cloud
      if (rows.length > 0) {
        setOpStatus('جاري الحذف من السحابة...')
        const ids = rows.map(p => p.id)
        await deleteAllProductsApi(ids)
      }

      setOpStatus('جاري الحذف المحلي...')
      let done = 0
      // احذف على دفعات لتقليل الضغط
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batchEnd = Math.min(rows.length, i + BATCH)
        // تحديث التقدم
        done = batchEnd
        setOpProgress(Math.round((done / total) * 100))
      }
      // Actually clear the DB table
      await db.products.clear()
      saveProducts([])
      onProductsUpdate([])

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
    } catch (err: any) {
      log({ action: 'delete_all_products', status: 'error', error: String(err?.message || err) })
      toast({ title: t("common.error"), description: String(err?.message || err), variant: 'destructive' })
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
    setOpRunning('factory')
    setOpProgress(0)
    setOpStatus('جاري استعادة ضبط المصنع...')
    try {
      // خطوات منطقية لتحديث واجهة التقدم
      setOpProgress(10)
      setOpStatus('مسح التفضيلات...')
      // الفعل الحقيقي داخل storage.factoryReset
      setOpProgress(40)
      setOpStatus('تهيئة البيانات الافتراضية...')
      factoryReset()
      setOpProgress(90)
      setOpStatus('تحديث الواجهة...')
      onProductsUpdate(getProducts())
      setOpProgress(100)
      log({ action: 'factory_reset', status: 'success' })
      toast({ title: 'استعادة ضبط المصنع', description: 'تم مسح البيانات واستعادة الإعدادات الافتراضية' })
    } catch (err: any) {
      log({ action: 'factory_reset', status: 'error', error: String(err?.message || err) })
      toast({ title: 'فشل الاستعادة', description: 'حدث خطأ أثناء استعادة ضبط المصنع', variant: 'destructive' })
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
    setOpRunning('demo')
    setOpProgress(0)
    setOpStatus('جاري حذف البيانات التجريبية...')
    try {
      setOpProgress(10)
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
    } catch (err: any) {
      log({ action: 'delete_demo_data', status: 'error', error: String(err?.message || err) })
      toast({ title: t("common.error"), description: t("common.error"), variant: 'destructive' })
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
        <Button
          variant="outline"
          disabled={isImporting || !hasPermission(user, 'inventory.add')}
          onClick={() => {
            if (!hasPermission(user, 'inventory.add')) {
              toast({ title: t("common.notAllowed", "غير مسموح"), description: t("common.permissionRequired", "لا تملك صلاحية إضافة المخزون"), variant: "destructive" })
              return
            }
            fileInputRef.current?.click()
          }}
        >
          <Upload className="ml-2 h-4 w-4" />
          {isImporting ? t("bulk.importing") : t("bulk.importExcel")}
        </Button>

        {isImporting && conversionProgress > 0 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-center">{conversionStatus}</h3>
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
                <Button variant="outline" onClick={() => { setOpRunning(null); setOpProgress(0); setOpStatus('') }}>إلغاء</Button>
                {opRunning === 'delete' && (
                  <Button onClick={handleClearAll}>إعادة المحاولة</Button>
                )}
                {opRunning === 'factory' && (
                  <Button onClick={handleFactoryReset}>إعادة المحاولة</Button>
                )}
                {opRunning === 'demo' && (
                  <Button onClick={handleDeleteDemoData}>إعادة المحاولة</Button>
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
              <DialogDescription>معلومات مهمة عن ترتيب الأعمدة وصيغة البيانات</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-right">
              <div>
                <h3 className="font-semibold text-lg mb-2">ترتيب الأعمدة في ملف Excel:</h3>
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
                <h3 className="font-semibold text-lg mb-2">ملاحظات مهمة:</h3>
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
                <h3 className="font-semibold text-sm mb-2">💡 نصيحة:</h3>
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
                        setConversionProgress(0)
                        setConversionStatus(t("bulk.status.processing"))
                        try {
                          if (importAllRows.length === 0) {
                            toast({ title: "تنبيه", description: "لم يتم العثور على صفوف في الملف", variant: "destructive" })
                            throw new Error("No rows found")
                          }

                          const importedProducts = await parseExcelData(importAllRows, importImagesMap, columnMapping)

                          if (importedProducts.length === 0) {
                            // Check if essential columns are mapped
                            const hasCode = columnMapping['productCode'] !== -1
                            const hasName = columnMapping['productName'] !== -1

                            if (!hasCode && !hasName) {
                              throw new Error("يجب تحديد عمود 'اسم المنتج' أو 'كود المنتج' على الأقل")
                            }

                            throw new Error("لم يتم العثور على منتجات صالحة. هل قمت بتعيين الأعمدة (الاسم/الكود) بشكل صحيح؟")
                          }

                          toast({ title: "نتيجة التحليل", description: `تم العثور على ${importedProducts.length} منتج من أصل ${importAllRows.length - 1} صف بيانات` })

                          setConversionStatus(t("bulk.status.convertImages"))
                          let convertedCount = 0
                          let failedCount = 0
                          let completed = 0
                          const CONCURRENCY = 3 // Reduced from 6 for stability ("Take its time")
                          const productsWithImages = await asyncPool(CONCURRENCY, importedProducts, async (product, idx) => {
                            let out = product
                            if (product.image && (product.image.startsWith('http://') || product.image.startsWith('https://'))) {
                              const base64Image = await convertImageToBase64(product.image)
                              if (base64Image) {
                                out = { ...product, image: base64Image }
                                convertedCount++
                              } else {
                                failedCount++
                              }
                            }
                            completed++
                            // THROTTLE UPDATES: Only update state every 25 items or if 100% complete
                            // This prevents "Maximum update depth exceeded" React error due to rapid state changes + parent re-renders
                            if (completed % 25 === 0 || completed === importedProducts.length) {
                              const pct = Math.round((completed / importedProducts.length) * 100)
                              setConversionProgress(pct)
                              setConversionStatus(
                                t("bulk.status.convertImagesProgress")
                                  .replace("{completed}", String(completed))
                                  .replace("{total}", String(importedProducts.length))
                              )
                            }
                            return out
                          })

                          // ... existing code ...

                          // Optimize Images: Split large images to side table
                          const optimizedProducts: typeof productsWithImages = []
                          const imageRecords: { productId: string; data: string }[] = []

                          for (const p of productsWithImages) {
                            if (p.image && p.image.length > 500 && !p.image.startsWith('http')) {
                              imageRecords.push({ productId: p.id, data: p.image })
                              optimizedProducts.push({ ...p, image: 'DB_IMAGE' })
                            } else {
                              optimizedProducts.push(p)
                            }
                          }

                          if (imageRecords.length > 0) {
                            await db.productImages.bulkPut(imageRecords)
                          }

                          const existingCategories = getCategories()
                          const existingCategoryNames = new Set(existingCategories.map((c) => c.name.toLowerCase().trim()))
                          const newCategories = new Set<string>()
                          optimizedProducts.forEach((product) => {
                            if (product.category && !existingCategoryNames.has(product.category.toLowerCase().trim())) {
                              newCategories.add(product.category.trim())
                            }
                          })
                          const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"]
                          let addedCategoriesCount = 0
                          newCategories.forEach((categoryName) => {
                            const randomColor = colors[Math.floor(Math.random() * colors.length)]
                            addCategory({ name: categoryName, color: randomColor })
                            addedCategoriesCount++
                          })

                          const existingLocations = getLocations()
                          const existingLocationNames = new Set(existingLocations.map((l: any) => l.name.toLowerCase().trim()))
                          const newLocations = new Set<string>()
                          optimizedProducts.forEach((product) => {
                            if (product.location && !existingLocationNames.has(product.location.toLowerCase().trim())) {
                              newLocations.add(product.location.trim())
                            }
                          })
                          let addedLocationsCount = 0
                          newLocations.forEach((locationName) => {
                            addLocation({ name: locationName, description: "تم الإضافة تلقائياً من الاستيراد", createdAt: new Date().toISOString() })
                            addedLocationsCount++
                          })

                          const normalize = (str: string) => {
                            if (!str) return ""
                            return str.trim().toLowerCase()
                              .replace(/[\u064B-\u065F\u0670]/g, "") // Remove Arabic diacritics
                              .replace(/[^\w\s\u0600-\u06FF]/g, "") // Remove special chars
                              .replace(/\s+/g, " ") // Normalize spaces
                          }

                          // Create a key based on characteristics: Name + Category + Price + Unit
                          const getCharKey = (p: import("@/lib/types").Product) => {
                            return `${normalize(p.productName)}|${normalize(p.category || '')}|${p.price || 0}|${normalize(p.unit || '')}`
                          }

                          // Deduplicate and merge logic - DISABLED as per user request to always import as new
                          /*
                          let existingProducts = getProducts()
                          if (existingProducts.length === 0) {
                            existingProducts = await db.products.toArray()
                          }
                          const codeMap = new Map<string, string>()
                          const itemNumMap = new Map<string, string>()
                          const nameMap = new Map<string, string>()
                          const charMap = new Map<string, string>()
                          const idMap = new Map<string, import("@/lib/types").Product>()
                          
                          // Build maps from EXISTING products only
                          existingProducts.forEach(p => {
                            idMap.set(p.id, p)
                            if (p.productCode) codeMap.set(normalize(p.productCode), p.id)
                            if (p.itemNumber) itemNumMap.set(normalize(p.itemNumber), p.id)
                            if (p.productName) nameMap.set(normalize(p.productName), p.id)
                            charMap.set(getCharKey(p), p.id)
                          })
                          */

                          // We will just use a map for the NEW products to be added, to ensure we can bulkPut them.
                          // Since we want to keep duplicates, we rely on the unique IDs generated during parseExcelData.
                          const newProductsMap = new Map<string, import("@/lib/types").Product>()

                          // Also need to keep existing products in the DB? 
                          // db.products.bulkPut will overwrite if ID matches. 
                          // Since we generate random IDs for new products, they won't overwrite existing ones by ID.
                          // But we need to make sure we don't lose existing data if we are supposed to 'saveProducts(allProducts)'.
                          // 'saveProducts' usually expects the FULL list of products (for localStorage sync/cache).

                          // So we must load existing products to append to them, but NOT to merge with them.
                          let currentAllProducts = getProducts()
                          if (currentAllProducts.length === 0) {
                            currentAllProducts = await db.products.toArray()
                          }

                          // Add existing products to the map so they are preserved
                          const idMap = new Map<string, import("@/lib/types").Product>()
                          currentAllProducts.forEach(p => idMap.set(p.id, p))

                          optimizedProducts.forEach(newP => {
                            // FORCE ADD NEW - No matching check
                            // Ensure ID is truly unique (it should be from parseExcelData)
                            // Just in case of collision (unlikely with Date.now + random), regenerate?
                            // parseExcelData uses: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                            // It is safe enough.

                            idMap.set(newP.id, newP)
                          })

                          const allProducts = Array.from(idMap.values())
                          // await db.products.bulkPut(allProducts) // Removed redundant double-write
                          saveProducts(allProducts)

                          // --- START CLOUD SYNC FIX ---
                          setConversionStatus("جاري المزامنة مع السحابة... (قد يستغرق وقتاً)")

                          // 1. Sync Products (Optimized Pool)
                          let syncedCount = 0
                          const SYNC_CONCURRENCY = 5 // Reduced from 10 for stability
                          await asyncPool(SYNC_CONCURRENCY, optimizedProducts, async (p) => {
                            try {
                              await syncProduct(p)
                              syncedCount++
                              const progress = Math.round((syncedCount / (optimizedProducts.length + imageRecords.length)) * 100)
                              setConversionProgress(progress)
                            } catch (e) {
                              console.error("Failed to sync product", p.productName, e)
                            }
                          })

                          // 2. Sync Images (Optimized Pool)
                          let syncedImages = 0
                          const IMG_SYNC_CONCURRENCY = 3 // Reduced from 5 for stability
                          await asyncPool(IMG_SYNC_CONCURRENCY, imageRecords, async (img) => {
                            try {
                              await syncProductImageToCloud(img.productId, img.data)
                              syncedImages++
                              const progress = Math.round(((syncedCount + syncedImages) / (optimizedProducts.length + imageRecords.length)) * 100)
                              setConversionProgress(progress)
                            } catch (e) {
                              console.error("Failed to sync image for product", img.productId, e)
                            }
                          })

                          console.log(`[Bulk Import] Synced ${syncedCount} products and ${syncedImages} images to cloud.`)
                          // --- END CLOUD SYNC FIX ---

                          // onProductsUpdate(allProducts) // Removed to prevent blocking UI with granular updates

                          // Prevent auto-seeding of demo data after import
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('demo_data_deleted', 'true')
                          }
                          await db.settings.put({ key: 'demo_data_deleted', value: true })

                          let message = `تم استيراد ${productsWithImages.length} منتج`
                          if (convertedCount > 0) {
                            message += ` وتحويل ${convertedCount} صورة`
                          }
                          if (failedCount > 0) {
                            message += ` (فشل تحويل ${failedCount} صورة)`
                          }
                          if (addedCategoriesCount > 0) {
                            message += ` وإضافة ${addedCategoriesCount} تصنيف جديد`
                          }
                          if (addedLocationsCount > 0) {
                            message += ` و${addedLocationsCount} موقع جديد`
                          }

                          toast({ title: "تم الاستيراد بنجاح", description: message })
                        } catch (error) {
                          console.error("[v0] Import error:", error)
                          toast({ title: "خطأ في الاستيراد", description: error instanceof Error ? error.message : "تأكد من صحة تنسيق الملف", variant: "destructive" })
                        } finally {
                          setIsImporting(false)
                          setConversionProgress(0)
                          setConversionStatus("")
                          setImportHeaders([])
                          setImportPreviewRows([])
                          setImportAllRows([])
                          setImportImagesMap({})
                        }
                      }}>تأكيد المطابقة</Button>
                    </div>
                  </div>
                </div>

                <h4 className="text-sm font-semibold mb-2 text-right">معاينة البيانات (أول 20 صف)</h4>
                <div className="border rounded-md w-full overflow-hidden">
                  <div className="overflow-x-auto max-h-[30vh]">
                    <table className="w-full text-xs sm:text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-muted/50 sticky top-0">
                          {importHeaders.map((h, i) => (<th key={i} className="border px-3 py-2 text-right font-medium text-muted-foreground">{h || `عمود ${i + 1}`}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewRows.map((r, ri) => (
                          <tr key={ri} className="hover:bg-muted/10">
                            {r.map((c, ci) => (<td key={ci} className="border px-3 py-1.5 text-right">{String(c ?? '')}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Maintenance Actions Group */}
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
                    const { hardReset } = await import('@/lib/storage');
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
      </div>
      <BackupRestoreDialog open={backupOpen} onOpenChange={setBackupOpen} />
    </>
  )
}
