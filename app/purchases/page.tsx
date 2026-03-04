"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Calendar, Package, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ProductImage } from "@/components/product-image"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Header } from "@/components/header"
import { getProducts, getTransactions, addTransaction, updateProduct, clearAllPurchases, saveTransactions, restoreTransactions } from "@/lib/storage"
import type { Product, Transaction } from "@/lib/types"
import { PurchaseRequestsSection } from "@/components/purchase-requests"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { downloadJSON, formatArabicGregorianDateTime } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Download, Undo2, ShoppingCart, Trash2, Loader2 } from "lucide-react"
import { useRef } from "react"
import { useAuth } from "@/components/auth-provider"
import { useProducts, useTransactions, saveDocument } from "@/hooks/use-firestore"
import { useProductsRealtime, usePurchasesRealtime } from "@/hooks/use-store"
import { WarehouseAdvisor } from "@/components/analytics/warehouse-advisor"

export default function PurchasesPage() {
  const { t } = useI18n()
  const settings = useInvoiceSettings()
  const { toast } = useToast()
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if ((user as any)?.role === 'branch') {
      router.replace('/branch-requests')
    }
  }, [user, router])

  // Cloud Hooks
  const { data: cloudProducts } = useProducts()
  const { data: cloudTransactions } = useTransactions()

  // Local Hooks (Realtime & Progressive)
  const { data: realtimeProducts } = useProductsRealtime()
  const { data: realtimePurchases } = usePurchasesRealtime()

  // Derived State
  const products = user ? cloudProducts : realtimeProducts
  const purchases = user
    ? cloudTransactions.filter(t => t.type === 'purchase')
    : realtimePurchases

  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogSearch, setDialogSearch] = useState("")
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedStocks, setSelectedStocks] = useState<string[]>([])
  const [cartItems, setCartItems] = useState<{
    productId: string
    productCode: string
    productName: string
    unit?: string
    image?: string
    currentStock: number
    quantity: number | string
    unitPrice: number | string
    notes: string
  }[]>([])
  const [generalNotes, setGeneralNotes] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const uniqueLocations = useMemo(() => {
    const locs = products.map((p) => p.location).filter(Boolean) as string[]
    return Array.from(new Set(locs)).sort()
  }, [products])

  const toggleLocation = (loc: string) => {
    setSelectedLocations((prev) => (prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]))
  }

  const toggleStock = (stockType: string) => {
    setSelectedStocks((prev) => (prev.includes(stockType) ? prev.filter((s) => s !== stockType) : [...prev, stockType]))
  }

  const addItemDirectly = (p: Product) => {
    setCartItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === p.id)
      if (existing !== -1) {
        const next = [...prev]
        next[existing].quantity = Number(next[existing].quantity) + 1
        return next
      }
      return [
        ...prev,
        {
          productId: p.id,
          productCode: p.productCode,
          productName: p.productName,
          unit: p.unit,
          image: p.image,
          currentStock: p.currentStock || 0,
          quantity: 1,
          unitPrice: p.price || 0,
          notes: "",
        },
      ]
    })
    toast({ title: "تم الإضافة / Added", description: `${p.productName} تمت إضافته للقائمة` })
  }

  const removeItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.productId !== id))
  }

  // تحديد المنتجات ذات المخزون المنخفض وفق حد النظام (minStockLimit أو 10 افتراضيًا)
  const lowStockIds = useMemo(() => {
    return new Set(
      products
        .filter((p) => p.currentStock < (p.minStockLimit ?? 10))
        .map((p) => p.id)
    )
  }, [products])

  const handleBackupPurchases = () => {
    downloadJSON(purchases, `purchases-backup-${new Date().toISOString().split('T')[0]}`)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRestorePurchases = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        if (Array.isArray(json)) {
          const allTransactions = getTransactions()
          const nonPurchases = allTransactions.filter(t => t.type !== 'purchase')
          const newPurchases = json as Transaction[]
          const combined = [...nonPurchases, ...newPurchases]
          await restoreTransactions(combined)
          toast({ title: t("common.success"), description: "تم استعادة بيانات المشتريات بنجاح" })
        } else {
          toast({ title: "خطأ", description: "ملف غير صالح", variant: "destructive" })
        }
      } catch (err) {
        toast({ title: "خطأ", description: "فشل قراءة الملف", variant: "destructive" })
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleFactoryResetPurchases = async () => {
    if (confirm(t("common.confirmReset", "هل أنت متأكد من حذف جميع بيانات المشتريات؟ لا يمكن التراجع عن هذا الإجراء."))) {
      await clearAllPurchases()
      toast({ title: t("common.success"), description: "تم حذف البيانات بنجاح" })
    }
  }

  const filteredPurchases = useMemo(() => {
    if (!searchTerm) return purchases
    const q = searchTerm.toLowerCase()
    return (purchases as Transaction[]).filter((tr: Transaction) => {
      const prod = products.find((prod) => prod.id === tr.productId)
      return (
        tr.productName.toLowerCase().includes(q) ||
        (prod?.productCode || "").toLowerCase().includes(q) ||
        (prod?.itemNumber || "").toLowerCase().includes(q) ||
        tr.id.includes(searchTerm)
      )
    })
  }, [searchTerm, purchases, products])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cartItems.length === 0) {
      toast({ title: "القائمة فارغة", description: "الرجاء إضافة منتجات أولاً", variant: "destructive" })
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const transactionGroupId = Date.now().toString()
      for (const item of cartItems) {
        const product = products.find((p) => p.id === item.productId)
        if (!product) continue

        const qty = Number(item.quantity) || 0
        const price = Number(item.unitPrice) || 0

        const finalNotes = generalNotes ? `${item.notes} | عام: ${generalNotes}` : item.notes
        const newAveragePrice = (product.averagePrice * product.currentStock + price * qty) / ((product.currentStock || 0) + qty)
        const newCurrentStock = (product.currentStock || 0) + qty

        if (user) {
          // Cloud
          const transactionId = `${transactionGroupId}-${item.productId}`
          const newPurchase: Transaction = {
            id: transactionId,
            operationNumber: transactionGroupId.slice(-6),
            productId: item.productId,
            productName: product.productName,
            type: "purchase",
            quantity: qty,
            unitPrice: price,
            totalAmount: qty * price,
            notes: finalNotes,
            supplierName: supplierName || undefined,
            createdAt: new Date().toISOString()
          }
          await saveDocument("transactions", newPurchase)

          await saveDocument("products", {
            ...product,
            purchases: (product.purchases || 0) + qty,
            currentStock: newCurrentStock,
            averagePrice: newAveragePrice,
            currentStockValue: newCurrentStock * newAveragePrice,
            updatedAt: new Date().toISOString()
          })
        } else {
          // Local
          await addTransaction({
            productId: item.productId,
            productName: product.productName,
            type: "purchase",
            quantity: qty,
            unitPrice: price,
            totalAmount: qty * price,
            notes: finalNotes,
            supplierName: supplierName || undefined,
          })
        }
      }

      setCartItems([])
      setGeneralNotes("")
      setIsDialogOpen(false)
      toast({ title: "نجاح", description: "تم تسجيل عملية الشراء بنجاح" })
    } catch (error) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء تسجيل العمليات", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalPurchases = (filteredPurchases as Transaction[]).reduce((sum, p) => sum + p.totalAmount, 0)
  const totalQuantity = (filteredPurchases as Transaction[]).reduce((sum, p) => sum + p.quantity, 0)

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold"><DualText k="purchases.title" /></h1>
              <p className="text-muted-foreground"><DualText k="purchases.subtitle" /></p>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleRestorePurchases} />
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title={t("common.restore", "استعادة")}>
                <Undo2 className="h-4 w-4 rotate-180" style={{ transform: 'scaleX(-1)' }} />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleBackupPurchases} title={t("common.backup", "نسخ احتياطي")}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleFactoryResetPurchases} title={t("common.reset", "استعادة ضبط المصنع")} className="text-red-500 hover:text-red-700 hover:bg-red-50 mr-2">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setCartItems([]); setGeneralNotes(""); setSupplierName(""); setIsDialogOpen(true); }}>
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة عملية شراء / Add Purchase
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] h-[95vh] flex flex-col overflow-hidden bg-gray-50/50 p-0">
                  <DialogHeader className="shrink-0 bg-white p-4 pb-4 border-b">
                    <DialogTitle className="text-xl">إضافة عملية شراء جديدة / Add New Purchase</DialogTitle>
                    <DialogDescription>Add products to your purchase operation / اختر المنتجات التي تود إضافتها لعملية الشراء</DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6">
                    {/* القسم الأيمن للمنتجات */}
                    <div className="lg:col-span-5 flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-3 border-b bg-gray-50 flex flex-col gap-2 shrink-0">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            value={dialogSearch}
                            onChange={(e) => setDialogSearch(e.target.value)}
                            placeholder="البحث عن منتج... / Search products..."
                            className="pl-9 h-10 rounded-xl bg-white border-gray-200"
                          />
                        </div>
                        {/* الفلاتر السريعة */}
                        <div className="flex flex-col gap-2">
                          {uniqueLocations.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-[10px] text-gray-500 font-bold self-center mr-1">Locations:</span>
                              {uniqueLocations.map(loc => (
                                <Badge
                                  key={loc}
                                  variant="outline"
                                  className={cn(
                                    "cursor-pointer text-[10px] transition-colors rounded-lg",
                                    selectedLocations.includes(loc) ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white" : "bg-white text-gray-600 hover:bg-gray-100"
                                  )}
                                  onClick={() => toggleLocation(loc)}
                                >
                                  {loc}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] text-gray-500 font-bold self-center mr-1">Stock:</span>
                            <Badge
                              variant="outline"
                              className={cn("cursor-pointer text-[10px] rounded-lg transition-colors", selectedStocks.includes("in_stock") ? "bg-green-600 text-white border-green-600 hover:bg-green-700 hover:text-white" : "bg-white text-gray-600 hover:bg-gray-100")}
                              onClick={() => toggleStock("in_stock")}
                            >
                              Available / متوفر
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn("cursor-pointer text-[10px] rounded-lg transition-colors", selectedStocks.includes("low_stock") ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" : "bg-white text-gray-600 hover:bg-gray-100")}
                              onClick={() => toggleStock("low_stock")}
                            >
                              Low / منخفض
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn("cursor-pointer text-[10px] rounded-lg transition-colors", selectedStocks.includes("out_of_stock") ? "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:text-white" : "bg-white text-gray-600 hover:bg-gray-100")}
                              onClick={() => toggleStock("out_of_stock")}
                            >
                              Out / نافذ
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {products
                          .filter(p => {
                            const matchesSearch = p.productName.toLowerCase().includes(dialogSearch.toLowerCase()) || p.productCode.toLowerCase().includes(dialogSearch.toLowerCase())
                            const matchesLoc = selectedLocations.length === 0 || (p.location && selectedLocations.includes(p.location))
                            const stock = Number(p.currentStock ?? 0)
                            const isOutOfStock = stock <= 0
                            const limit = ((p.openingStock || 0) + (p.purchases || 0)) * ((p.lowStockThresholdPercentage || 33.33) / 100)
                            const isLowStock = stock > 0 && stock <= limit
                            const isInStock = stock > limit

                            let matchesStock = selectedStocks.length === 0
                            if (!matchesStock) {
                              if (selectedStocks.includes("out_of_stock") && isOutOfStock) matchesStock = true
                              if (selectedStocks.includes("low_stock") && isLowStock) matchesStock = true
                              if (selectedStocks.includes("in_stock") && isInStock) matchesStock = true
                            }
                            return matchesSearch && matchesLoc && matchesStock
                          })
                          .map(p => {
                            const inStock = p.currentStock > 0
                            return (
                              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors bg-white">
                                <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-100 border">
                                  <ProductImage product={p} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-blue-600 truncate">{p.productCode}</p>
                                  <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight">{p.productName}</p>
                                  <p className="text-[10px] text-gray-500 mt-1">
                                    Avail / المتوفر: <span className={inStock ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{p.currentStock || 0}</span> {settings.showUnit ? ` - ${p.unit}` : ''}
                                  </p>
                                </div>
                                <Button size="sm" onClick={() => addItemDirectly(p)} className="shrink-0 h-8 rounded-lg font-bold text-white border-0" style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>
                                  <Plus className="h-4 w-4" /> Add / إضافـة
                                </Button>
                              </div>
                            )
                          })}
                      </div>
                    </div>

                    {/* القسم الأيسر للسلة */}
                    <div className="lg:col-span-7 flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                        <h3 className="font-bold text-sm">قائمة المشتريات / Purchase Cart</h3>
                        <Badge variant="secondary" className="px-2">{cartItems.length}</Badge>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3">
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <Table className="table-fixed text-xs">
                            <TableHeader className="bg-gray-50">
                              <TableRow>
                                <TableHead className="w-[180px] text-center border-x">Product / المنتج</TableHead>
                                <TableHead className="w-[70px] text-center border-x">Unit / الوحدة</TableHead>
                                <TableHead className="w-[90px] text-center border-x">Avail / المتوفر</TableHead>
                                <TableHead className="w-[90px] text-center border-x">Qty / الكمية المشتراة</TableHead>
                                <TableHead className="w-[90px] text-center border-x">Price / سعر الوحدة</TableHead>
                                <TableHead className="w-[180px] text-center border-x">Notes / ملاحظات</TableHead>
                                <TableHead className="w-[60px] text-center"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cartItems.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center py-10 text-gray-400">
                                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                    Empty list, select products from the right / لم يتم تحديد منتجات، اختر من القائمة
                                  </TableCell>
                                </TableRow>
                              ) : (
                                cartItems.map((it) => (
                                  <TableRow key={it.productId}>
                                    <TableCell className="border-x">
                                      <p className="text-[10px] font-bold text-blue-600 truncate">{it.productCode}</p>
                                      <p className="font-medium text-gray-800 line-clamp-2 leading-tight">{it.productName}</p>
                                    </TableCell>
                                    <TableCell className="text-center text-[11px] font-semibold text-gray-500 border-x">
                                      {it.unit || '-'}
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-gray-600 border-x">
                                      {it.currentStock}
                                    </TableCell>
                                    <TableCell className="border-x p-2">
                                      <Input type="text" value={it.quantity || ''} min={1}
                                        className="text-center h-8 text-xs font-bold bg-blue-50/50"
                                        onChange={(e) => {
                                          const v = e.target.value
                                          setCartItems((prev) => prev.map((p) => p.productId === it.productId ? { ...p, quantity: v } : p))
                                        }} />
                                    </TableCell>
                                    <TableCell className="border-x p-2">
                                      <Input type="text" value={it.unitPrice} min={0} step="0.01"
                                        className="text-center h-8 text-xs font-bold bg-green-50/50"
                                        onChange={(e) => {
                                          const v = e.target.value
                                          setCartItems((prev) => prev.map((p) => p.productId === it.productId ? { ...p, unitPrice: v } : p))
                                        }} />
                                    </TableCell>
                                    <TableCell className="border-x p-2">
                                      <Input value={it.notes || ''} placeholder="Notes..."
                                        className="h-8 text-xs shadow-sm bg-gray-50"
                                        onChange={(e) => {
                                          const v = e.target.value
                                          setCartItems((prev) => prev.map((p) => p.productId === it.productId ? { ...p, notes: v } : p))
                                        }} />
                                    </TableCell>
                                    <TableCell className="text-center p-2">
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => removeItem(it.productId)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 border-t shrink-0 flex flex-col gap-3">
                        {cartItems.length > 0 && (
                          <div className="flex justify-between items-center text-sm font-bold bg-white p-3 rounded-xl shadow-sm border">
                            <span>الإجمالي الكلي / Grand Total:</span>
                            <span className="text-xl text-green-700">{cartItems.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unitPrice || 0)), 0).toFixed(2)} SAR</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <Label className="shrink-0 text-xs font-bold text-gray-500 w-32">المورد / Supplier</Label>
                            <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="اسم المورد (اختياري)..." className="h-9 text-xs bg-white" />
                          </div>
                          <div className="flex items-center gap-3">
                            <Label className="shrink-0 text-xs font-bold text-gray-500 w-32">ملاحظات عامة / General Notes</Label>
                            <Input value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="ملاحظات إضافية على كامل العملية..." className="h-9 text-xs bg-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="bg-white p-4 shrink-0 border-t flex items-center justify-between sm:justify-start gap-2">
                    <Button onClick={handleSubmit} disabled={cartItems.length === 0 || isSubmitting} className="w-full sm:w-auto font-bold gap-2 text-white h-10 px-6 rounded-xl" style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      حفظ العمليات / Save Purchases
                    </Button>
                    <Button variant="secondary" onClick={() => setIsDialogOpen(false)} className="h-10 px-6 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 border-none">
                      إلغاء
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <WarehouseAdvisor />

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="purchases.metrics.totalPurchases" /></CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPurchases.toFixed(2)} <DualText k="common.currency" /></div>
                <p className="text-xs text-muted-foreground">{filteredPurchases.length} <DualText k="purchases.metrics.totalPurchases" /></p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="purchases.metrics.totalQuantity" /></CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalQuantity}</div>
                <p className="text-xs text-muted-foreground"><DualText k="purchases.metrics.unitsPurchased" /></p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium"><DualText k="purchases.metrics.avgPurchaseValue" /></CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {filteredPurchases.length > 0 ? (totalPurchases / filteredPurchases.length).toFixed(2) : "0.00"} <DualText k="common.currency" />
                </div>
                <p className="text-xs text-muted-foreground"><DualText k="purchases.metrics.perOperation" /></p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle><DualText k="purchases.history" /></CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("common.search.products")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto overflow-y-auto max-h-[600px] relative rounded-md border">
                <Table className="table-fixed w-full">
                  <TableHeader className="sticky top-0 bg-white dark:bg-slate-950 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[100px] border-x text-center"><DualText k="purchases.table.operation" /></TableHead>
                      <TableHead className="w-[120px] border-x text-center"><DualText k="common.code" /></TableHead>
                      <TableHead className="w-[200px] border-x text-center"><DualText k="purchases.table.product" /></TableHead>
                      {settings.showUnit && <TableHead className="w-[100px] border-x text-center"><DualText k="common.unit" /></TableHead>}
                      {settings.showQuantity && <TableHead className="w-[100px] border-x text-center"><DualText k="purchases.table.quantity" /></TableHead>}
                      {settings.showPrice && <TableHead className="w-[120px] border-x text-center"><DualText k="purchases.table.unitPrice" /></TableHead>}
                      <TableHead className="w-[120px] border-x text-center"><DualText k="purchases.table.total" /></TableHead>
                      <TableHead className="w-[150px] border-x text-center">المورد / Supplier</TableHead>
                      <TableHead className="w-[160px] border-x text-center"><DualText k="purchases.table.date" /></TableHead>
                      <TableHead className="w-[150px] border-x text-center"><DualText k="purchases.table.notes" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          <DualText k="purchases.empty" />
                        </TableCell>
                      </TableRow>
                    ) : (
                      (filteredPurchases as Transaction[]).map((purchase: Transaction) => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-medium border-x text-center">#{purchase.operationNumber || purchase.id.slice(-6)}</TableCell>
                          <TableCell className="border-x text-center">{products.find(p => p.id === purchase.productId)?.productCode || "-"}</TableCell>
                          <TableCell
                            className={`border-x text-center ${lowStockIds.has(purchase.productId) ? "text-[#FF0000] font-semibold" : ""}`}
                            aria-label={lowStockIds.has(purchase.productId) ? t("common.lowStockProduct") : undefined}
                            title={lowStockIds.has(purchase.productId) ? t("common.lowStock") : undefined}
                          >
                            {purchase.productName}
                          </TableCell>
                          {settings.showUnit && <TableCell className="border-x text-center">{products.find(p => p.id === purchase.productId)?.unit || '-'}</TableCell>}
                          {settings.showQuantity && <TableCell className="border-x text-center">{purchase.quantity}</TableCell>}
                          {settings.showPrice && <TableCell className="border-x text-center">{purchase.unitPrice.toFixed(2)} <DualText k="common.currency" /></TableCell>}
                          <TableCell className="font-semibold border-x text-center">{purchase.totalAmount.toFixed(2)} <DualText k="common.currency" /></TableCell>
                          <TableCell className="border-x text-center font-medium text-blue-700">{purchase.supplierName || "-"}</TableCell>
                          <TableCell className="border-x text-center">{formatArabicGregorianDateTime(new Date(purchase.createdAt))}</TableCell>
                          <TableCell className="text-muted-foreground border-x text-center">{purchase.notes || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <PurchaseRequestsSection />
        </div>
      </main>
    </div>
  )
}
