
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { getBranches, getProducts, getIssues, addIssue, setIssueDelivered, setIssueBranchReceived, clearAllBranchRequests, saveBranches, getBranchRequests, getBranchInvoices, saveBranchRequestDraft, getBranchRequestDrafts, deleteBranchRequestDraft } from "@/lib/storage"
import { addBranchRequest, updateBranchRequest } from "@/lib/branch-request-storage"
import type { Product } from "@/lib/types"
import type { BranchInvoiceItem } from "@/lib/branch-invoice-types"
import { addBranchInvoice } from "@/lib/branch-invoice-storage"
import { generateBranchInvoicePDF } from "@/lib/branch-invoice-pdf-generator"
import { generateBranchRequestPDF } from "@/lib/branch-request-pdf-generator"
import { generateIssuePDF } from "@/lib/pdf-generator"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { normalize, getSafeImageSrc } from "@/lib/utils"
import { useProductsRealtime, useBranchesRealtime, useBranchRequestsRealtime, useBranchInvoicesRealtime, useIssuesRealtime, useLocationsRealtime } from "@/hooks/use-store"
import { syncIssue, syncBranchRequest, syncBranchInvoice } from "@/lib/sync-api"
import { syncAllCloudToLocal } from "@/lib/firebase-sync-engine"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShoppingCart, LogOut, Loader2, CheckCircle, Printer, X, RotateCcw, Package, Wrench, ClipboardList, TrendingDown, FileText, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { db } from "@/lib/db"
import { useLiveQuery } from "dexie-react-hooks"
import { deleteAllBranchRequestsApi } from "@/lib/sync-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { useAuth } from "@/components/auth-provider"
import { ProductImage } from "@/components/product-image"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { useI18n } from "@/components/language-provider"
import { hardReset } from "@/lib/storage"

// Branch Inventory Components
import { BranchInventoryStock } from "@/components/branch-inventory-stock"
import { BranchConsumption } from "@/components/branch-consumption"
import { BranchInventoryCount } from "@/components/branch-inventory-count"
import { BranchConsumptionReports } from "@/components/branch-consumption-reports"
import { BranchAssetsRegistry } from "@/components/branch-assets-registry"
import { BranchAssetStatusReport } from "@/components/branch-asset-status-report"
import { BranchAssetRequest } from "@/components/branch-asset-request"
import { BranchMaintenanceReports } from "@/components/branch-maintenance-reports"
import { BranchInventoryInvoices } from "@/components/branch-inventory-invoices"

