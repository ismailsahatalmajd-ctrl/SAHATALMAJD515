"use client"

import type React from "react"
import { writeBatch, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { db as localDb } from "@/lib/db"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Calendar, Package, DollarSign, Truck, Receipt, Download, Undo2, ShoppingCart, Trash2, Loader2, Printer, Printer as PrintIcon, Trash2 as TrashIcon, PlusCircle, AlertCircle, List, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ProductImage } from "@/components/product-image"
import { cn } from "@/lib/utils"
import type { Product, Transaction } from "@/lib/types"
import { PurchaseRequestsSection } from "@/components/purchase-requests"
import { useI18n } from "@/components/language-provider"
import { DualText } from "@/components/ui/dual-text"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { downloadJSON, formatArabicGregorianDateTime } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

import { useRef } from "react"
import { useAuth } from "@/components/auth-provider"
import { useProducts, useTransactions, saveDocument } from "@/hooks/use-firestore"
import {
  deleteReceivingNote,
  generateNextItemNumber,
  updateProduct,
  deleteProduct,
  deleteTransaction,
  getProducts as getLocalProducts,
  getTransactions as getLocalTransactions,
  addTransaction,
  clearAllPurchases,
  saveTransactions,
  restoreTransactions
} from "@/lib/storage"
import { QuickProductForm } from "@/components/quick-product-form"
import { generatePurchaseTransactionPDF } from "@/lib/purchase-transaction-pdf"

import { ReceivingNoteDialog } from "@/components/receiving-note-dialog"
import { generateReceivingNotePDF } from "@/lib/receiving-note-pdf-generator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WarehouseAdvisor } from "@/components/analytics/warehouse-advisor"
import { SupplierCombobox } from "@/components/supplier-combobox"
import {
  useProductsRealtime,
  usePurchasesRealtime,
  useReceivingNotesRealtime
} from "@/hooks/use-store"
import { removeFromStoreCache } from "@/lib/data-store"
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
import { useGranularPermissions } from "@/hooks/use-granular-permissions"


