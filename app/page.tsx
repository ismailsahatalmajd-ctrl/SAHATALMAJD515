"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Plus, Search, Filter, Settings, FileText, Eye, EyeOff, LayoutGrid, AlertTriangle, Settings2, RotateCcw, Calendar } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Header } from "@/components/header"
import { StatsCards } from "@/components/stats-cards"
import { ProductsTable } from "@/components/products-table"
import dynamic from "next/dynamic"
// Lazy-load non-critical client components to reduce initial bundle
const ProductForm = dynamic(() => import("@/components/product-form").then(m => m.ProductForm), { ssr: false })
const CategoryManager = dynamic(() => import("@/components/category-manager").then(m => m.CategoryManager), { ssr: false })
const BulkOperations = dynamic(() => import("@/components/bulk-operations").then(m => m.BulkOperations), { ssr: false })
const PerfReportButton = dynamic(() => import("@/components/perf-report").then(m => m.PerfReportButton), { ssr: false })
const BranchManager = dynamic(() => import("@/components/branch-manager").then(m => m.BranchManager), { ssr: false })
const UnitManager = dynamic(() => import("@/components/unit-manager").then(m => m.UnitManager), { ssr: false })
const LocationManager = dynamic(() => import("@/components/location-manager").then(m => m.LocationManager), { ssr: false })
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useI18n } from "@/components/language-provider"
import { useToast } from "@/hooks/use-toast"
import type { Product } from "@/lib/types"
import { useLiveQuery } from "dexie-react-hooks"
import { getProducts, addProduct, updateProduct, deleteProduct, getCategories, getLocations, syncAllFromServer, db, initDataStore, reloadFromDb, fixDuplicates } from "@/lib/storage"
import { convertNumbersToEnglish, getSafeImageSrc, getApiUrl } from "@/lib/utils"
import { collectPerf, savePerf } from "@/lib/perf"
import { saveInvoiceSettings as saveSettingsLib, getInvoiceSettings } from "@/lib/invoice-settings-store"
import { CounterToggle } from "@/components/counter-toggle"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useAuth } from "@/components/auth-provider"
import { hasPermission } from "@/lib/auth-utils"
import { useProductsRealtime, useCategoriesRealtime, useLocationsRealtime } from "@/hooks/use-store"
import { syncProduct, deleteProductApi } from "@/lib/sync-api"
import { useRouter } from "next/navigation"
import { SmartAlerts } from "@/components/smart-alerts"
import { MonthlyClosingDialog } from "@/components/monthly-closing-dialog"

type StockStatus = "all" | "available" | "low" | "out"

const SAMPLE_PRODUCTS = [
  {
    productCode: "ELEC-001",
    itemNumber: "1001",
    productName: "لابتوب ديل XPS",
    quantity: 0,
    unit: "قطعة",
    openingStock: 10,
    purchases: 5,
    issues: 2,
    inventoryCount: 13,
    currentStock: 13,
    difference: 0,
    price: 4500,
    averagePrice: 4500,
    currentStockValue: 58500,
    issuesValue: 9000,
    category: "إلكترونيات",
    location: "المستودع الرئيسي",
  },
  {
    productCode: "FURN-001",
    itemNumber: "2001",
    productName: "كرسي مكتب مريح",
    quantity: 0,
    unit: "قطعة",
    openingStock: 20,
    purchases: 0,
    issues: 5,
    inventoryCount: 15,
    currentStock: 15,
    difference: 0,
    price: 850,
    averagePrice: 850,
    currentStockValue: 12750,
    issuesValue: 4250,
    category: "أثاث",
    location: "المعرض",
  },
  {
    productCode: "ELEC-002",
    itemNumber: "1002",
    productName: "شاشة سامسونج 27 بوصة",
    quantity: 0,
    unit: "قطعة",
    openingStock: 5,
    purchases: 10,
    issues: 12,
    inventoryCount: 3,
    currentStock: 3,
    difference: 0,
    price: 1200,
    averagePrice: 1200,
    currentStockValue: 3600,
    issuesValue: 14400,
    category: "إلكترونيات",
    location: "المستودع الرئيسي",
  },
]

const DEFAULT_INVOICE_TYPE = "فاتورة صرف"
const DEFAULT_COLUMNS = ["itemNumber", "productName", "productCode", "price", "quantity", "unit"]

const getStockStatus = (p: Product): StockStatus => {
  if (p.currentStock <= 0) return "out"
  const threshold = p.lowStockThresholdPercentage || 33.33
  const limit = (p.openingStock + p.purchases) * (threshold / 100)
  if (p.currentStock <= limit) return "low"
  return "available"
}

const mergeDuplicateProducts = (products: Product[]): Product[] => {
  const mergedMap = new Map<string, Product>()
  products.forEach(p => {
    const key = p.productCode || p.itemNumber || p.id
    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key)!
      mergedMap.set(key, {
        ...existing,
        currentStock: existing.currentStock + p.currentStock,
        currentStockValue: existing.currentStockValue + p.currentStockValue,
        purchases: existing.purchases + p.purchases,
        issues: existing.issues + p.issues,
        openingStock: existing.openingStock + p.openingStock,
      })
    } else {
      mergedMap.set(key, { ...p })
    }
  })
  return Array.from(mergedMap.values())
}

