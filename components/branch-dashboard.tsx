
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { getBranches, getProducts, getIssues, addIssue, setIssueDelivered, clearAllBranchRequests, saveBranches, getBranchRequests, getBranchInvoices } from "@/lib/storage"
import { addBranchRequest, updateBranchRequest } from "@/lib/branch-request-storage"
import type { Product } from "@/lib/types"
import type { BranchInvoiceItem } from "@/lib/branch-invoice-types"
import { addBranchInvoice } from "@/lib/branch-invoice-storage"
import { generateBranchInvoicePDF } from "@/lib/branch-invoice-pdf-generator"
import { generateBranchRequestPDF } from "@/lib/branch-request-pdf-generator"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { normalize, getSafeImageSrc } from "@/lib/utils"
import { useProductsRealtime, useBranchesRealtime, useBranchRequestsRealtime, useBranchInvoicesRealtime, useIssuesRealtime, useLocationsRealtime } from "@/hooks/use-store"
import { syncIssue, syncBranchRequest, syncBranchInvoice } from "@/lib/sync-api"
import { syncAllCloudToLocal } from "@/lib/firebase-sync-engine"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShoppingCart, LogOut, Loader2, CheckCircle, Printer, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { db } from "@/lib/db"
import { useLiveQuery } from "dexie-react-hooks"
import { deleteAllBranchRequestsApi } from "@/lib/sync-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useAuth } from "@/components/auth-provider"
import { ProductImage } from "@/components/product-image"