export default function PurchasesPage() {
  const { t } = useI18n()
  const settings = useInvoiceSettings()
  const { toast } = useToast()
  const { user } = useAuth()
  const router = useRouter()
  const { shouldShow } = useGranularPermissions()

  useEffect(() => {
    if ((user as any)?.role === 'branch') {
      router.replace('/branch-requests')
    }
  }, [user, router])

  // Products & Purchases Hooks
  // We use the 'Realtime' hooks which are Local-First (Dexie) but synced with Cloud.
  // This ensures the UI remains extremely fast even when cloud sync is slow.
  const { data: realtimeProducts } = useProductsRealtime()
  const { data: realtimePurchases } = usePurchasesRealtime()
  const { data: receivingNotes } = useReceivingNotesRealtime()

  // Cloud Hooks (Optional, for redundancy or background)
  const { data: cloudProducts } = useProducts()
  const { data: cloudTransactions } = useTransactions()

  // Derived State - Unified to use Realtime (Local + Sync)
  const products = realtimeProducts || []
  const purchases = realtimePurchases || []

  // Search & Filter State
    const [searchTerm, setSearchTerm] = useState("")
  const [requestId, setRequestId] = useState<string>("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogSearch, setDialogSearch] = useState("")
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedStocks, setSelectedStocks] = useState<string[]>([])

  // Cart State
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
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isReceivingNoteOpen, setIsReceivingNoteOpen] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const submittingRef = useRef(false)

  // Memoized Helpers
  const uniqueLocations = useMemo(() => {
    if (!products) return []
    const locs = products.map((p) => p.location).filter(Boolean) as string[]
    return Array.from(new Set(locs)).sort()
  }, [products])

  const lowStockIds = useMemo(() => {
    if (!products) return new Set()
    return new Set(
      products
        .filter((p) => p.currentStock < (p.minStockLimit ?? 10))
        .map((p) => p.id)
    )
  }, [products])

  const filteredPurchases = useMemo(() => {
    if (!purchases) return []
    if (!searchTerm) return purchases
    const q = searchTerm.toLowerCase()
    return (purchases as Transaction[]).filter((tr: Transaction) => {
      if (!products) return tr.productName.toLowerCase().includes(q)
      const prod = products.find((prod) => prod.id === tr.productId)
      return (
        tr.productName.toLowerCase().includes(q) ||
        (prod?.productCode || "").toLowerCase().includes(q) ||
        (prod?.itemNumber || "").toLowerCase().includes(q) ||
        tr.id.includes(searchTerm)
      )
    })
  }, [searchTerm, purchases, products])

  // Calculation Helpers
  const totalPurchases = (filteredPurchases as Transaction[] || []).reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0)
  const totalQuantity = (filteredPurchases as Transaction[] || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)

  // Event Handlers
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
        return prev.map((item, idx) =>
          idx === existing ? { ...item, quantity: Number(item.quantity) + 1 } : item,
        )
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
          const allTransactions = getLocalTransactions()
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

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isSubmitting || submittingRef.current || cartItems.length === 0) return;

    setIsSubmitting(true)
    submittingRef.current = true
    const opRequestId = requestId || self.crypto.randomUUID()
    if (!requestId) setRequestId(opRequestId)
    const batch = writeBatch(db)
    await localDb.operationRequests.put({
      id: opRequestId,
      operationType: "purchase",
      status: "pending",
      operationNumber: String(opRequestId),
      payload: { cartCount: cartItems.length, supplierName, supplierInvoiceNumber },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)

    try {
      // 1. معالجة كل صنف في السلة — معرف حركة ثابت لكل سطر داخل نفس operationNumber (إعادة المحاولة لا تضاعف المخزون)
      for (let lineIndex = 0; lineIndex < cartItems.length; lineIndex++) {
        const item = cartItems[lineIndex]
        const transactionId = `${opRequestId}_line_${lineIndex}`
        const transRef = doc(db, "transactions", transactionId)
        
        const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
        
        // ب- إضافة الحركة إلى الـ Batch (للسحاب)
        batch.set(transRef, {
          id: transactionId,
          operationNumber: opRequestId,
          productId: item.productId,
          productName: item.productName,
          type: "purchase",
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          totalAmount: itemTotal,
          supplierName: supplierName || "",
          supplierInvoiceNumber: supplierInvoiceNumber || "",
          notes: generalNotes || "",
          createdAt: new Date().toISOString(),
          status: 'completed'
        })

        // ج- تحديث البيانات محلياً (هذا يحدث فوراً ويقوم أيضاً بمزامنة المنتج للسحاب بآخر قيمة محسوبة)
        // [تنبيه] قمنا بإزالة batch.update(productRef, { purchases: increment... }) 
        // لتجنب مضاعفة العدد (مرة من هنا ومرة من دالة addTransaction).
        await addTransaction({
          id: transactionId, // [مهم] نستخدم نفس الـ ID لضمان تطابق البيانات
          productId: item.productId,
          productName: item.productName,
          type: "purchase",
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          totalAmount: itemTotal,
          notes: generalNotes,
          supplierName: supplierName || "",
          supplierInvoiceNumber: supplierInvoiceNumber || "",
          operationNumber: opRequestId,
        })
      }

      // 2. إرسال الـ Batch للسحاب (سيقوم بحفظ سجلات الحركات فقط، بينما يتم تحديث المخزون عبر addTransaction)
      await batch.commit()
      await localDb.operationRequests.update(opRequestId, { status: "synced", updatedAt: new Date().toISOString() } as any)

      // 4. تصفير النموذج ونجاح العملية
      setCartItems([])
      setGeneralNotes("")
      setSupplierName("")
      setSupplierInvoiceNumber("")
      setIsDialogOpen(false)
      toast({ title: "تم بنجاح", description: "تم تسجيل الفاتورة وتحديث الأسعار في الجدول" })

    } catch (error: any) {
      console.error("❌ Error in Batch Submit:", error)
      await localDb.operationRequests.update(opRequestId, {
        status: "failed",
        error: error?.message || "purchase_submit_failed",
        updatedAt: new Date().toISOString()
      } as any)
      toast({ 
        title: "فشلت العملية", 
        description: "تأكد من الإنترنت وحاول مجدداً: " + error.message, 
        variant: "destructive" 
      })
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }
    


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
              {shouldShow('purchasesPage.quickActions') && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title={t("common.restore", "استعادة")}>
                    <Undo2 className="h-4 w-4 rotate-180" style={{ transform: 'scaleX(-1)' }} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleBackupPurchases} title={t("common.backup", "نسخ احتياطي")}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleFactoryResetPurchases} title={t("common.reset", "استعادة ضبط المصنع")} className="text-red-500 hover:text-red-700 hover:bg-red-50 mr-2">
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              {shouldShow('purchasesPage.addGRN') && (
                <>
                  <Button onClick={() => setIsReceivingNoteOpen(true)} variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 transition-all text-sm font-semibold h-10 px-4 rounded-xl">
                    <Truck className="h-4 w-4 text-primary" />
                    سند استلام بضاعة / Goods Receipt Note
                  </Button>
                  <ReceivingNoteDialog open={isReceivingNoteOpen} onOpenChange={setIsReceivingNoteOpen} />
                </>
              )}
              {shouldShow('purchasesPage.addPurchase') && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { 
  // 1. توليد معرف فريد عالمياً (UUID) بمجرد فتح النافذة
  const newId = self.crypto.randomUUID(); 
  setRequestId(newId); // حفظ الرقم في الدرج الذي صنعناه للتو

  // 2. تصفير الحقول القديمة لبدء عملية نظيفة
  setCartItems([]); 
  setGeneralNotes(""); 
  setSupplierName(""); 
  setSupplierInvoiceNumber(""); 
  setIsDialogOpen(true); 
  setShowQuickAdd(false); 
}}>
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
                        <div className="flex items-center justify-between">
                          <div className="relative flex-1 mr-2">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                              value={dialogSearch}
                              onChange={(e) => setDialogSearch(e.target.value)}
                              placeholder="البحث عن منتج... / Search products..."
                              className="pl-9 h-10 rounded-xl bg-white border-gray-200"
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowQuickAdd(!showQuickAdd)}
                            className="h-10 rounded-xl gap-2"
                          >
                            {showQuickAdd ? <List className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
{showQuickAdd ? "قائمة المنتجات / Products List" : "إضافة سريعة / Quick Add"}
                          </Button>
                        </div>
                        {/* الفلاتر السريعة */}
                        {!showQuickAdd && (
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
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {showQuickAdd ? (
                          <QuickProductForm onSuccess={(newProduct) => addItemDirectly(newProduct)} />
                        ) : (
                          products
                            .filter(p => {
                              const matchesSearch = p.productName.toLowerCase().includes(dialogSearch.toLowerCase()) || p.productCode.toLowerCase().includes(dialogSearch.toLowerCase())
                              const matchesLoc = selectedLocations.length === 0 || (p.location && selectedLocations.includes(p.location))
                              const stock = Number(p.currentStock ?? 0)
                              const isOutOfStock = stock <= 0
                              const totalInbound = (Number(p.openingStock) || 0) + (Number(p.purchases) || 0) + (Number(p.returns) || 0)
                              const limit = totalInbound * ((p.lowStockThresholdPercentage || 33.33) / 100)
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
                            })
                        )}
                      </div>
                    </div>

                    {/* القسم الأيسر للسلة */}
                    <div className="lg:col-span-7 flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                        <h3 className="font-bold text-sm">قائمة المشتريات <br />Purchase Cart</h3>
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
                            <div className="flex-1">
                              <SupplierCombobox
                                value={supplierName}
                                onChange={setSupplierName}
                                placeholder="اسم المورد (اختياري)..."
                                className="h-9 text-xs bg-white border-gray-200"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Label className="shrink-0 text-xs font-bold text-gray-500 w-32">رقم فاتورة المورد / Invoice No.</Label>
                            <Input
                              value={supplierInvoiceNumber}
                              onChange={e => setSupplierInvoiceNumber(e.target.value)}
                              placeholder="رقم فاتورة المورد ان وجد..."
                              className="h-9 text-xs bg-white"
                            />
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
                      حفظ العمليات <br />Save Purchases
                    </Button>
                    <Button variant="secondary" onClick={() => setIsDialogOpen(false)} className="h-10 px-6 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 border-none">
                      إلغاء<br />Cancel
                    </Button>
                  </DialogFooter>
                </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {shouldShow('purchasesPage.warehouseAdvisor') && <WarehouseAdvisor />}

          {shouldShow('purchasesPage.statsCards') && (
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
          )}

          <Card>
            <CardHeader className="pb-3">
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
              <Tabs defaultValue="purchases" className="w-full">
                <TabsList className="mb-4 bg-slate-100/50 p-1 rounded-xl">
                  <TabsTrigger value="purchases" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                    <Receipt className="h-4 w-4" />
                    المشتريات / Purchases
                  </TabsTrigger>
                  {shouldShow('purchasesPage.historyGRN') && (
                    <TabsTrigger value="receiving" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <Truck className="h-4 w-4" />
                      سندات الاستلام / GRNs
                      {receivingNotes.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] bg-blue-100 text-blue-700 border-none">{receivingNotes.length}</Badge>
                      )}
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="purchases">
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
                          <TableHead className="w-[150px] border-x text-center">المورد <br/> Supplier</TableHead>
                          <TableHead className="w-[120px] border-x text-center">رقم الفاتورة <br/> Inv No.</TableHead>
                          <TableHead className="w-[160px] border-x text-center"><DualText k="purchases.table.date" /></TableHead>
                          {(shouldShow('purchasesPage.historyActions.print') || shouldShow('purchasesPage.historyActions.delete')) && (
                            <TableHead className="w-[100px] border-x text-center">الإجراءات <br/> Actions</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!filteredPurchases || filteredPurchases.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                              لا توجد عمليات شراء / No purchases found
                            </TableCell>
                          </TableRow>
                        ) : (
                          Object.entries(
                            (filteredPurchases as Transaction[]).reduce((acc, tr) => {
                              if (tr.type !== 'purchase') return acc
                              const opNum = tr.operationNumber || tr.id.slice(0, 13)
                              if (!acc[opNum]) acc[opNum] = []
                              acc[opNum].push(tr)
                              return acc
                            }, {} as Record<string, Transaction[]>)
                          )
                            .sort(([a], [b]) => {
                              // Precise numeric comparison for timestamps as strings
                              if (a.length !== b.length) return b.length - a.length
                              return b.localeCompare(a)
                            })
                            .map(([opNum, group]) => (
                              <TableRow key={opNum} className="hover:bg-muted/30">
                                <TableCell className="font-medium text-xs">
                                  <div className="flex flex-col">
                                    <span className="font-bold">#{opNum.slice(-6)}</span>
                                    <span className="text-[9px] text-muted-foreground">{formatArabicGregorianDateTime(new Date(group[0].createdAt))}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {group.length > 1 ? (
                                    <Badge variant="secondary" className="text-[10px]">{group.length} أصناف</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">
                                      {group[0]?.productId ? group[0].productId.slice(0, 8) : "—"}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[150px]">
                                  <div className="flex flex-col gap-1">
                                    {group.map((item, idx) => (
                                      <div key={idx} className="flex items-center gap-1 text-[10px] border-b border-muted/30 pb-0.5 last:border-0">
                                        <span className="truncate flex-1 font-medium">{item.productName}</span>
                                        <Badge variant="outline" className="h-4 text-[9px] px-1 font-bold text-blue-600">x{item.quantity}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                </TableCell>
                                {settings.showUnit && <TableCell className="text-center text-[10px]">{(group[0] as any).unit || "قطعة"}</TableCell>}
                                {settings.showQuantity && (
                                  <TableCell className="text-center font-bold text-blue-700">
                                    {group.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                                  </TableCell>
                                )}
                                {settings.showPrice && (
                                  <TableCell className="text-center text-[10px] font-medium">
                                    {group.length === 1 ? group[0].unitPrice?.toLocaleString() : "متنوع"}
                                  </TableCell>
                                )}
                                <TableCell className="text-xs text-center font-bold text-green-700">
                                  {group.reduce((sum, item) => sum + (item.totalAmount || 0), 0).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 bg-blue-50/50 border-blue-100">{group[0].supplierName || "—"}</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-slate-100">{group[0].supplierInvoiceNumber || "—"}</Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="text-[10px] text-muted-foreground block">{formatArabicGregorianDateTime(new Date(group[0].createdAt))}</span>
                                </TableCell>
                                 {(shouldShow('purchasesPage.historyActions.print') || shouldShow('purchasesPage.historyActions.delete')) && (
                                  <TableCell>
                                    <div className="flex items-center justify-center gap-1">
                                      {shouldShow('purchasesPage.historyActions.print') && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                                          onClick={() => generatePurchaseTransactionPDF(group, t("common.lang") as any)}
                                        >
                                          <Printer className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      {shouldShow('purchasesPage.historyActions.delete') && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-red-400 hover:text-red-700 hover:bg-red-50"
                                          onClick={() => {
                                            if (confirm("هل أنت متأكد من حذف هذه المعاملة؟")) {
                                              group.forEach(purchase => {
                                                if (user) {
                                                  saveDocument('transactions', { ...purchase, id: purchase.id, _deleted: true })
                                                  removeFromStoreCache('transactions', purchase.id)
                                                } else {
                                                  deleteTransaction(purchase.id)
                                                }
                                              })
                                            }
                                          }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="receiving">
                  <div className="overflow-x-auto overflow-y-auto max-h-[600px] relative rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white dark:bg-slate-950 z-10 shadow-sm border-b">
                        <TableRow>
                          <TableHead className="w-[160px] font-bold">رقم السند / Note No.</TableHead>
                          <TableHead className="min-w-[150px] font-bold">المورد / Supplier</TableHead>
                          <TableHead className="text-center font-bold">عدد الأصناف / Items</TableHead>
                          <TableHead className="text-center font-bold">المستلم / Receiver</TableHead>
                          <TableHead className="w-[180px] font-bold">التاريخ / Date</TableHead>
                          <TableHead className="w-[100px] text-center font-bold">Actions / إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivingNotes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">
                              <div className="flex flex-col items-center gap-2">
                                <span className="text-sm">لا توجد سندات استلام مسجلة</span>
                                <span className="text-[10px] uppercase opacity-60">No receiving notes recorded yet</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          receivingNotes.map((note) => (
                            <TableRow key={note.id} className="hover:bg-slate-50 transition-colors">
                              <TableCell className="font-bold text-blue-600">{note.noteNumber}</TableCell>
                              <TableCell className="font-medium">{note.supplierName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-bold">{note.items.length}</Badge>
                              </TableCell>
                              <TableCell className="text-center text-xs text-slate-500">{note.receiverName}</TableCell>
                              <TableCell className="text-xs">{formatArabicGregorianDateTime(new Date(note.createdAt))}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={async () => {
                                      const url = await generateReceivingNotePDF(note)
                                      window.open(url, "_blank")
                                    }}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => {
                                      if (confirm("هل أنت متأكد من حذف هذا السند؟")) {
                                        deleteReceivingNote(note.id)
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <PurchaseRequestsSection />
        </div>
      </main>
    </div>
  )
}