export default function Home() {
  const router = useRouter()
  const { toast } = useToast()
  const { t } = useI18n()
  const { user } = useAuth()

  // PROTECT: Redirect Branch users to Branch Requests
  useEffect(() => {
    if ((user as any)?.role === 'branch') {
      router.replace('/branch-requests')
    }
  }, [user, router])

  if ((user as any)?.role === 'branch') return null

  // Realtime Hooks (Offline First)
  // We need to load ALL products for accurate stats and filtering
  const productsRaw = useLiveQuery(() => db.products.toArray())
  const productsLoading = !productsRaw
  const products = useMemo(() => (productsRaw || []) as Product[], [productsRaw])
  const { data: categoriesDataRaw } = useCategoriesRealtime()
  const categoriesData = categoriesDataRaw as { name: string }[]
  const { data: locationsDataRaw } = useLocationsRealtime()
  const locationsData = locationsDataRaw as { name: string }[]

  // Derived State
  const categories = useMemo(() => {
    if (categoriesDataRaw && categoriesDataRaw.length > 0) return categoriesData.map(c => c.name)
    const unique = new Set((products || []).map(p => p.category).filter(c => c && typeof c === 'string' && c.trim() !== ''))
    return Array.from(unique).sort()
  }, [categoriesData, products])

  const locations = useMemo(() => {
    if (locationsDataRaw && locationsDataRaw.length > 0) return locationsData.map(l => l.name)
    const unique = new Set((products || []).map(p => p.location).filter(l => l && typeof l === 'string' && l.trim() !== ''))
    return Array.from(unique).sort()
  }, [locationsData, products])

  // Auto-fix quantityPerCarton = 0 for existing products
  // Auto-Correction Background Task: Ensure DB meets consistency rules
  // "Take its time" -> Process very slowly to avoid performance impact
  useEffect(() => {
    if (!products || products.length === 0) return

    const ensureConsistency = async () => {
      // 1. Fix QuantityPerCarton
      // 2. Fix CurrentStock mismatch (Opening + Purchases - Issues)

      const updates = []

      for (const p of products) {
        if (!p.id) continue

        // Rule 1: QtyPerCarton default 1
        if (!p.quantityPerCarton || p.quantityPerCarton === 0) {
          updates.push({ id: p.id, changes: { quantityPerCarton: 1 } })
        }

        // Rule 2: Stock Consistency
        const op = Number(p.openingStock) || 0
        const pu = Number(p.purchases) || 0
        const iss = Number(p.issues) || 0
        const theoretical = op + pu - iss
        const stored = Number(p.currentStock)

        // If mismatch > 0.001 (float tolerance), schedule update
        if (Math.abs(stored - theoretical) > 0.001) {
          // Avoid adding duplicates if already fixing carton
          const existing = updates.find(u => u.id === p.id)
          if (existing) {
            existing.changes.currentStock = theoretical
          } else {
            updates.push({ id: p.id, changes: { currentStock: theoretical } })
          }
        }
      }

      if (updates.length === 0) return

      console.log(`🧹 Found ${updates.length} products needing consistency fix. Starting slow fix...`)

      // Process updates slowly: 1 product every 200ms
      // This is "Taking its time" to the extreme to satisfy user request
      for (let i = 0; i < updates.length; i++) {
        const u = updates[i]
        try {
          await db.products.update(u.id, u.changes)
        } catch (e) { console.error('Auto-fix failed', e) }

        if (i % 5 === 0) await new Promise(r => setTimeout(r, 1000)) // Wait 1 second every 5 items
      }

      console.log("✅ Background consistency check complete.")
    }

    // Start after 5 seconds to let initial load finish
    const timer = setTimeout(ensureConsistency, 5000)
    return () => clearTimeout(timer)
  }, [products?.length]) // Run when product count changes (load finished)


  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedLocation, setSelectedLocation] = useState<string>("all")
  const [selectedStockStatus, setSelectedStockStatus] = useState<StockStatus>("all")
  const [mergeDuplicates, setMergeDuplicates] = useState(false)
  const [excludeZeroStock, setExcludeZeroStock] = useState(false)

  const filteredProducts = useMemo(() => {
    let filtered = products || []

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          String(p.productName || "").toLowerCase().includes(lowerTerm) ||
          String(p.productCode || "").toLowerCase().includes(lowerTerm) ||
          String(p.itemNumber || "").toLowerCase().includes(lowerTerm),
      )
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter((p) => p.category === selectedCategory)
    }

    if (selectedLocation !== "all") {
      filtered = filtered.filter((p) => p.location === selectedLocation)
    }

    if (selectedStockStatus !== "all") {
      filtered = filtered.filter((p) => {
        const status = getStockStatus(p)
        return status === selectedStockStatus
      })
    }

    if (excludeZeroStock) {
      filtered = filtered.filter((p) => (p.currentStock || 0) > 0)
    }

    if (mergeDuplicates) {
      try {
        filtered = mergeDuplicateProducts(filtered)
      } catch (e) {
        console.error("Merge duplicates failed", e)
      }
    }

    return filtered
  }, [searchTerm, selectedCategory, selectedLocation, selectedStockStatus, excludeZeroStock, mergeDuplicates, products])
  const [isSideSheetOpen, setIsSideSheetOpen] = useState(false)

  // Monthly Closing Dialog
  const [monthlyClosingOpen, setMonthlyClosingOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | undefined>()

  const [invoiceType, setInvoiceType] = useState<string>(DEFAULT_INVOICE_TYPE)
  const [customInvoiceType, setCustomInvoiceType] = useState<string>("")
  const [invoiceColumns, setInvoiceColumns] = useState<string[]>(DEFAULT_COLUMNS)
  const [showFilters, setShowFilters] = useState(true)
  const [showCards, setShowCards] = useState(true)
  const [filtersVisibilityOpen, setFiltersVisibilityOpen] = useState(false)
  const [cardsVisibilityOpen, setCardsVisibilityOpen] = useState(false)
  const [filterShowSearch, setFilterShowSearch] = useState(true)
  const [filterShowCategory, setFilterShowCategory] = useState(true)
  const [filterShowLocation, setFilterShowLocation] = useState(true)
  const [filterShowStatus, setFilterShowStatus] = useState(true)
  const [filterShowMergeDup, setFilterShowMergeDup] = useState(true)
  const [filterShowExcludeZero, setFilterShowExcludeZero] = useState(true)
  const [visibleCards, setVisibleCards] = useState({ totalProducts: true, totalUnits: true, inventoryValue: true, lowStock: true, outOfStock: true })
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  const UI_PREFS_KEY = 'ui_visibility_prefs_v1'

  useEffect(() => {
    // Load UI prefs from Dexie
    const load = async () => {
      try {
        const setting = await db.settings.get(UI_PREFS_KEY)
        if (setting?.value) {
          const prefs = setting.value
          setShowFilters(prefs.showFilters ?? true)
          setShowCards(prefs.showCards ?? true)
          setFilterShowSearch(prefs.filterShowSearch ?? true)
          setFilterShowCategory(prefs.filterShowCategory ?? true)
          setFilterShowLocation(prefs.filterShowLocation ?? true)
          setFilterShowStatus(prefs.filterShowStatus ?? true)
          setFilterShowMergeDup(prefs.filterShowMergeDup ?? true)
          setFilterShowExcludeZero(prefs.filterShowExcludeZero ?? true)
          setVisibleCards({
            totalProducts: prefs.cards?.totalProducts ?? true,
            totalUnits: prefs.cards?.totalUnits ?? true,
            inventoryValue: prefs.cards?.inventoryValue ?? true,
            lowStock: prefs.cards?.lowStock ?? true,
            outOfStock: prefs.cards?.outOfStock ?? true,
          })
        } else {
          // Migration from localStorage
          const raw = localStorage.getItem(UI_PREFS_KEY)
          if (raw) {
            try {
              const prefs = JSON.parse(raw)
              // Apply them
              setShowFilters(prefs.showFilters ?? true)
              setShowCards(prefs.showCards ?? true)
              setFilterShowSearch(prefs.filterShowSearch ?? true)
              setFilterShowCategory(prefs.filterShowCategory ?? true)
              setFilterShowLocation(prefs.filterShowLocation ?? true)
              setFilterShowStatus(prefs.filterShowStatus ?? true)
              setFilterShowMergeDup(prefs.filterShowMergeDup ?? true)
              setFilterShowExcludeZero(prefs.filterShowExcludeZero ?? true)
              setVisibleCards({
                totalProducts: prefs.cards?.totalProducts ?? true,
                totalUnits: prefs.cards?.totalUnits ?? true,
                inventoryValue: prefs.cards?.inventoryValue ?? true,
                lowStock: prefs.cards?.lowStock ?? true,
                outOfStock: prefs.cards?.outOfStock ?? true,
              })
              // Save to Dexie and remove from LS
              await db.settings.put({ key: UI_PREFS_KEY, value: prefs })
              localStorage.removeItem(UI_PREFS_KEY)
            } catch { }
          }
        }
      } catch { } finally {
        setPrefsLoaded(true)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!prefsLoaded) return
    // Save UI prefs to Dexie
    const save = async () => {
      try {
        const prefs = {
          showFilters,
          showCards,
          filterShowSearch,
          filterShowCategory,
          filterShowLocation,
          filterShowStatus,
          filterShowMergeDup,
          filterShowExcludeZero,
          cards: visibleCards,
        }
        await db.settings.put({ key: UI_PREFS_KEY, value: prefs })
      } catch { }
    }
    // Debounce slightly to avoid thrashing DB on rapid toggles, 
    // but here we just fire it. Dexie is fast enough.
    save()
  }, [showFilters, showCards, filterShowSearch, filterShowCategory, filterShowLocation, filterShowStatus, filterShowMergeDup, filterShowExcludeZero, visibleCards])

  // Helper to convert images to base64 for PDF
  const convertImagesToBase64 = async (productsList: Product[]) => {
    // Show toast
    toast({
      title: getDualString("home.toast.preparingReport"),
      description: getDualString("home.toast.processingImages").replace("{count}", String(productsList.length)),
    });

    const results: Product[] = [];
    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;

    for (let i = 0; i < productsList.length; i += BATCH_SIZE) {
      const batch = productsList.slice(i, i + BATCH_SIZE);
      const processedBatch = await Promise.all(batch.map(async (p) => {
        if (!p.image) return p;

        try {
          // Fix for Filtered Report: Check if image is in productImages table
          if (p.image === 'DB_IMAGE') {
            const imgRecord = await db.productImages.get({ productId: p.id });
            if (imgRecord && imgRecord.data) {
              return { ...p, image: imgRecord.data };
            } else {
              return { ...p, image: "" };
            }
          }

          let src = getSafeImageSrc(p.image);

          // Force proxy for PDF generation if it's an external URL
          if (src.startsWith('http')) {
            src = getApiUrl(`/api/image-proxy?url=${encodeURIComponent(src)}`);
          }

          // If it's already base64, return as is
          if (src.startsWith('data:')) return { ...p, image: src };

          // Fetch the image
          const response = await fetch(src);
          if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

          const blob = await response.blob();

          return new Promise<Product>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({ ...p, image: reader.result as string });
            };
            reader.onerror = () => {
              // Return placeholder on conversion error
              resolve({ ...p, image: "" });
            };
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Failed to convert image for PDF", e);
          // Return without image on fetch error (prevents broken icon)
          return { ...p, image: "" };
        }
      }));
      results.push(...processedBatch);
    }

    return results;
  };

  const printProductsFullPDF = async () => {
    if (!hasPermission(user, 'page.reports')) {
      toast({ title: "غير مسموح", description: "لا تملك صلاحية التقارير", variant: "destructive" })
      return
    }
    // Convert images first
    const productsWithImages = await convertImagesToBase64(products);

    // Helper to calculate turnover
    const calcTurnover = (p: Product) => {
      const stock = Number(p.currentStock || 0)
      const opening = Number(p.openingStock || 0)
      const purchases = Number(p.purchases || 0)
      const soldQty = Number(p.issues || 0)
      const baseStock = stock > 0 ? stock : opening + purchases
      if (baseStock <= 0) return 0
      const ratio = soldQty / baseStock
      return (isFinite(ratio) && !isNaN(ratio)) ? ratio : 0
    }

    // Helper for status label
    const getStatusLabel = (p: Product) => {
      const sold = Number(p.issues || 0)
      const stock = Number(p.currentStock || 0)
      const opening = Number(p.openingStock || 0)
      const ratio = calcTurnover(p)

      let key = "normal"
      if (opening === 0 && stock > 0 && sold === 0) key = "new"
      else if (sold === 0) key = "stagnant"
      else if (ratio >= 1) key = "fast"
      else if (ratio >= 0.35 && ratio < 1) key = "normal"
      else if (ratio < 0.5) key = "slow"

      const labels: Record<string, string> = {
        fast: "سريع / Fast",
        normal: "عادي / Normal",
        slow: "بطيء / Slow",
        stagnant: "راكد / Stagnant",
        new: "جديد / New"
      }
      return labels[key] || key
    }

    const columns = [
      { key: 'image', title: 'الصورة<br>Image' },
      { key: 'productCode', title: 'كود المنتج<br>Product Code' },
      { key: 'itemNumber', title: 'رقم المنتج<br>Item Number' },
      { key: 'productName', title: 'اسم المنتج<br>Product Name' },
      { key: 'location', title: 'الموقع<br>Location' },
      { key: 'category', title: 'التصنيف<br>Category' },
      { key: 'unit', title: 'الوحدة<br>Unit' },
      { key: 'openingStock', title: 'المخزون الابتدائي<br>Opening Stock' },
      { key: 'purchases', title: 'المشتريات<br>Purchases' },
      { key: 'issues', title: 'المصروفات<br>Issues' },
      { key: 'inventoryCount', title: 'الجرد<br>Inventory Count' },
      { key: 'currentStock', title: 'المخزون الحالي<br>Current Stock' },
      { key: 'difference', title: 'الفرق<br>Difference' },
      { key: 'price', title: 'السعر<br>Price' },
      { key: 'averagePrice', title: 'متوسط السعر<br>Avg Price' },
      { key: 'currentStockValue', title: 'قيمة المخزون<br>Stock Value' },
      { key: 'issuesValue', title: 'قيمة المصروفات<br>Issues Value' },
      { key: 'turnoverRate', title: 'معدل الدوران<br>Turnover Rate' },
      { key: 'status', title: 'الحالة<br>Status' },
      { key: 'lastActivity', title: 'آخر نشاط<br>Last Activity' },
    ]

    const rowsHtml = productsWithImages.map((p, idx) => {
      const turnover = calcTurnover(p)
      const turnoverPct = `${(turnover * 100).toFixed(2)}%`
      const status = getStatusLabel(p)
      const lastAct = p.lastActivity ? new Date(p.lastActivity).toLocaleDateString('en-GB') : '-'
      // Use p.image directly as it is now likely base64
      const img = p.image ? `<img src="${p.image}" crossorigin="anonymous" style="width:40px;height:40px;object-fit:cover;border-radius:4px">` : '-'

      return `
      <tr>
        <td class="index">${idx + 1}</td>
        <td>${img}</td>
        <td>${convertNumbersToEnglish(p.productCode)}</td>
        <td>${convertNumbersToEnglish(p.itemNumber)}</td>
        <td class="name">${p.productName}</td>
        <td>${p.location || '-'}</td>
        <td>${p.category || '-'}</td>
        <td>${p.unit || '-'}</td>
        <td>${convertNumbersToEnglish(p.openingStock)}</td>
        <td>${convertNumbersToEnglish(p.purchases)}</td>
        <td>${convertNumbersToEnglish(p.issues)}</td>
        <td>${convertNumbersToEnglish(p.inventoryCount)}</td>
        <td class="qty">${convertNumbersToEnglish(p.currentStock)}</td>
        <td style="color:${(p.difference || 0) !== 0 ? 'red' : 'inherit'}">${convertNumbersToEnglish(p.difference)}</td>
        <td>${convertNumbersToEnglish(p.price?.toFixed(2))}</td>
        <td>${convertNumbersToEnglish(p.averagePrice?.toFixed(2))}</td>
        <td>${convertNumbersToEnglish(p.currentStockValue?.toFixed(2))}</td>
        <td>${convertNumbersToEnglish(p.issuesValue?.toFixed(2))}</td>
        <td>${convertNumbersToEnglish(turnoverPct)}</td>
        <td>${status}</td>
        <td>${lastAct}</td>
      </tr>
    `}).join("")

    const headerHtml = columns.map(c => `<th>${c.title}</th>`).join("")

    // Calculate status cards stats
    const totalFiltered = filteredProducts.length
    const statusKeys: Array<"fast" | "normal" | "slow" | "stagnant" | "new"> = ["fast", "normal", "slow", "stagnant", "new"]
    const statusMeta: Record<string, { title: string; bg: string; border: string; text: string; hint: string }> = {
      fast: { title: "سريع الحركة", bg: "#f0fdf4", border: "#bbf7d0", text: "#14532d", hint: "معدل دوران عالي" },
      normal: { title: "حركة عادية", bg: "#eff6ff", border: "#bfdbfe", text: "#1e3a8a", hint: "معدل دوران متوسط" },
      slow: { title: "بطيء الحركة", bg: "#fefce8", border: "#fef08a", text: "#713f12", hint: "معدل دوران منخفض" },
      stagnant: { title: "راكد", bg: "#fef2f2", border: "#fecaca", text: "#7f1d1d", hint: "لا يوجد حركة" },
      new: { title: "جديد", bg: "#faf5ff", border: "#e9d5ff", text: "#581c87", hint: "مخزون حديث" },
    }

    // Using filteredProducts for cards logic to match UI behavior in ProductsTable
    // If you want full dataset stats, change to 'products' here, but usually report reflects filtered view
    const statusCardsHtml = statusKeys.map((key) => {
      // Logic duplicated from ProductsTable for consistency
      const list = filteredProducts.filter((p) => {
        const sold = Number(p.issues || 0)
        const stock = Number(p.currentStock || 0)
        const opening = Number(p.openingStock || 0)
        const ratio = calcTurnover(p)

        let k = "normal"
        if (opening === 0 && stock > 0 && sold === 0) k = "new"
        else if (sold === 0) k = "stagnant"
        else if (ratio >= 1) k = "fast"
        else if (ratio >= 0.35 && ratio < 1) k = "normal"
        else if (ratio < 0.5) k = "slow"

        return k === key
      })

      const count = list.length
      const value = list.reduce((sum, p) => sum + Number(p.currentStockValue || 0), 0)
      const m = statusMeta[key]

      return `
        <div class="card" style="background-color:${m.bg};border:1px solid ${m.border};color:${m.text}">
          <div class="card-title">${m.title}</div>
          <div class="card-value">${convertNumbersToEnglish(count)} منتج</div>
          <div class="card-sub">${convertNumbersToEnglish(value.toLocaleString('ar-SA'))} ريال</div>
          <div class="card-hint">${m.hint}</div>
          <div class="card-footer">من أصل ${convertNumbersToEnglish(totalFiltered)}</div>
        </div>
      `
    }).join("")

    const summaryHtml = `
      <div class="footer">
        <div class="box"><strong>إجمالي القيمة المصفى:</strong> ${convertNumbersToEnglish(filteredTotalValue.toLocaleString('ar-SA'))} ريال</div>
        <div class="box"><strong>إجمالي القيمة الكلي:</strong> ${convertNumbersToEnglish(totalValue.toLocaleString('ar-SA'))} ريال</div>
        <div class="box"><strong>عدد المنتجات:</strong> ${products.length}</div>
      </div>
    `
    const html = `<!DOCTYPE html>
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تقرير شامل PDF</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#0f172a;padding:10px;font-size:10px}
      @media (min-width: 768px) { body { padding: 20px; } }
      .header{border-bottom:3px solid #2563eb;padding-bottom:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:5px;align-items:center}
      @media (min-width: 480px) { .header { flex-direction: row; justify-content:space-between; } }
      .title{color:#2563eb;font-size:16px;font-weight:700}
      @media (min-width: 768px) { .title { font-size: 18px; } }
      .meta{color:#334155;font-size:11px}
      .table-wrapper{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:9px;min-width:600px}
      th,td{border:1px solid #e2e8f0;padding:4px;text-align:center;word-wrap:break-word}
      thead th{background:#f1f5f9;font-weight:600;white-space:nowrap}
      .index{width:25px;color:#475569}
      .name{text-align:right;max-width:150px}
      .qty{color:#16a34a;font-weight:bold}
      .footer{margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px}
      .box{background:#f8fafc;border-right:3px solid #2563eb;border-radius:4px;padding:8px;font-size:11px;flex:1;min-width:150px}
      
      .cards-container { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-start; margin-bottom: 15px; }
      .card { flex: 1; min-width: 120px; padding: 8px; border-radius: 6px; text-align: center; font-size: 10px; }
      .card-title { font-weight: bold; margin-bottom: 4px; font-size: 11px; }
      .card-value { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
      .card-sub { font-size: 10px; margin-bottom: 4px; opacity: 0.9; }
      .card-hint { font-size: 9px; opacity: 0.8; margin-bottom: 2px; }
      .card-footer { font-size: 9px; opacity: 0.7; }

      @page{size:A4 landscape;margin:10mm}
      @media print{body{padding:0} .table-wrapper{overflow:visible} table{min-width:auto}}
    </style></head>
    <body>
      <div class="header">
        <div class="title">تقرير المنتجات الشامل (Full Report)</div>
        <div class="meta"><strong>التاريخ:</strong> ${new Date().toLocaleString('ar')}</div>
      </div>
      <div class="cards-container">
        ${statusCardsHtml}
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              ${headerHtml}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${summaryHtml}
    </body></html>`

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();

    // Wait for images to load before printing
    const images = w.document.getElementsByTagName('img');
    if (images.length > 0) {
      let loaded = 0;
      const checkLoaded = () => {
        loaded++;
        if (loaded >= images.length) {
          setTimeout(() => w.print(), 500);
        }
      };

      for (let i = 0; i < images.length; i++) {
        if (images[i].complete) {
          checkLoaded();
        } else {
          images[i].onload = checkLoaded;
          images[i].onerror = checkLoaded; // Print anyway on error
        }
      }
    } else {
      setTimeout(() => w.print(), 500);
    }
  }

  const printFilteredTableCardsPDF = async () => {
    if (!hasPermission(user, 'page.reports')) {
      toast({ title: "غير مسموح", description: "لا تملك صلاحية التقارير", variant: "destructive" })
      return
    }
    // Convert images first
    const filteredProductsWithImages = await convertImagesToBase64(filteredProducts);

    // Helper to calculate turnover
    const calcTurnover = (p: Product) => {
      const stock = Number(p.currentStock ?? 0)
      const opening = Number(p.openingStock ?? 0)
      const purchases = Number(p.purchases ?? 0)
      const soldQty = Number(p.issues ?? 0)
      const baseStock = stock > 0 ? stock : opening + purchases
      if (baseStock <= 0) return 0
      const ratio = soldQty / baseStock
      return (isFinite(ratio) && !isNaN(ratio)) ? ratio : 0
    }

    const columns = [
      { key: 'image', title: 'الصورة<br>Image' },
      { key: 'productCode', title: 'كود المنتج<br>Product Code' },
      { key: 'itemNumber', title: 'رقم المنتج<br>Item Number' },
      { key: 'productName', title: 'اسم المنتج<br>Product Name' },
      { key: 'category', title: 'التصنيف<br>Category' },
      { key: 'location', title: 'الموقع<br>Location' },
      { key: 'unit', title: 'الوحدة<br>Unit' },
      { key: 'currentStock', title: 'المخزون الحالي<br>Current Stock' },
      { key: 'price', title: 'السعر<br>Price' },
    ]

    const rowsHtml = filteredProductsWithImages.map((p, idx) => {
      // Use p.image directly as it is now likely base64
      const img = p.image ? `<img src="${p.image}" crossorigin="anonymous" style="width:40px;height:40px;object-fit:cover;border-radius:4px">` : '-'

      return `
      <tr>
        <td class="index">${idx + 1}</td>
        <td>${img}</td>
        <td>${convertNumbersToEnglish(p.productCode)}</td>
        <td>${convertNumbersToEnglish(p.itemNumber)}</td>
        <td class="name">${p.productName}</td>
        <td>${p.category || '-'}</td>
        <td>${p.location || '-'}</td>
        <td>${p.unit || '-'}</td>
        <td class="qty">${convertNumbersToEnglish(p.currentStock)}</td>
        <td>${convertNumbersToEnglish(p.price?.toFixed(2))}</td>
      </tr>
    `}).join("")

    const headerHtml = columns.map(c => `<th>${c.title}</th>`).join("")

    // Calculate status cards stats (using filteredProducts)
    const totalFiltered = filteredProducts.length
    const statusKeys: Array<"fast" | "normal" | "slow" | "stagnant" | "new"> = ["fast", "normal", "slow", "stagnant", "new"]
    const statusMeta: Record<string, { title: string; bg: string; border: string; text: string; hint: string }> = {
      fast: { title: "سريع الحركة", bg: "#f0fdf4", border: "#bbf7d0", text: "#14532d", hint: "معدل دوران عالي" },
      normal: { title: "حركة عادية", bg: "#eff6ff", border: "#bfdbfe", text: "#1e3a8a", hint: "معدل دوران متوسط" },
      slow: { title: "بطيء الحركة", bg: "#fefce8", border: "#fef08a", text: "#713f12", hint: "معدل دوران منخفض" },
      stagnant: { title: "راكد", bg: "#fef2f2", border: "#fecaca", text: "#7f1d1d", hint: "لا يوجد حركة" },
      new: { title: "جديد", bg: "#faf5ff", border: "#e9d5ff", text: "#581c87", hint: "مخزون حديث" },
    }

    const statusCardsHtml = statusKeys.map((key) => {
      const list = filteredProducts.filter((p) => {
        const sold = Number(p.issues || 0)
        const stock = Number(p.currentStock || 0)
        const opening = Number(p.openingStock || 0)
        const ratio = calcTurnover(p)

        let k = "normal"
        if (opening === 0 && stock > 0 && sold === 0) k = "new"
        else if (sold === 0) k = "stagnant"
        else if (ratio >= 1) k = "fast"
        else if (ratio >= 0.35 && ratio < 1) k = "normal"
        else if (ratio < 0.5) k = "slow"

        return k === key
      })

      const count = list.length
      const value = list.reduce((sum, p) => sum + Number(p.currentStockValue || 0), 0)
      const m = statusMeta[key]

      return `
        <div class="card" style="background-color:${m.bg};border:1px solid ${m.border};color:${m.text}">
          <div class="card-title">${m.title}</div>
          <div class="card-value">${convertNumbersToEnglish(count)} منتج</div>
          <div class="card-sub">${convertNumbersToEnglish(value.toLocaleString('ar-SA'))} ريال</div>
          <div class="card-hint">${m.hint}</div>
          <div class="card-footer">من أصل ${convertNumbersToEnglish(totalFiltered)}</div>
        </div>
      `
    }).join("")

    const summaryHtml = `
      <div class="footer">
        <div class="box"><strong>إجمالي القيمة المصفى:</strong> ${convertNumbersToEnglish(filteredTotalValue.toLocaleString('ar-SA'))} ريال</div>
        <div class="box"><strong>إجمالي القيمة الكلي:</strong> ${convertNumbersToEnglish(totalValue.toLocaleString('ar-SA'))} ريال</div>
        <div class="box"><strong>عدد المنتجات:</strong> ${filteredProducts.length}</div>
      </div>
    `
    const html = `<!DOCTYPE html>
    <html dir="rtl" lang="ar"><head><meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تقرير المنتجات المفلتر</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#fff;color:#0f172a;padding:10px;font-size:10px}
      @media (min-width: 768px) { body { padding: 20px; } }
      .header{border-bottom:3px solid #2563eb;padding-bottom:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:5px;align-items:center}
      @media (min-width: 480px) { .header { flex-direction: row; justify-content:space-between; } }
      .title{color:#2563eb;font-size:16px;font-weight:700}
      @media (min-width: 768px) { .title { font-size: 18px; } }
      .meta{color:#334155;font-size:11px}
      .table-wrapper{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:9px;min-width:600px}
      th,td{border:1px solid #e2e8f0;padding:4px;text-align:center;word-wrap:break-word}
      thead th{background:#f1f5f9;font-weight:600;white-space:nowrap}
      .index{width:25px;color:#475569}
      .name{text-align:right;max-width:150px}
      .qty{color:#16a34a;font-weight:bold}
      .footer{margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px}
      .box{background:#f8fafc;border-right:3px solid #2563eb;border-radius:4px;padding:8px;font-size:11px;flex:1;min-width:150px}
      
      .cards-container { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-start; margin-bottom: 15px; }
      .card { flex: 1; min-width: 120px; padding: 8px; border-radius: 6px; text-align: center; font-size: 10px; }
      .card-title { font-weight: bold; margin-bottom: 4px; font-size: 11px; }
      .card-value { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
      .card-sub { font-size: 10px; margin-bottom: 4px; opacity: 0.9; }
      .card-hint { font-size: 9px; opacity: 0.8; margin-bottom: 2px; }
      .card-footer { font-size: 9px; opacity: 0.7; }

      @page{size:A4 landscape;margin:10mm}
      @media print{body{padding:0} .table-wrapper{overflow:visible} table{min-width:auto}}
    </style></head>
    <body>
      <div class="header">
        <div class="title">تقرير المنتجات (Filtered Report)</div>
        <div class="meta"><strong>التاريخ:</strong> ${new Date().toLocaleString('ar')}</div>
      </div>
      <div class="cards-container">
        ${statusCardsHtml}
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              ${headerHtml}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${summaryHtml}
    </body></html>`

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();

    // Wait for images to load before printing
    const images = w.document.getElementsByTagName('img');
    if (images.length > 0) {
      let loaded = 0;
      const checkLoaded = () => {
        loaded++;
        if (loaded >= images.length) {
          setTimeout(() => w.print(), 500);
        }
      };

      for (let i = 0; i < images.length; i++) {
        if (images[i].complete) {
          checkLoaded();
        } else {
          images[i].onload = checkLoaded;
          images[i].onerror = checkLoaded; // Print anyway on error
        }
      }
    } else {
      setTimeout(() => w.print(), 500);
    }
  }


  useEffect(() => {
    try { const snap = collectPerf(); savePerf(snap) } catch { }
  }, [])

  // Load invoice settings from app_settings on mount
  useEffect(() => {
    getInvoiceSettings().then(inv => {
      setInvoiceType(inv.type || DEFAULT_INVOICE_TYPE)
      setCustomInvoiceType(inv.customType || "")
      setInvoiceColumns(Array.isArray(inv.columns) && inv.columns.length ? inv.columns : DEFAULT_COLUMNS)
    })
  }, [])

  // حاول استعادة الإعدادات من الخادم ثمّ تحديث الحالة المحلية
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings?key=app_settings', { cache: 'no-store' })
        const json = await res.json()
        if (json && json.value) {
          localStorage.setItem('app_settings', JSON.stringify(json.value))
          const inv = json.value.invoiceSettings || {}
          setInvoiceType(inv.type || DEFAULT_INVOICE_TYPE)
          setCustomInvoiceType(inv.customType || "")
          setInvoiceColumns(Array.isArray(inv.columns) && inv.columns.length ? inv.columns : DEFAULT_COLUMNS)
        }
      } catch { }
    })()
  }, [])


  // Derive available product columns whenever products change
  const availableColumns = useMemo(() => {
    try {
      // @ts-ignore
      const keys = Array.from(new Set(products.flatMap((p) => Object.keys(p))))
      return Array.from(new Set([...DEFAULT_COLUMNS, ...keys]))
    } catch {
      return DEFAULT_COLUMNS
    }
  }, [products])

  const saveInvoiceSettings = async () => {
    try {
      const effectiveType = invoiceType === "نوع آخر" && customInvoiceType ? customInvoiceType : invoiceType

      await saveSettingsLib({
        type: effectiveType,
        customType: invoiceType === "نوع آخر" ? customInvoiceType : "",
        columns: invoiceColumns,
      })

      toast({
        title: getDualString("toast.success"),
        description: getDualString("home.toast.saveSuccess")
      })
    } catch (e) {
      console.error("Failed to save invoice settings", e)
      toast({
        title: getDualString("common.error"),
        description: getDualString("home.toast.saveError"),
        variant: "destructive"
      })
    }
  }

  const resetInvoiceSettings = async () => {
    try {
      setInvoiceType(DEFAULT_INVOICE_TYPE)
      setCustomInvoiceType("")
      setInvoiceColumns(DEFAULT_COLUMNS)

      await saveSettingsLib({
        type: DEFAULT_INVOICE_TYPE,
        customType: "",
        columns: DEFAULT_COLUMNS
      })

      toast({
        title: getDualString("toast.success"),
        description: getDualString("home.toast.resetSuccess")
      })
    } catch (e) {
      console.error("Failed to reset invoice settings", e)
      toast({
        title: getDualString("common.error"),
        description: getDualString("home.toast.resetError"),
        variant: "destructive"
      })
    }
  }

  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => { isMountedRef.current = false }
  }, [])






  const totalValue = (products || []).reduce((sum, p) => sum + Number(p.currentStockValue || 0), 0)
  const filteredTotalValue = filteredProducts.reduce((sum, p) => sum + Number(p.currentStockValue || 0), 0)

  const handleAddProduct = async (product: Partial<Product>) => {
    // Generate full product object
    const price = Number(product.price || 0)
    const averagePrice = Number(product.averagePrice ?? price ?? 0)
    const openingStock = Number(product.openingStock || 0)
    const purchases = Number(product.purchases || 0)
    const issues = Number(product.issues || 0)
    const currentStock = openingStock + purchases - issues

    const newProduct = {
      ...product,
      id: product.id || Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Ensure calculated fields
      currentStock: currentStock,
      currentStockValue: currentStock * averagePrice,
      averagePrice: averagePrice,
    } as Product

    // Optimistic Local Update (Always)
    addProduct(newProduct)

    if (user) {
      // Cloud Sync
      try {
        await syncProduct(newProduct)
      } catch (e) {
        console.error("Cloud sync failed", e)
        toast({ title: "Sync Failed", description: "Saved locally but failed to sync to cloud", variant: "destructive" })
      }
    }
  }

  const handleUpdateProduct = async (product: Partial<Product>) => {
    if (editingProduct) {
      const updated = { ...editingProduct, ...product, updatedAt: new Date().toISOString() }

      // Optimistic Local Update
      updateProduct(editingProduct.id, product)

      if (user) {
        // Cloud Sync
        try {
          await syncProduct(updated)
        } catch (e) {
          console.error("Cloud sync failed", e)
        }
      }
      setEditingProduct(undefined)
    }
  }

  const handleDeleteProduct = async (id: string) => {
    // Optimistic Local Delete
    await deleteProduct(id)
  }

  // Handle bulk updates from child components
  const setProducts = (newProducts: Product[]) => {
    // In Realtime architecture, we shouldn't replace the whole list manually
    // Child components should call addProduct/updateProduct/deleteProduct
    // But for bulk operations, we can iterate
    console.warn("setProducts called - prefer granular updates")
    newProducts.forEach(p => addProduct(p)) // This is inefficient for large lists but safe
  }

  const handleFixQuantityPerCarton = async () => {
    if (!hasPermission(user, 'inventory.edit')) {
      toast({ title: "غير مسموح", description: "لا تملك صلاحية تعديل المخزون", variant: "destructive" })
      return
    }
    try {
      const toFix = products.filter(p => !p.quantityPerCarton || p.quantityPerCarton === 0)
      if (toFix.length === 0) {
        toast({ title: "✅ كل المنتجات صحيحة", description: "جميع المنتجات لديها كمية/كرتون صحيحة" })
        return
      }

      const { syncProduct } = await import('@/lib/firebase-sync-engine')

      for (const product of toFix) {
        if (product.id) {
          await db.products.update(product.id, { quantityPerCarton: 1 })
          const updated = await db.products.get(product.id)
          if (updated) {
            await syncProduct(updated).catch(console.error)
          }
        }
      }

      toast({
        title: "✅ تم التحديث بنجاح",
        description: `تم إصلاح ${toFix.length} منتج`
      })

      setTimeout(() => window.location.reload(), 1000)
    } catch (error: any) {
      toast({ title: "❌ خطأ", description: error.message, variant: "destructive" })
    }
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setIsSideSheetOpen(true)
  }

  const handleFormClose = (open: boolean) => {
    setIsSideSheetOpen(open)
    if (!open) {
      setEditingProduct(undefined)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <CounterToggle />
        </div>
        <div className="space-y-6">
          {showCards && <StatsCards products={products} visible={visibleCards} />}

          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px]" style={{ display: filterShowSearch ? undefined : 'none' }}>
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("home.search.placeholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10 h-9"
                />
              </div>

              {/* Filters moved to Products Table */}

              <div className="flex items-center gap-4 border-l pl-4 ml-2" style={{ display: (filterShowMergeDup || filterShowExcludeZero) ? undefined : 'none' }}>
                <div className="flex items-center gap-2" style={{ display: filterShowMergeDup ? undefined : 'none' }}>
                  <Checkbox
                    id="merge-duplicates"
                    checked={mergeDuplicates}
                    onCheckedChange={(checked) => setMergeDuplicates(checked as boolean)}
                  />
                  <Label htmlFor="merge-duplicates" className="text-sm font-medium cursor-pointer">
                    <DualText k="home.filters.mergeDuplicates" />
                  </Label>
                </div>
                <div className="flex items-center gap-2" style={{ display: filterShowExcludeZero ? undefined : 'none' }}>
                  <Checkbox
                    id="exclude-zero"
                    checked={excludeZeroStock}
                    onCheckedChange={(checked) => setExcludeZeroStock(checked as boolean)}
                  />
                  <Label htmlFor="exclude-zero" className="text-sm font-medium cursor-pointer">
                    <DualText k="home.filters.excludeZero" />
                  </Label>
                </div>
              </div>

              <BulkOperations products={products} filteredProducts={filteredProducts} onProductsUpdate={setProducts} />

              {hasPermission(user, 'page.settings') && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle><DualText k="home.settings.title" /></SheetTitle>
                    <SheetDescription><DualText k="home.settings.desc" /></SheetDescription>
                  </SheetHeader>
                  <Tabs defaultValue="categories" className="mt-6">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="categories"><DualText k="home.settings.tabs.categories" /></TabsTrigger>
                      <TabsTrigger value="locations"><DualText k="home.settings.tabs.locations" /></TabsTrigger>
                      <TabsTrigger value="branches"><DualText k="home.settings.tabs.branches" /></TabsTrigger>
                      <TabsTrigger value="units"><DualText k="home.settings.tabs.units" /></TabsTrigger>
                      <TabsTrigger value="invoice"><DualText k="home.settings.tabs.invoice" /></TabsTrigger>
                    </TabsList>
                    <TabsContent value="categories" className="mt-4">
                      <CategoryManager />
                    </TabsContent>
                    <TabsContent value="locations" className="mt-4">
                      <LocationManager />
                    </TabsContent>
                    <TabsContent value="branches" className="mt-4">
                      <BranchManager />
                    </TabsContent>
                    <TabsContent value="units" className="mt-4">
                      <UnitManager />
                    </TabsContent>
                    <TabsContent value="invoice" className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="invoiceType"><DualText k="home.settings.invoice.type" /></Label>
                        <select
                          id="invoiceType"
                          value={invoiceType}
                          onChange={(e) => setInvoiceType(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2"
                        >
                          <option value="فاتورة صرف">{t("home.settings.invoice.types.issue")}</option>
                          <option value="فاتورة تجميع">{t("home.settings.invoice.types.assembly")}</option>
                          <option value="فاتورة مشتريات">{t("home.settings.invoice.types.purchase")}</option>
                          <option value="طلبات فروع">{t("home.settings.invoice.types.branch")}</option>
                          <option value="طلبات مشتريات جديدة">{t("home.settings.invoice.types.newPurchase")}</option>
                          <option value="نوع آخر">{t("home.settings.invoice.types.other")}</option>
                        </select>
                        {invoiceType === "نوع آخر" && (
                          <div className="mt-2">
                            <Input
                              placeholder={t("home.settings.invoice.typePlaceholder")}
                              value={customInvoiceType}
                              onChange={(e) => setCustomInvoiceType(e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label><DualText k="home.settings.invoice.columns" /></Label>
                        <div className="grid grid-cols-2 gap-3">
                          {availableColumns.map((key) => {
                            const labels: Record<string, string> = {
                              id: t("common.id"),
                              productCode: t("common.code"),
                              itemNumber: t("common.itemNumber"),
                              productName: t("common.productName"),
                              price: t("common.price"),
                              averagePrice: t("common.avgPrice"),
                              quantity: t("common.quantity"),
                              unit: t("common.unit"),
                              category: t("common.category"),
                              location: t("common.location"),
                            }
                            const label = labels[key] || key
                            const checked = invoiceColumns.includes(key)
                            return (
                              <label key={key} className="flex items-center gap-2">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(val) => {
                                    const isOn = Boolean(val)
                                    setInvoiceColumns((prev) =>
                                      isOn ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key),
                                    )
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            )
                          })}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <DualText k="home.settings.invoice.columnsDesc" />
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <Button onClick={saveInvoiceSettings}><DualText k="home.settings.invoice.save" /></Button>
                        <Button variant="outline" onClick={resetInvoiceSettings}><DualText k="home.settings.invoice.reset" /></Button>
                      </div>

                      <div className="border-t pt-4 mt-4 mb-4">
                        <h3 className="font-bold mb-2 text-orange-600">إصلاح المشاكل (Maintenance)</h3>
                        <p className="text-xs text-muted-foreground mb-2">أداة لإصلاح تكرار المنتجات ودمجها تلقائياً.</p>
                        <Button variant="outline" className="w-full border-orange-200 hover:bg-orange-50 text-orange-700" onClick={async () => {
                          if (confirm(t("home.maintenance.fixDuplicates.confirm"))) {
                            const loadingToast = toast({
                              title: getDualString("common.processing"),
                              description: getDualString("common.pleaseWait")
                            })
                            try {
                              const res = await fixDuplicates()
                              toast({
                                title: getDualString("toast.success"),
                                description: getDualString("home.maintenance.fixDuplicates.finished")
                                  .replace("{merged}", String(res.mergedCount))
                                  .replace("{removed}", String(res.removedCount))
                              })
                            } catch (e) {
                              console.error(e)
                              toast({
                                title: getDualString("common.error"),
                                description: getDualString("common.errorOccurred"),
                                variant: "destructive"
                              })
                            }
                          }
                        }}>
                          <Settings2 className="w-4 h-4 ml-2" />
                          فحص وإصلاح التكرار
                        </Button>
                      </div>

                      <div className="border-t pt-4 mt-4">
                        <h3 className="font-bold mb-2 text-destructive">منطقة الخطر</h3>
                        <Button variant="destructive" onClick={async () => {
                          if (confirm(t("home.maintenance.dbReset.confirm"))) {
                            try {
                              await db.delete()
                              window.location.reload()
                            } catch (e) {
                              console.error(e)
                              alert(t("home.maintenance.dbReset.error"))
                            }
                          }
                        }}>
                          <DualText k="home.maintenance.dbReset.button" />
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </SheetContent>
              </Sheet>
              )}

              {/* Settings & Actions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    <DualText k="common.settingsAndActions" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel><DualText k="settings.view" /></DropdownMenuLabel>

                  <DropdownMenuItem onClick={() => setFiltersVisibilityOpen(true)}>
                    <Eye className="ml-2 h-4 w-4" />
                    <DualText k="settings.manageFilters" />
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => setShowFilters(!showFilters)}>
                    {showFilters ? (
                      <>
                        <EyeOff className="ml-2 h-4 w-4" />
                        <DualText k="settings.hideFilters" />
                      </>
                    ) : (
                      <>
                        <Eye className="ml-2 h-4 w-4" />
                        <DualText k="settings.showFilters" />
                      </>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => setCardsVisibilityOpen(true)}>
                    <LayoutGrid className="ml-2 h-4 w-4" />
                    <DualText k="settings.manageCards" />
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => setShowCards(!showCards)}>
                    {showCards ? (
                      <>
                        <EyeOff className="ml-2 h-4 w-4" />
                        <DualText k="settings.hideCards" />
                      </>
                    ) : (
                      <>
                        <LayoutGrid className="ml-2 h-4 w-4" />
                        <DualText k="settings.showCards" />
                      </>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel><DualText k="settings.inventory" /></DropdownMenuLabel>

                  <DropdownMenuItem
                    onClick={() => {
                      if (!hasPermission(user, 'inventory.adjust')) {
                        toast({ title: "غير مسموح", description: "لا تملك صلاحية إقفال الشهر", variant: "destructive" })
                        return
                      }
                      setMonthlyClosingOpen(true)
                    }}
                    disabled={!hasPermission(user, 'inventory.adjust')}
                    className="text-orange-700"
                  >
                    <Calendar className="ml-2 h-4 w-4" />
                    <DualText k="settings.closeMonth" />
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={handleFixQuantityPerCarton}>
                    <RotateCcw className="ml-2 h-4 w-4" />
                    <DualText k="settings.fixQuantityPerCarton" />
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel><DualText k="settings.reports" /></DropdownMenuLabel>

                  <DropdownMenuItem onClick={printProductsFullPDF} disabled={!hasPermission(user, 'page.reports')}>
                    <FileText className="ml-2 h-4 w-4" />
                    <DualText k="settings.fullPdfReport" />
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={printFilteredTableCardsPDF} disabled={!hasPermission(user, 'page.reports')}>
                    <FileText className="ml-2 h-4 w-4" />
                    <DualText k="settings.filteredPdfReport" />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button onClick={() => setIsSideSheetOpen(true)}>
                <Plus className="ml-2 h-4 w-4" />
                <div className="flex flex-col items-start leading-tight">
                  <DualText
                    k="home.products.addNew"
                    className="text-primary-foreground font-bold text-sm"
                  />
                </div>
              </Button>


            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground"><DualText k="home.products.showingPrefix" /></span>
                <span className="font-bold">{filteredProducts.length}</span>
                <span className="text-muted-foreground"><DualText k="home.products.showingMid" /></span>
                <span className="font-bold">{(products || []).length}</span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground"><DualText k="reports.inventoryValue" />:</span>
                <span className="font-bold text-primary text-lg">
                  {convertNumbersToEnglish(filteredTotalValue.toLocaleString("ar-SA"))} <DualText k="common.currency" />
                </span>
                <span className="text-muted-foreground mx-1">/</span>
                <span className="text-muted-foreground">{convertNumbersToEnglish(totalValue.toLocaleString("ar-SA"))}</span>
              </div>
            </div>
          </div>

          <ProductsTable
            products={filteredProducts}
            onEdit={handleEdit}
            onDelete={handleDeleteProduct}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onLocationChange={setSelectedLocation}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onReset={() => {
              setSearchTerm("")
              setSelectedCategory("all")
              setSelectedLocation("all")
              setSelectedStockStatus("all")
              setMergeDuplicates(false)
              setExcludeZeroStock(false)
            }}
          />
          <Dialog open={filtersVisibilityOpen} onOpenChange={setFiltersVisibilityOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle><DualText k="home.dialogs.filters.title" /></DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2"><Checkbox checked={filterShowSearch} onCheckedChange={(v) => setFilterShowSearch(Boolean(v))} /> <DualText k="home.dialogs.filters.search" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={filterShowCategory} onCheckedChange={(v) => setFilterShowCategory(Boolean(v))} /> <DualText k="home.dialogs.filters.category" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={filterShowLocation} onCheckedChange={(v) => setFilterShowLocation(Boolean(v))} /> <DualText k="home.dialogs.filters.location" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={filterShowStatus} onCheckedChange={(v) => setFilterShowStatus(Boolean(v))} /> <DualText k="home.dialogs.filters.status" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={filterShowMergeDup} onCheckedChange={(v) => setFilterShowMergeDup(Boolean(v))} /> <DualText k="home.dialogs.filters.mergeDup" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={filterShowExcludeZero} onCheckedChange={(v) => setFilterShowExcludeZero(Boolean(v))} /> <DualText k="home.dialogs.filters.excludeZero" /></label>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Button onClick={() => { setFilterShowSearch(false); setFilterShowCategory(false); setFilterShowLocation(false); setFilterShowStatus(false); setFilterShowMergeDup(false); setFilterShowExcludeZero(false) }}><DualText k="common.hideAll" /></Button>
                <Button variant="outline" onClick={() => { setFilterShowSearch(true); setFilterShowCategory(true); setFilterShowLocation(true); setFilterShowStatus(true); setFilterShowMergeDup(true); setFilterShowExcludeZero(true) }}><DualText k="common.showAll" /></Button>
                <Button variant="ghost" onClick={() => { setShowFilters(true); setFilterShowSearch(true); setFilterShowCategory(true); setFilterShowLocation(true); setFilterShowStatus(true); setFilterShowMergeDup(true); setFilterShowExcludeZero(true) }}><DualText k="common.resetDefault" /></Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={cardsVisibilityOpen} onOpenChange={setCardsVisibilityOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle><DualText k="home.dialogs.cards.title" /></DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2"><Checkbox checked={visibleCards.totalProducts} onCheckedChange={(v) => setVisibleCards((s) => ({ ...s, totalProducts: Boolean(v) }))} /> <DualText k="home.dialogs.cards.totalProducts" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={visibleCards.totalUnits} onCheckedChange={(v) => setVisibleCards((s) => ({ ...s, totalUnits: Boolean(v) }))} /> <DualText k="home.dialogs.cards.totalUnits" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={visibleCards.inventoryValue} onCheckedChange={(v) => setVisibleCards((s) => ({ ...s, inventoryValue: Boolean(v) }))} /> <DualText k="home.dialogs.cards.inventoryValue" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={visibleCards.lowStock} onCheckedChange={(v) => setVisibleCards((s) => ({ ...s, lowStock: Boolean(v) }))} /> <DualText k="home.dialogs.cards.lowStock" /></label>
                <label className="flex items-center gap-2"><Checkbox checked={visibleCards.outOfStock} onCheckedChange={(v) => setVisibleCards((s) => ({ ...s, outOfStock: Boolean(v) }))} /> <DualText k="home.dialogs.cards.outOfStock" /></label>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Button onClick={() => setVisibleCards({ totalProducts: false, totalUnits: false, inventoryValue: false, lowStock: false, outOfStock: false })}><DualText k="common.hideAll" /></Button>
                <Button variant="outline" onClick={() => setVisibleCards({ totalProducts: true, totalUnits: true, inventoryValue: true, lowStock: true, outOfStock: true })}><DualText k="common.showAll" /></Button>
                <Button variant="ghost" onClick={() => { setShowCards(true); setVisibleCards({ totalProducts: true, totalUnits: true, inventoryValue: true, lowStock: true, outOfStock: true }) }}><DualText k="common.resetDefault" /></Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </main >

      <ProductForm
        open={isSideSheetOpen}
        onOpenChange={handleFormClose}
        onSubmit={editingProduct ? handleUpdateProduct : handleAddProduct}
        product={editingProduct}
        categories={categories}
      />
      {/* Monthly Closing Dialog */}
      <MonthlyClosingDialog
        open={monthlyClosingOpen}
        onOpenChange={setMonthlyClosingOpen}
        totalProducts={products.length}
      />

      {/* Smart Alerts with Month Closing Support */}
      <SmartAlerts onMonthClosingClick={() => {
        if (!hasPermission(user, 'inventory.adjust')) {
          toast({ title: "غير مسموح", description: "لا تملك صلاحية إقفال الشهر", variant: "destructive" })
          return
        }
        setMonthlyClosingOpen(true)
      }} />
    </div >
  )
}
