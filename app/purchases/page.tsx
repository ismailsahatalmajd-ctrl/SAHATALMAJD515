"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Calendar, Package, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { downloadJSON } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Download, Undo2 } from "lucide-react"
import { useRef } from "react"
import { useAuth } from "@/components/auth-provider"
import { useProducts, useTransactions, saveDocument } from "@/hooks/use-firestore"
import { useProductsRealtime, usePurchasesRealtime } from "@/hooks/use-store"

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
  const [productQuery, setProductQuery] = useState("")
  const [formData, setFormData] = useState({
    productId: "",
    quantity: 0,
    unitPrice: 0,
    notes: "",
  })

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
    return purchases.filter((tr) => {
      const prod = products.find((prod) => prod.id === tr.productId)
      return (
        tr.productName.toLowerCase().includes(q) ||
        (prod?.productCode || "").toLowerCase().includes(q) ||
        (prod?.itemNumber || "").toLowerCase().includes(q) ||
        tr.id.includes(searchTerm)
      )
    })
  }, [searchTerm, purchases, products])

  const filteredProductsForDialog = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      (p.productName || "").toLowerCase().includes(q) ||
      (p.productCode || "").toLowerCase().includes(q) ||
      (p.itemNumber || "").toLowerCase().includes(q) ||
      (p.id || "").toLowerCase().includes(q),
    )
  }, [productQuery, products])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const product = products.find((p) => p.id === formData.productId)
    if (!product) return

    if (user) {
      // Cloud
      const transactionId = Date.now().toString()
      const newPurchase: Transaction = {
        id: transactionId,
        operationNumber: transactionId.slice(-6),
        productId: formData.productId,
        productName: product.productName,
        type: "purchase",
        quantity: formData.quantity,
        unitPrice: formData.unitPrice,
        totalAmount: formData.quantity * formData.unitPrice,
        notes: formData.notes,
        createdAt: new Date().toISOString()
      }
      await saveDocument("transactions", newPurchase)

      // Update product in cloud
      await saveDocument("products", {
        ...product,
        purchases: product.purchases + formData.quantity,
        currentStock: product.currentStock + formData.quantity,
        averagePrice: (product.averagePrice * product.currentStock + formData.unitPrice * formData.quantity) / (product.currentStock + formData.quantity),
        currentStockValue: (product.currentStock + formData.quantity) * product.averagePrice,
        updatedAt: new Date().toISOString()
      })
    } else {
      // Local
      const newPurchase = addTransaction({
        productId: formData.productId,
        productName: product.productName,
        type: "purchase",
        quantity: formData.quantity,
        unitPrice: formData.unitPrice,
        totalAmount: formData.quantity * formData.unitPrice,
        notes: formData.notes,
      })

      // Update product
      updateProduct(product.id, {
        purchases: product.purchases + formData.quantity,
        currentStock: product.currentStock + formData.quantity,
        averagePrice:
          (product.averagePrice * product.currentStock + formData.unitPrice * formData.quantity) /
          (product.currentStock + formData.quantity),
        currentStockValue: (product.currentStock + formData.quantity) * product.averagePrice,
      })

    }

    setFormData({ productId: "", quantity: 0, unitPrice: 0, notes: "" })
    setIsDialogOpen(false)
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
                  <Button>
                    <Plus className="ml-2 h-4 w-4" />
                    <DualText k="purchases.add" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle><DualText k="purchases.add.title" /></DialogTitle>
                    <DialogDescription><DualText k="purchases.add.desc" /></DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="product"><DualText k="form.product" /></Label>
                        <div className="relative">
                          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={productQuery}
                            onChange={(e) => setProductQuery(e.target.value)}
                            placeholder={t("common.search.products")}
                            className="pr-10"
                          />
                        </div>
                        <Select
                          value={formData.productId}
                          onValueChange={(value) => setFormData({ ...formData, productId: value })}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("form.selectProduct")} />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredProductsForDialog.map((product) => (
                              <SelectItem
                                key={product.id}
                                value={product.id}
                                className={product.currentStock < (product.minStockLimit ?? 10) ? "text-[#FF0000]" : undefined}
                                aria-label={product.currentStock < (product.minStockLimit ?? 10) ? t("common.lowStockProduct") : undefined}
                                title={product.currentStock < (product.minStockLimit ?? 10) ? t("common.lowStock") : undefined}
                              >
                                {product.productName} - {product.productCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {settings.showQuantity && (
                        <div className="space-y-2">
                          <Label htmlFor="quantity"><DualText k="form.quantity" /></Label>
                          <Input
                            id="quantity"
                            type="number"
                            min="1"
                            value={formData.quantity || ""}
                            onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                            required
                          />
                        </div>
                      )}
                      {settings.showPrice && (
                        <div className="space-y-2">
                          <Label htmlFor="unitPrice"><DualText k="form.unitPrice" /></Label>
                          <Input
                            id="unitPrice"
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.unitPrice || ""}
                            onChange={(e) => setFormData({ ...formData, unitPrice: Number(e.target.value) })}
                            required
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="notes"><DualText k="form.notes" /></Label>
                        <Input
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder={t("form.notes.placeholder")}
                        />
                      </div>
                      {settings.showTotal && formData.quantity > 0 && formData.unitPrice > 0 && (
                        <div className="rounded-lg bg-muted p-4">
                          <p className="text-sm text-muted-foreground"><DualText k="common.total" /></p>
                          <p className="text-2xl font-bold">{(formData.quantity * formData.unitPrice).toFixed(2)} <DualText k="common.currency" /></p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        <DualText k="common.cancel" />
                      </Button>
                      <Button type="submit"><DualText k="common.add" /></Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><DualText k="purchases.table.operation" /></TableHead>
                      <TableHead><DualText k="purchases.table.product" /></TableHead>
                      {settings.showUnit && <TableHead><DualText k="common.unit" /></TableHead>}
                      {settings.showQuantity && <TableHead><DualText k="purchases.table.quantity" /></TableHead>}
                      {settings.showPrice && <TableHead><DualText k="purchases.table.unitPrice" /></TableHead>}
                      {settings.showTotal && <TableHead><DualText k="purchases.table.total" /></TableHead>}
                      <TableHead><DualText k="purchases.table.date" /></TableHead>
                      <TableHead><DualText k="purchases.table.notes" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          <DualText k="purchases.empty" />
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPurchases.map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-medium">#{purchase.operationNumber || purchase.id.slice(-6)}</TableCell>
                          <TableCell
                            className={lowStockIds.has(purchase.productId) ? "text-[#FF0000] font-semibold" : undefined}
                            aria-label={lowStockIds.has(purchase.productId) ? t("common.lowStockProduct") : undefined}
                            title={lowStockIds.has(purchase.productId) ? t("common.lowStock") : undefined}
                          >
                            {purchase.productName}
                          </TableCell>
                          {settings.showUnit && <TableCell>{products.find(p => p.id === purchase.productId)?.unit || '-'}</TableCell>}
                          {settings.showQuantity && <TableCell>{purchase.quantity}</TableCell>}
                          {settings.showPrice && <TableCell>{purchase.unitPrice.toFixed(2)} <DualText k="common.currency" /></TableCell>}
                          {settings.showTotal && <TableCell className="font-semibold">{purchase.totalAmount.toFixed(2)} <DualText k="common.currency" /></TableCell>}
                          <TableCell>{new Date(purchase.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                          <TableCell className="text-muted-foreground">{purchase.notes || "-"}</TableCell>
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