export function BranchDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const settings = useInvoiceSettings()
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
  const locations = (locationsData || []).map(l => l.name)



  const branches = branchesData || []
  const allRequests = allRequestsData || []

  const [branchId, setBranchId] = useState<string>("")
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(0)
  const [activeTab, setActiveTab] = useState("invoice")
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
  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    return all.map(c => c.name).sort()
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
            normalize(p.itemNumber).includes(q)
          )
        })
        .filter(p => {
          if (categoryFilter !== "all" && p.category !== categoryFilter) return false
          if (locationFilter !== "all" && p.location !== locationFilter) return false
          return true
        })
        .limit(100) // Limit results to prevent UI freezing
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
      return await result.limit(100).toArray()
    }
  }, [query, categoryFilter, locationFilter]) || []

  const displayProducts = filteredProducts

  const [cart, setCart] = useState<BranchInvoiceItem[]>([])
  // const allRequests = mounted ? getBranchRequests() : []
  const invoices = (allInvoicesData || []).filter(i => i.branchId === branchId).slice(0, 5)
  const requests = (allRequests || []).filter((r) => r.branchId === branchId).slice(0, 5)
  const issues = (allIssuesData || []).filter((i) => i.branchId === branchId).slice(0, 5)

  const [requestType, setRequestType] = useState<"supply" | "return">("return")
  const [requestNotes, setRequestNotes] = useState("")
  const [cartLoaded, setCartLoaded] = useState(false)

  // Cart Sync (Persistence via Draft)
  useEffect(() => {
    if (!branchId || cartLoaded) return

    const draft = allRequests.find(r => r.branchId === branchId && r.status === 'draft')
    if (draft && draft.items.length > 0) {
      const items: BranchInvoiceItem[] = draft.items.map((it: any) => ({
        id: it.id,
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        quantity: it.requestedQuantity || it.quantity,
        unitPrice: it.unitPrice || 0,
        totalPrice: (it.unitPrice || 0) * (it.requestedQuantity || it.quantity),
        image: it.image,
        unit: it.unit,
        returnReason: it.returnReason
      }))
      setCart(items)
    }
    setCartLoaded(true)
  }, [branchId, allRequests, cartLoaded])

  useEffect(() => {
    if (!branchId || !cartLoaded) return

    const timer = setTimeout(async () => {
      const draft = allRequests.find(r => r.branchId === branchId && r.status === 'draft')

      // Map cart to request items
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
        returnReason: item.returnReason
      }))

      if (draft) {
        if (cart.length === 0) {
          // If cart empty, maybe delete draft or keep empty?
          // updateBranchRequest(draft.id, { items: [] })
          // actually if cart is empty we might want to clear draft
        }
        const updated = updateBranchRequest(draft.id, { items: items as any })
        if (updated) syncBranchRequest(updated).catch(console.error)
      } else {
        if (cart.length > 0) {
          const created = await addBranchRequest({
            branchId: branchId,
            branchName: branch?.name || "",
            items: items as any,
            type: requestType, // Save current type preference
            notes: requestNotes,
            status: "draft",
            createdBy: "branch"
          })
          syncBranchRequest(created).catch(console.error)
        }
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [cart, branchId, cartLoaded, requestType, requestNotes, allRequests, branch])

  async function confirmIssue(id: string) {
    if (!confirm("Confirm receipt? / هل أنت متأكد من استلام هذه الشحنة؟")) return

    const updated = setIssueDelivered(id, "branch")
    if (updated) {
      toast({ title: "Receipt Confirmed / تم تأكيد الاستلام", description: "Status updated successfully / تم تحديث حالة الشحنة بنجاح" })
      setLastUpdate(Date.now())
    } else {
      toast({ title: "Error / خطأ", description: "Failed to update status / فشل تحديث الحالة", variant: "destructive" })
    }
  }

  function addToCart(p: Product) {
    const exist = cart.find((x) => x.productId === p.id || x.productCode === p.productCode)
    const quantity = (exist?.quantity || 0) + 1
    const unitPrice = p.averagePrice ?? p.price ?? 0
    const item: BranchInvoiceItem = {
      id: exist?.id,
      productId: p.id,
      productCode: p.productCode,
      productName: p.productName,
      unit: p.unit,
      image: p.image || "",
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
    }
    if (exist) {
      setCart((prev) => prev.map((x) => (x.productId === p.id ? item : x)))
    } else {
      setCart((prev) => [item, ...prev])
    }
  }

  function updateQty(idx: number, qty: number) {
    setCart((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, quantity: Math.max(0, Math.floor(qty)), totalPrice: x.unitPrice * Math.max(0, Math.floor(qty)) } : x)),
    )
  }

  function updateReturnReason(idx: number, reason: string) {
    setCart((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, returnReason: reason } : x)),
    )
  }

  function removeItem(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  async function submitInvoice() {
    if (!branch) return
    if (!cart.length) {
      toast({ title: "Add Items / أضف عناصر", description: "Please add products to invoice / يرجى إضافة منتجات إلى الفاتورة" })
      return
    }
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
      }))
      const newIssue = await addIssue({
        branchId: created.branchId,
        branchName: created.branchName,
        products: issueProducts,
        totalValue: created.totalValue,
        notes: created.notes ?? "صرف نتيجة فاتورة فرع",
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
  }

  async function submitRequest() {
    if (!branch) return
    if (!cart.length) {
      toast({ title: "أضف عناصر", description: "يرجى إضافة منتجات إلى الطلب" })
      return
    }

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
      returnReason: item.returnReason
    }))

    const created = await addBranchRequest({
      branchId: branch.id,
      branchName: branch.name,
      items: items as any,
      type: requestType,
      notes: requestNotes,
      status: "submitted",
      createdBy: "branch",
      chatMessages: []
    })

    // Sync Request
    syncBranchRequest(created).catch(console.error)

    toast({ title: "تم إرسال الطلب", description: "تم إرسال طلبك بنجاح" })

    if (requestType === 'return') {
      await generateBranchRequestPDF(created)
    }

    setCart([])
    setRequestNotes("")
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
                    <Input placeholder="Search by Name, Code, or Number / ابحث بالاسم أو الكود أو الرقم" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                      {categories.map((c) => (
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
                      {locations.map((l) => (
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
                        {settings.showUnit && <TableCell>{it.unit || "-"}</TableCell>}
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
                          <Button variant="destructive" size="sm" onClick={() => removeItem(idx)}>Delete / حذف</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-4 pt-4 border-t">
                  <TabsContent value="invoice">
                    <div className="flex justify-between items-center">
                      <Button onClick={submitInvoice}>Create Invoice / إنشاء فاتورة</Button>
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
                      <Button onClick={submitRequest} className="w-full">Submit Request / إرسال الطلب</Button>
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
              <TabsTrigger value="incoming">Incoming (For Receipt) / الوارد (للاستلام)</TabsTrigger>
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
                  {requests.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center">No Requests / لا توجد طلبات</TableCell></TableRow> :
                    requests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.requestNumber || r.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant={r.type === 'return' ? 'destructive' : 'default'}>
                            {r.type === 'return' ? 'Return / مرتجع' : 'Supply / توريد'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'approved' ? 'default' : r.status === 'cancelled' ? 'destructive' : 'secondary'}>
                            {r.status === 'submitted' ? 'Pending / قيد المراجعة' : r.status === 'approved' ? 'Approved / مقبول' : r.status === 'cancelled' ? 'Rejected / مرفوض' : r.status}
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
                    <TableHead>Value / القيمة</TableHead>
                    <TableHead>Status / الحالة</TableHead>
                    <TableHead>Date / التاريخ</TableHead>
                    <TableHead>Action / الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.filter(i => !i.delivered).length === 0 ? <TableRow><TableCell colSpan={5} className="text-center">No Pending Shipments / لا توجد شحنات معلقة</TableCell></TableRow> :
                    issues.filter(i => !i.delivered).map(i => (
                      <TableRow key={i.id}>
                        <TableCell>{i.id.slice(0, 8)}</TableCell>
                        <TableCell>{i.totalValue.toFixed(2)}</TableCell>
                        <TableCell><Badge variant="outline">On the way / في الطريق</Badge></TableCell>
                        <TableCell>{new Date(i.createdAt).toLocaleDateString('ar-SA')}</TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => confirmIssue(i.id)}>
                            <CheckCircle className="w-4 h-4 ml-2" />
                            Confirm Receipt / تأكيد الاستلام
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  }
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="invoices" className="pt-4">
              <div className="text-muted-foreground">Issued Invoices Count: / عدد الفواتير المصدرة: {invoices.length}</div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!zoomedProduct} onOpenChange={(open) => !open && setZoomedProduct(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none flex justify-center items-center">
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
    </div>
  )
}