export function BranchDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const settings = useInvoiceSettings()
  const { t } = useI18n()
  const { user: authUser, loading: authLoading, logout } = useAuth()
  const user = authUser as any

  // Realtime Data Hooks
  const { data: branchesData } = useBranchesRealtime()
  // const { data: rawProducts } = useProductsRealtime() // Removed in favor of direct DB query
  const { data: allRequestsData } = useBranchRequestsRealtime()
  const { data: allInvoicesData } = useBranchInvoicesRealtime()
  const { data: allIssuesData } = useIssuesRealtime()

  // Add missing locations hook
  const { data: locationsData } = useLocationsRealtime()

  const productLocations = useLiveQuery(async () => {
    // Fallback: extract from products manually to ensure we get data
    const products = await db.products.toArray()
    const unique = new Set(products.map(p => p.location).filter(k => k && typeof k === 'string' && k.trim() !== ''))
    return Array.from(unique).sort()
  }) || []

  const locations = (locationsData && locationsData.length > 0)
    ? locationsData.map(l => l.name)
    : productLocations



  const branches = branchesData || []
  const allRequests = allRequestsData || []

  const [branchId, setBranchId] = useState<string>("")
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(0)
  const [activeTab, setActiveTab] = useState("invoice")
  const [warehouseTab, setWarehouseTab] = useState("inventory")
  const [warehouseSubPage, setWarehouseSubPage] = useState<string | null>(null) // null = show buttons, "stock" | "consume" | "reports" | "count" | "invoices" | "assets" | "status" | "request" | "maintenance" | "assets-invoices"
  const [zoomImage, setZoomImage] = useState<string | null>(null) // Legacy state? No, let's replace it.
  const [zoomedProduct, setZoomedProduct] = useState<Product | null>(null)
  // const [branches, setBranches] = useState<any[]>([]) // Removed in favor of realtime hook

  useEffect(() => {
    setMounted(true)

    // Load branches - handled by hook now
    // const allBranches = getBranches()
    // setBranches(allBranches)

    if (authLoading) return

    if (!user) {
      router.replace("/login")
      return
    }

    const initDashboard = async () => {
      // Wait for branches to load
      if (branches.length === 0 && !user.role) return

      if (user.role === "admin") {
        // Admin can view any branch
        const qId = searchParams?.get('id')
        if (qId) {
          setBranchId(qId)
          setAuthorized(true)
        } else {
          // Admin shouldn't be here normally, but if forced:
          setLoading(false)
        }
      } else if (user.role === "branch") {
        // Branch user MUST view their own branch
        const myBranchId = user.branchId
        const myUsername = user.email || user.displayName // fallback

        // 1. Try to find local match by ID
        let foundBranch = branches.find(b => b.id === myBranchId)

        // 2. If not found by ID, try by Username (fix for ID mismatch after sync)
        if (!foundBranch && myUsername) {
          foundBranch = branches.find(b => b.username && b.username.toLowerCase() === myUsername.toLowerCase())
          if (foundBranch) {
            console.log("Recovered branch by username match:", foundBranch.id)
          }
        }

        // Set the ID to the one we found (or the session one if we didn't find any yet)
        setBranchId(foundBranch ? foundBranch.id : (myBranchId || ""))
        setAuthorized(true)

        // 3. If still not found, fetch from server (skip in static export if API missing)
        /*
        if (!foundBranch) {
            try {
                // Use getBaseUrl if available or just try fetch, but handle failure gracefully
                // In static export, this might fail 404, which is expected.
                // We rely on realtime sync or initial data load.
            } catch (err) {
                console.error("Failed to load branches from server", err)
            }
        }
        */
      } else {
        router.replace("/login")
      }
      setLoading(false)
    }

    initDashboard()

  }, [router, searchParams, user, authLoading, branches])

  const handleForceRefresh = async () => {
    setLoading(true)
    try {
      // Emit sync start event for indicator
      window.dispatchEvent(new Event("syncstart"))

      await syncAllCloudToLocal((msg) => toast({ title: "Syncing / جاري المزامنة", description: msg }))

      // Emit sync end event
      window.dispatchEvent(new Event("syncend"))

      toast({
        title: "✅ تم التحديث",
        description: "تم تحديث جميع البيانات بنجاح",
        duration: 2000
      })

      // Force re-render by updating lastUpdate state instead of full reload
      setLastUpdate(Date.now())
    } catch (e) {
      window.dispatchEvent(new Event("syncend"))
      toast({ title: "Error", description: "Sync failed / فشل المزامنة", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleFactoryResetBranchRequests = async () => {
    if (confirm("Are you sure you want to delete all history permanently (Cloud & Local)? / هل أنت متأكد من حذف السجل نهائياً (سحابي ومحلي)؟")) {
      const ids = requests.map(r => r.id)
      await deleteAllBranchRequestsApi(ids)
      await clearAllBranchRequests()
      window.location.reload()
    }
  }

  const branch = branches.find((b) => b.id === branchId)

  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")

  const productsCount = useLiveQuery(() => db.products.count()) || 0
  // Optimization: Use separate query for categories to avoid loading full products
  // Optimization: Use separate query for categories to avoid loading full products
  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    if (all.length > 0) return all.map(c => c.name).sort()

    // Fallback: extract from products
    const products = await db.products.toArray()
    const unique = new Set(products.map(p => p.category).filter(c => c && typeof c === 'string' && c.trim() !== ''))
    return Array.from(unique).sort()
  }) || []

  // Optimization: Filter at DB level instead of loading all products
  const filteredProducts = useLiveQuery(async () => {
    let collection = db.products.toCollection()

    // Apply text filter if exists
    if (query) {
      const q = normalize(query)
      // Dexie doesn't support advanced multi-field search natively efficiently without FullText addon,
      // but we can filter efficiently on the primary index or use a filter function which is still better than render-loop filtering.
      // For better performance with large datasets, we limit the result set.
      return await db.products
        .filter(p => {
          return (
            normalize(p.productName).includes(q) ||
            normalize(p.productCode).includes(q) ||
            normalize(p.itemNumber).includes(q) ||
            (p.cartonBarcode && normalize(p.cartonBarcode).includes(q))
          )
        })
        .filter(p => {
          if (categoryFilter !== "all" && p.category !== categoryFilter) return false
          if (locationFilter !== "all" && p.location !== locationFilter) return false
          return true
        })
        .limit(3000) // Increased limit to cover all products
        .toArray()
    } else {
      // If no search, just apply category/location filters
      let result = db.products
      if (categoryFilter !== "all") {
        // Using filter instead of complex compound index for simplicity (unless index exists)
        result = result.filter(p => p.category === categoryFilter) as any
      }
      if (locationFilter !== "all") {
        result = result.filter(p => p.location === locationFilter) as any
      }
      return await result.limit(3000).toArray()
    }
  }, [query, categoryFilter, locationFilter]) || []

  const displayProducts = filteredProducts

  const [cart, setCart] = useState<BranchInvoiceItem[]>([])

  // Load products in cart to get their current stock
  const cartProducts = useLiveQuery(async () => {
    if (cart.length === 0) return []
    return await db.products.where('id').anyOf(cart.map(c => c.productId)).toArray()
  }, [cart]) || []
  // const allRequests = mounted ? getBranchRequests() : []
  const invoices = (allInvoicesData || []).filter(i => i.branchId === branchId)
  const requests = (allRequests || []).filter((r) => r.branchId === branchId)
  const issues = (allIssuesData || []).filter((i) => i.branchId === branchId)

  const displayInvoices = invoices.slice(0, 50)
  const displayRequests = requests.slice(0, 50)
  const displayIssues = issues.slice(0, 50)

  const [requestType, setRequestType] = useState<"supply" | "return">("return")
  const [requestNotes, setRequestNotes] = useState("")
  const [cartLoaded, setCartLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Local Draft Logic
  useEffect(() => {
    if (!branchId || cartLoaded) return

    const drafts = getBranchRequestDrafts()
    const draft = drafts.find(d => d.branchId === branchId)

    if (draft && draft.items && draft.items.length > 0) {
      // Map draft items back to cart items (ensure types match)
      const items: BranchInvoiceItem[] = draft.items.map((it: any) => ({
        id: it.id,
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice || 0,
        totalPrice: it.totalPrice,
        image: it.image,
        unit: it.unit,
        returnReason: it.returnReason,
        // Preserve other fields if any
        unitType: it.unitType || 'base',
        quantityEntered: it.quantityEntered || it.quantity,
        quantityBase: it.quantityBase || it.quantity,
        selectedUnitName: it.selectedUnitName || it.unit,
        quantityPerCarton: it.quantityPerCarton,
        cartonUnit: it.cartonUnit,
        notes: it.notes
      }))
      setCart(items)
      if (draft.notes) setRequestNotes(draft.notes)
      if (draft.type) setRequestType(draft.type)

      toast({ title: t("common.draftLoaded", "تم استعادة المسودة"), description: t("common.draftLoadedDesc", "تم استعادة طلبك السابق غير المكتمل") })
    }
    setCartLoaded(true)
  }, [branchId, cartLoaded, t])

  // Auto-Save Draft
  useEffect(() => {
    if (!branchId || !cartLoaded) return

    const timer = setTimeout(async () => {
      // Save draft locally regardless of connection
      if (cart.length > 0) {
        await saveBranchRequestDraft({
          id: branchId, // Use branchId as draft ID for simplicity (one draft per branch)
          branchId: branchId,
          branchName: branch?.name || "",
          items: cart,
          type: requestType,
          notes: requestNotes,
          updatedAt: new Date().toISOString()
        })
      } else {
        // If empty, delete draft? Or keep empty? 
        // Getting behavior from Issues page: it clears if empty?
        // Let's delete if empty to keep clean.
        await deleteBranchRequestDraft(branchId)
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [cart, branchId, cartLoaded, requestType, requestNotes, branch])

  async function confirmIssue(id: string) {
    if (!confirm("Confirm receipt? / هل أنت متأكد من استلام هذه الشحنة؟")) return

    const updated = await setIssueBranchReceived(id)
    if (updated) {
      toast({ title: "Receipt Confirmed / تم تأكيد الاستلام", description: "Status updated successfully / تم تحديث حالة الشحنة بنجاح" })
      setLastUpdate(Date.now())
    } else {
      toast({ title: "Error / خطأ", description: "Failed to update status / فشل تحديث الحالة", variant: "destructive" })
    }
  }

  function updateCartUnit(idx: number, type: 'base' | 'carton') {
    const item = cart[idx]
    if (!item.quantityPerCarton || item.quantityPerCarton <= 1) return

    const factor = item.quantityPerCarton
    let newUnitPrice = item.unitPrice
    let newName = item.selectedUnitName

    if (item.unitType === 'base' && type === 'carton') {
      // Switch to Carton: Price x Factor
      newUnitPrice = item.unitPrice * factor
      newName = item.cartonUnit || 'Carton'
    } else if (item.unitType === 'carton' && type === 'base') {
      // Switch to Base: Price / Factor
      newUnitPrice = item.unitPrice / factor
      newName = item.unit || 'Piece'
    }

    setCart((prev) =>
      prev.map((x, i) => {
        if (i !== idx) return x
        return {
          ...x,
          unitType: type,
          unitPrice: newUnitPrice,
          selectedUnitName: newName,
          quantityBase: x.quantity * (type === 'carton' ? factor : 1),
          totalPrice: x.quantity * newUnitPrice
        }
      })
    )
  }

  function addToCart(p: Product, forceUnit?: 'base' | 'carton') {
    const existIdx = cart.findIndex((x) => x.productId === p.id)
    const unitPrice = p.averagePrice ?? p.price ?? 0

    // Determine Logic
    const shouldUseCarton = forceUnit === 'carton';

    // If Item Exists
    if (existIdx >= 0) {
      setCart((prev) => {
        const existing = prev[existIdx]

        // If forcing carton, maybe switch unit type?
        // Current logic: If existing is Base, and we scan Carton, should we switch to Carton?
        // Or just add quantity.
        // Let's assume we just add quantity in current unit. 
        // Or better: If existing is Base, and we scan Carton, we add quantityPerCarton Pieces? 
        // No, keep it simple. If ForceUnit is set, we ensure unit is that type?
        // The user experience: Scan Carton -> Item in Cart (Carton Unit) -> Scan Carton again -> 2 Cartons.

        // Strategy: If unitType matches, increment. If not, switch? 
        // Switching is aggressive.
        // Let's stick to: Increment quantity. 
        // But if I scan Carton (Qty=24) and item is Pieces. Adding 1 "Piece" is wrong.
        // I should add "QuantityPerCarton" if units mismatch?

        // Simplified: Just add 1 to the current unit for now. 
        // Smart Scan logic will be handled at the "Call Site" (Scanner).
        // If I pass forceUnit='carton', I expect 1 Carton to be added.

        const isCarton = existing.unitType === 'carton'
        const qtyToAdd = 1
        // If I force Carton, whilst item is Piece, I should add 24 Pieces? 
        // Or switch item to Carton? 
        // Switching is best.

        let targetUnitType = existing.unitType;
        if (forceUnit && forceUnit !== existing.unitType) {
          // We could switch, but that might confuse if user manually selected.
          // Let's just respect the existing item state for now.
        }

        const newQty = (existing.quantity || 0) + 1
        const factor = existing.unitType === 'carton' ? (existing.quantityPerCarton || 1) : 1

        const updated = {
          ...existing,
          quantity: newQty,
          quantityEntered: newQty,
          quantityBase: newQty * factor,
          totalPrice: existing.unitPrice * newQty
        }
        const newCart = [...prev]
        newCart[existIdx] = updated
        return newCart
      })
    } else {
      // New Item
      const useCarton = forceUnit === 'carton' && p.quantityPerCarton && p.quantityPerCarton > 1;
      const initialUnitType = useCarton ? 'carton' : 'base';
      const initialUnitPrice = useCarton ? (unitPrice * (p.quantityPerCarton || 1)) : unitPrice;
      const initialUnitName = useCarton ? (p.cartonUnit || 'Carton') : (p.unit || 'Piece');
      const factor = useCarton ? (p.quantityPerCarton || 1) : 1;

      const item: BranchInvoiceItem = {
        id: p.id,
        productId: p.id,
        productCode: p.productCode,
        productName: p.productName,
        unit: p.unit,
        image: p.image || "",
        quantity: 1,
        unitPrice,
        totalPrice: initialUnitPrice,
        // Multi-Unit Defaults
        unitType: initialUnitType,
        quantityEntered: 1,
        quantityBase: factor,
        selectedUnitName: initialUnitName,
        quantityPerCarton: p.quantityPerCarton,
        cartonUnit: p.cartonUnit
      }
      setCart((prev) => [item, ...prev])
    }
  }

  function updateQty(idx: number, qty: number) {
    const val = Math.max(0, Math.floor(qty))
    setCart((prev) =>
      prev.map((x, i) => {
        if (i !== idx) return x
        const factor = x.unitType === 'carton' ? (x.quantityPerCarton || 1) : 1
        return {
          ...x,
          quantity: val,
          quantityEntered: val,
          quantityBase: val * factor,
          totalPrice: x.unitPrice * val
        }
      }),
    )
  }

  function updateReturnReason(idx: number, reason: string) {
    setCart((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, returnReason: reason } : x)),
    )
  }

  function updateItemNotes(idx: number, notes: string) {
    setCart((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, notes: notes } : x)),
    )
  }

  function removeItem(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  async function submitInvoice() {
    if (!branch || isSubmitting) return
    if (!cart.length) {
      toast({ title: "Add Items / أضف عناصر", description: "Please add products to invoice / يرجى إضافة منتجات إلى الفاتورة" })
      return
    }

    setIsSubmitting(true)
    try {
      const created = await addBranchInvoice({ branchId: branch.id, branchName: branch.name, items: cart, notes: "فاتورة فرع" })

      // Sync Invoice
      syncBranchInvoice(created).catch(console.error)

      try {
        const issueProducts = created.items.map((it) => ({
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          image: it.image,
          unit: it.unit,
          notes: it.notes,
        }))
        const newIssue = await addIssue({
          branchId: created.branchId,
          branchName: created.branchName,
          products: issueProducts,
          totalValue: created.totalValue,
          notes: created.notes ?? "صرف نتيجة فاتورة فرع",
          createdBy: "branch",
        })

        // Sync Issue
        syncIssue(newIssue).catch(console.error)
      } catch (e) {
        console.error("Failed to add issue for branch invoice:", e)
      }

      const url = await generateBranchInvoicePDF(created)
      toast({ title: "Invoice Created / تم إنشاء فاتورة", description: `Total: ${created.totalValue.toFixed(2)}` })
      window.open(url, "_blank")
      setCart([])
    } catch (error) {
      console.error("Submit invoice failed:", error)
      toast({ title: "Error / خطأ", description: "Failed to create invoice / فشل إنشاء الفاتورة", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRequest() {
    if (!branch || isSubmitting) return
    if (!cart.length) {
      toast({ title: "أضف عناصر", description: "يرجى إضافة منتجات إلى الطلب" })
      return
    }

    setIsSubmitting(true)
    try {
      const items = cart.map(item => ({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        requestedQuantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        image: item.image,
        returnReason: item.returnReason,
        notes: item.notes  // Add notes field
      }))

      const created = await addBranchRequest({
        branchId: branch.id,
        branchName: branch.name,
        items: items as any,
        type: requestType,
        notes: requestNotes,
        status: "submitted",
        createdBy: "branch",
      })

      // Delete Draft
      await deleteBranchRequestDraft(branchId)

      // Sync Request
      syncBranchRequest(created).catch(console.error)

      toast({ title: "تم إرسال الطلب", description: "تم إرسال طلبك بنجاح" })

      if (requestType === 'return') {
        await generateBranchRequestPDF(created)
      }

      setCart([])
      setRequestNotes("")
    } catch (error) {
      console.error("Submit request failed:", error)
      toast({ title: "Error / خطأ", description: "Failed to submit request / فشل إرسال الطلب", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      router.replace("/login")
    } catch (error) {
      console.error("Logout failed", error)
      router.replace("/login")
    }
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>
  }

  if (!branch) return (
    <div className="flex h-screen items-center justify-center flex-col gap-4">
      <div className="text-xl font-bold">جاري تحميل بيانات الفرع...</div>
      <div className="text-muted-foreground text-sm">المعرف: {branchId}</div>
      <div className="flex gap-2">
        <Button onClick={handleForceRefresh} variant="default">
          اضغط هنا إذا تأخر التحميل
        </Button>
        <Button onClick={handleLogout} variant="destructive">
          <LogOut className="w-4 h-4 ml-2" /> تسجيل خروج
        </Button>
      </div>
    </div>
  )

  if (!authorized) {
    return null
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Branch Dashboard / لوحة فرع: {branch.name}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(getDualString('sync.hardResetConfirm'))) {
                hardReset()
              }
            }}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            <DualText k="sync.hardReset" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleForceRefresh} title="Sync / مزامنة">
            <Loader2 className="w-4 h-4 ml-2" /> Sync / مزامنة
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-destructive">
            <LogOut className="w-4 h-4 ml-2" /> Logout / تسجيل خروج
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Branch Info / معلومات الفرع</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>ID / المعرف: {branch.id}</div>
            <div>Name / الاسم: {branch.name}</div>
            {branch.address && <div>Address / العنوان: {branch.address}</div>}
            {branch.phone && <div>Phone / الهاتف: {branch.phone}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Statistics / إحصائيات</CardTitle></CardHeader>
          <CardContent className="text-sm grid grid-cols-2 gap-3">
            <div>Requests / طلبات: {requests.length}</div>
            <div>Issues / صرفيات: {issues.length}</div>
            <div>Invoices / فواتير: {invoices.length}</div>
            <div>Available Products / منتجات متاحة: {productsCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Custom Lists / قوائم مخصصة</CardTitle></CardHeader>
          <CardContent className="text-sm">Custom lists and settings can be configured here. / يمكن تخصيص قوائم وإعدادات خاصة لكل فرع هنا.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Operations / العمليات</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invoice">Order System / نظام الطلبات</TabsTrigger>
              <TabsTrigger value="request">Return System / نظام المرتجعات</TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-1">
                  <Label>Unified Search / بحث موحد</Label>
                  <div className="relative">
                    <Input
                      placeholder="Search or Scan / ابحث أو امسح الباركود"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && query.trim()) {
                          const q = normalize(query)
                          // Smart Scan: Check for exact match
                          const all = await db.products.toArray()
                          const match = all.find(p =>
                            normalize(p.productCode) === q ||
                            normalize(p.itemNumber || "") === q ||
                            (p.cartonBarcode && normalize(p.cartonBarcode) === q)
                          )

                          if (match) {
                            e.preventDefault()
                            const isCarton = match.cartonBarcode && normalize(match.cartonBarcode) === q
                            addToCart(match, isCarton ? 'carton' : 'base')
                            setQuery("")
                            toast({
                              title: "Added to Cart / تمت الإضافة",
                              description: `${match.productName} [${isCarton ? (match.cartonUnit || 'Carton') : (match.unit || 'Piece')}]`,
                              duration: 2000
                            })
                          }
                        }
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label>Category / تصنيف</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All / الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All / الكل</SelectItem>
                      {categories.filter(c => c && c.trim() !== "").map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Location / الموقع</Label>
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All / الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All / الكل</SelectItem>
                      {locations.filter(l => l && l.trim() !== "").map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button variant="default" className="px-4" onClick={() => document.getElementById("branch-cart")?.scrollIntoView({ behavior: "smooth" })}>
                    <ShoppingCart className="w-4 h-4 ml-2" /> Cart / السلة <span className="ml-2 rounded bg-blue-600 text-white px-2">{cart.length}</span>
                  </Button>
                </div>
              </div>

              <div className="overflow-auto border rounded max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image / الصورة</TableHead>
                      <TableHead>Code / الكود</TableHead>
                      <TableHead>Name / الاسم</TableHead>
                      <TableHead>Stock / المخزون</TableHead>
                      {settings.showUnit && <TableHead>Unit / الوحدة</TableHead>}
                      <TableHead>Add / إضافة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayProducts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="cursor-pointer hover:opacity-80" onClick={() => setZoomedProduct(p)}>
                            <ProductImage product={p} className="w-10 h-10 object-cover" />
                          </div>
                        </TableCell>
                        <TableCell>{p.productCode}</TableCell>
                        <TableCell>{p.productName}</TableCell>
                        <TableCell>
                          {p.currentStock > 0 ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                              Available / متوفر
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
                              Out of Stock / نفذت الكمية
                            </Badge>
                          )}
                        </TableCell>
                        {settings.showUnit && <TableCell>{p.unit}</TableCell>}
                        <TableCell>
                          <Button size="sm" onClick={() => addToCart(p)}>Add / أضف</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div id="branch-cart" className="border p-4 rounded bg-slate-50">
                <h2 className="text-base font-semibold mb-2">{activeTab === 'request' ? (requestType === 'return' ? 'Return Cart / سلة المرتجع' : 'Order Cart / سلة الطلب') : 'Order Cart / سلة الطلب'}</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name / الاسم</TableHead>
                      <TableHead>Code / الكود</TableHead>
                      <TableHead>Image / الصورة</TableHead>
                      {settings.showUnit && <TableHead>Unit / الوحدة</TableHead>}
                      <TableHead>Quantity / الكمية</TableHead>
                      {activeTab === 'request' && requestType === 'return' && <TableHead>Return Reason / سبب الارجاع</TableHead>}
                      <TableHead>Stock / المخزون</TableHead>
                      <TableHead>Notes / ملاحظات</TableHead>
                      <TableHead>Delete / حذف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((it, idx) => (
                      <TableRow key={it.productId + String(idx)}>
                        <TableCell>{it.productName}</TableCell>
                        <TableCell>{it.productCode || "-"}</TableCell>
                        <TableCell>
                          <div className="cursor-pointer hover:opacity-80" onClick={() => setZoomedProduct({ id: it.productId, image: it.image } as Product)}>
                            <ProductImage product={{ id: it.productId, image: it.image }} className="w-10 h-10 object-cover" />
                          </div>
                        </TableCell>
                        {settings.showUnit && <TableCell>
                          {it.selectedUnitName || it.unit || "-"}
                        </TableCell>}
                        <TableCell>
                          <Input type="number" value={it.quantity} onChange={(e) => updateQty(idx, Number(e.target.value))} className="w-24" />
                        </TableCell>
                        {activeTab === 'request' && requestType === 'return' && (
                          <TableCell>
                            <Input
                              placeholder="Reason... / السبب..."
                              value={it.returnReason || ""}
                              onChange={(e) => updateReturnReason(idx, e.target.value)}
                              className="w-40"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          {(() => {
                            const p = cartProducts.find(cp => cp.id === it.productId)
                            const stock = p ? p.currentStock : 0
                            return stock > 0 ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                                Available / متوفر
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
                                Out of Stock / نفذت الكمية
                              </Badge>
                            )
                          })()}
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Notes... / ملاحظات..."
                            value={it.notes || ""}
                            onChange={(e) => updateItemNotes(idx, e.target.value)}
                            className="w-40"
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="destructive" size="sm" onClick={() => removeItem(idx)}>Delete / حذف</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-4 pt-4 border-t">
                  <TabsContent value="invoice">
                    <div className="flex justify-between items-center">
                      <Button onClick={submitInvoice} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        Create Invoice / إنشاء فاتورة
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="request">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Request Type / نوع الطلب</Label>
                          <Select value={requestType} onValueChange={(v: any) => setRequestType(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="return">Return Request (to Warehouse) / طلب مرتجع (إلى المستودع)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Notes / ملاحظات</Label>
                          <Textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} placeholder="Additional Notes... / ملاحظات إضافية..." />
                        </div>
                      </div>
                      <Button onClick={submitRequest} className="w-full" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        Submit Request / إرسال الطلب
                      </Button>
                    </div>
                  </TabsContent>
                </div>
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Tracking & Logs / المتابعة والسجلات</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleFactoryResetBranchRequests} className="text-red-500 hover:text-red-700 hover:bg-red-50">
            <LogOut className="w-4 h-4 ml-2" /> Clear History / حذف السجل
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="requests">
            <TabsList>
              <TabsTrigger value="requests">My Requests / طلباتي</TabsTrigger>
              <TabsTrigger value="incoming">Shipments History / سجل الشحنات</TabsTrigger>
              <TabsTrigger value="invoices">Invoices Log / سجل الفواتير</TabsTrigger>
            </TabsList>
            <TabsContent value="requests" className="space-y-4 pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request No / رقم الطلب</TableHead>
                    <TableHead>Type / النوع</TableHead>
                    <TableHead>Status / الحالة</TableHead>
                    <TableHead>Date / التاريخ</TableHead>
                    <TableHead>Notes / ملاحظات</TableHead>
                    <TableHead>Print / طباعة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRequests.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center">No Requests / لا توجد طلبات</TableCell></TableRow> :
                    displayRequests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.requestNumber || r.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant={r.type === 'return' ? 'destructive' : 'default'}>
                            {r.type === 'return' ? 'Return / مرتجع' : 'Supply / توريد'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'approved' || r.status === 'shipped' || r.status === 'received' ? 'default' : r.status === 'cancelled' ? 'destructive' : 'secondary'}
                            className={
                              r.status === 'shipped' ? "bg-blue-100 text-blue-800 hover:bg-blue-100" :
                                r.status === 'received' ? "bg-green-100 text-green-800 hover:bg-green-100" : ""
                            }
                          >
                            {r.status === 'submitted' ? 'Pending / قيد المراجعة' :
                              r.status === 'approved' ? 'Approved / مقبول' :
                                r.status === 'shipped' ? 'Shipped / تم الشحن' :
                                  r.status === 'received' ? 'Received / تم الاستلام' :
                                    r.status === 'cancelled' ? 'Rejected / مرفوض' : r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(r.createdAt).toLocaleDateString('ar-SA')}</TableCell>
                        <TableCell>{r.notes}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => generateBranchRequestPDF(r)}>
                            <Printer className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  }
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="incoming" className="space-y-4 pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue No / رقم الصرف</TableHead>
                    <TableHead>Status / الحالة</TableHead>
                    <TableHead>Dates / التواريخ</TableHead>
                    <TableHead>Action / الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Filter: Delivered (Incoming) OR Received (History)
                    const shipments = displayIssues.filter(i => i.delivered || i.branchReceived);

                    // Sort: Newest First (Descending) based on Received Date (if exists) OR Delivered Date
                    const sortedShipments = shipments.sort((a, b) => {
                      const dateA = a.branchReceivedAt ? new Date(a.branchReceivedAt).getTime() : (a.deliveredAt ? new Date(a.deliveredAt).getTime() : new Date(a.createdAt).getTime());
                      const dateB = b.branchReceivedAt ? new Date(b.branchReceivedAt).getTime() : (b.deliveredAt ? new Date(b.deliveredAt).getTime() : new Date(b.createdAt).getTime());
                      return dateB - dateA;
                    });

                    if (sortedShipments.length === 0) {
                      return <TableRow><TableCell colSpan={4} className="text-center">No Shipments / لا توجد شحنات</TableCell></TableRow>
                    }

                    return sortedShipments.map(i => {
                      const isModified = i.updatedAt && (new Date(i.updatedAt).getTime() > new Date(i.createdAt).getTime() + 60000);
                      return (
                        <TableRow key={i.id} className={isModified ? "bg-blue-50" : ""}>
                          <TableCell>{i.id.slice(0, 8)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              {i.branchReceived ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Received / تم الاستلام</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">In Transit / في الطريق</Badge>
                              )}

                              {isModified && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-1 cursor-pointer">
                                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[10px] px-1 py-0 h-5">
                                          <AlertTriangle className="w-3 h-3 mr-1" />
                                          Modified / معدل
                                        </Badge>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs">
                                        <p>Last modified: {new Date(i.updatedAt || "").toLocaleString('ar-SA')}</p>
                                        {i.lastModifiedBy && <p>By: {i.lastModifiedBy}</p>}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col text-xs gap-1">
                              {/* Received Date (Top) */}
                              {i.branchReceivedAt && (
                                <div className="flex items-center gap-1 text-green-700">
                                  <span className="font-semibold">Received:</span>
                                  <span>{new Date(i.branchReceivedAt).toLocaleDateString('ar-SA')}</span>
                                </div>
                              )}
                              {/* Delivered Date (Bottom) */}
                              {i.deliveredAt && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span className="font-semibold">Delivered:</span>
                                  <span>{new Date(i.deliveredAt).toLocaleDateString('ar-SA')}</span>
                                </div>
                              )}
                              {!i.branchReceivedAt && !i.deliveredAt && (
                                <span>{new Date(i.createdAt).toLocaleDateString('ar-SA')}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => generateIssuePDF(i)} title="View Invoice / عرض الفاتورة">
                                <FileText className="w-4 h-4 ml-2" />
                                View Invoice / عرض الفاتورة
                              </Button>
                              {(() => {
                                const linkedReq = requests.find(r => r.id === i.requestId)
                                if (linkedReq) {
                                  return (
                                    <Button size="sm" variant="ghost" onClick={() => generateBranchRequestPDF(linkedReq)} title="View Request / عرض الطلب">
                                      <ClipboardList className="w-4 h-4 ml-2" />
                                      Request / الطلب
                                    </Button>
                                  )
                                }
                                return null
                              })()}
                              {/* Only show Confirm Receipt if Not Received */}
                              {!i.branchReceived && (
                                <Button size="sm" onClick={() => confirmIssue(i.id)}>
                                  <CheckCircle className="w-4 h-4 ml-2" />
                                  Confirm Receipt / تأكيد الاستلام
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="invoices" className="pt-4">
              <div className="text-muted-foreground">Issued Invoices Count: / عدد الفواتير المصدرة: {invoices.length}</div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* المستودعات / Warehouses */}
      <Card>
        <CardHeader><CardTitle>Warehouses / المستودعات</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={warehouseTab} onValueChange={setWarehouseTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="inventory" className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Branch Inventory / مخزون الفرع
              </TabsTrigger>
              <TabsTrigger value="assets" className="flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                Assets Warehouse / مستودع الأصول
              </TabsTrigger>
            </TabsList>

            {/* مخزون الفرع - Branch Inventory */}
            <TabsContent value="inventory" className="pt-4 space-y-4">
              {warehouseSubPage === "stock" ? (
                <BranchInventoryStock branchId={branchId} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "consume" ? (
                <BranchConsumption branchId={branchId} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "reports" ? (
                <BranchConsumptionReports branchId={branchId} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "count" ? (
                <BranchInventoryCount branchId={branchId} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "invoices" ? (
                <BranchInventoryInvoices branchId={branchId} branchName={branch?.name} onBack={() => setWarehouseSubPage(null)} />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("stock")}>
                      <Package className="w-6 h-6" />
                      <span className="text-xs text-center">Stock Balance<br />الرصيد</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("consume")}>
                      <TrendingDown className="w-6 h-6" />
                      <span className="text-xs text-center">Consumption<br />الاستهلاك</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("reports")}>
                      <FileText className="w-6 h-6" />
                      <span className="text-xs text-center">Reports<br />التقارير</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("count")}>
                      <ClipboardList className="w-6 h-6" />
                      <span className="text-xs text-center">Inventory Count<br />الجرد</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("invoices")}>
                      <Printer className="w-6 h-6" />
                      <span className="text-xs text-center">Invoices<br />الفواتير</span>
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* مستودع الأصول - Assets Warehouse */}
            <TabsContent value="assets" className="pt-4 space-y-4">
              {warehouseSubPage === "assets" ? (
                <BranchAssetsRegistry branchId={branchId} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "status" ? (
                <BranchAssetStatusReport branchId={branchId} branchName={branch?.name} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "request" ? (
                <BranchAssetRequest branchId={branchId} branchName={branch?.name} onBack={() => setWarehouseSubPage(null)} />
              ) : warehouseSubPage === "maintenance" ? (
                <BranchMaintenanceReports branchId={branchId} onBack={() => setWarehouseSubPage(null)} />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("assets")}>
                      <Wrench className="w-6 h-6" />
                      <span className="text-xs text-center">Assets Registry<br />سجل الأصول</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("status")}>
                      <FileText className="w-6 h-6" />
                      <span className="text-xs text-center">Status Report<br />تقرير الحالة</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("request")}>
                      <Package className="w-6 h-6" />
                      <span className="text-xs text-center">New Request<br />طلب أصل جديد</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => setWarehouseSubPage("maintenance")}>
                      <ClipboardList className="w-6 h-6" />
                      <span className="text-xs text-center">Maintenance<br />تقارير الصيانة</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-24 items-center justify-center gap-2" onClick={() => toast({ title: "قريباً", description: "ميزة الفواتير قيد التطوير" })}>
                      <Printer className="w-6 h-6" />
                      <span className="text-xs text-center">Invoices<br />الفواتير</span>
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!zoomedProduct} onOpenChange={(open) => !open && setZoomedProduct(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none flex justify-center items-center">
          <DialogTitle className="sr-only">Product Zoom</DialogTitle>
          {zoomedProduct && (
            <div className="relative">
              <ProductImage
                product={zoomedProduct}
                className="max-w-full max-h-[85vh] shadow-2xl bg-white object-contain"
              />
              <Button
                variant="ghost"
                className="absolute top-2 right-2 rounded-full bg-white/50 hover:bg-white text-black h-8 w-8 p-0"
                onClick={() => setZoomedProduct(null)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div >
  )
}
