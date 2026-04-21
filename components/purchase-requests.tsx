"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Plus, Search, FileText, Send, Save, Trash2, Edit, CheckCircle, Check, ChevronsUpDown, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { Product } from "@/lib/types"
import type { PurchaseRequest, PurchaseRequestItem } from "@/lib/purchase-request-types"
import { getProducts } from "@/lib/storage"
import { addPurchaseRequest, getPurchaseRequests, setRequestStatus, updatePurchaseRequest, deletePurchaseRequest } from "@/lib/purchase-request-storage"
import { formatEnglishNumber, getNumericInvoiceNumber, formatArabicGregorianDateTime } from "@/lib/utils"
import { generatePurchaseRequestPDF } from "@/lib/purchase-request-pdf-generator"
import { useI18n } from "@/components/language-provider"
import { DualText, getDualString } from "@/components/ui/dual-text"
import { Badge } from "@/components/ui/badge"
import { ProductImage } from "@/components/product-image"

import { useInvoiceSettings } from "@/lib/invoice-settings-store"
import { useProductsRealtime, usePurchaseRequestsRealtime } from "@/hooks/use-store"

export function PurchaseRequestsSection() {
  const { t, lang } = useI18n()
  const settings = useInvoiceSettings()
  const { data: productsRaw } = useProductsRealtime()
  const { data: requestsRaw } = usePurchaseRequestsRealtime()

  const { toast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  useEffect(() => {
    if (productsRaw) setProducts(productsRaw as Product[])
    if (requestsRaw) setRequests(requestsRaw as PurchaseRequest[])
  }, [productsRaw, requestsRaw])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [items, setItems] = useState<PurchaseRequestItem[]>([])
  const [notes, setNotes] = useState<string>("")
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [open, setOpen] = useState(false)
  const [requestedQty, setRequestedQty] = useState<number>(1)
  const [dialogSearch, setDialogSearch] = useState("") // للبحث داخل نافذة المنتجات
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]) // فلتر الموقع
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]) // فلتر المخزون (in_stock, low_stock, out_of_stock)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const role = typeof window !== 'undefined' ? (localStorage.getItem('user_role') || 'user') : 'user'
  const hasPermission = (action: 'submit' | 'delete' | 'received' | 'edit') => {
    // بسيط: المدير أو المسؤول فقط للعمليات الحساسة
    if (action === 'submit' || action === 'delete' || action === 'received' || action === 'edit') {
      return role === 'admin' || role === 'manager'
    }
    return true
  }

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r) => {
      const matchesSearch = !q
        ? true
        : r.items.some((i) => i.productName.toLowerCase().includes(q) || i.productCode.toLowerCase().includes(q)) ||
        (r.notes || "").toLowerCase().includes(q) ||
        (r.requestNumber ? String(r.requestNumber).includes(q) : false)
      const matchesStatus = statusFilter === 'all' ? true : r.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [search, requests, statusFilter])

  // استخراج المواقع الفريدة من المنتجات لفلتر الموقع
  const uniqueLocations = useMemo(() => {
    const locs = products.map(p => p.location).filter(Boolean) as string[]
    return Array.from(new Set(locs)).sort()
  }, [products])

  const toggleLocation = (loc: string) => {
    setSelectedLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    )
  }

  const toggleStock = (stockType: string) => {
    setSelectedStocks(prev =>
      prev.includes(stockType) ? prev.filter(s => s !== stockType) : [...prev, stockType]
    )
  }

  const addItemFromProduct = () => {
    if (!selectedProductId) return
    const p = products.find((pp) => pp.id === selectedProductId)
    if (!p) return
    if (!requestedQty || requestedQty <= 0) {
      toast({
        title: getDualString("purchaseRequests.toast.invalidQty"),
        description: getDualString("purchaseRequests.toast.invalidQtyDesc"),
        variant: "destructive"
      })
      return
    }
    const existingIndex = items.findIndex((i) => i.productId === p.id)
    const newItem: PurchaseRequestItem = {
      id: items[existingIndex]?.id,
      productId: p.id,
      productCode: p.productCode,
      productName: p.productName,
      unit: p.unit,
      requestedQuantity: requestedQty,
      availableQuantity: p.currentStock,
      image: p.image,
    }
    setItems((prev) => {
      if (existingIndex !== -1) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], requestedQuantity: next[existingIndex].requestedQuantity + requestedQty }
        return next
      }
      return [...prev, newItem]
    })
    setRequestedQty(1)
    setSelectedProductId("")
  }

  const addItemDirectly = (p: Product) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.productId === p.id)
      if (existingIndex !== -1) {
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], requestedQuantity: next[existingIndex].requestedQuantity + 1 }
        return next
      }
      return [...prev, {
        productId: p.id,
        productCode: p.productCode,
        productName: p.productName,
        unit: p.unit,
        requestedQuantity: 1,
        availableQuantity: p.currentStock,
        image: p.image,
        extraNotes: "",
        itemNotes: ""
      }]
    })
    toast({
      title: "تم الإضافة / Added",
      description: `${p.productName} تمت إضافته للقائمة`
    })
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id && i.productId !== id))
  }

  const openNewRequest = () => {
    setEditingId(null)
    setItems([])
    setNotes("")
    setIsDialogOpen(true)
  }

  const openEditRequest = (req: PurchaseRequest) => {
    setEditingId(req.id)
    setItems(req.items)
    setNotes(req.notes || "")
    setIsDialogOpen(true)
  }

  const persistDraft = async () => {
    if (items.length === 0) {
      toast({
        title: getDualString("purchaseRequests.toast.noItems"),
        description: getDualString("purchaseRequests.toast.addItemsFirst"),
        variant: "destructive"
      })
      return
    }
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      if (editingId) {
        const updated = updatePurchaseRequest(editingId, { items, notes })
        if (updated) {
          toast({
            title: getDualString("purchaseRequests.toast.draftSaved"),
            description: getDualString("purchaseRequests.toast.draftUpdated")
          })
        }
      } else {
        const created = addPurchaseRequest({ items, notes, createdBy: "system" })
        toast({
          title: getDualString("purchaseRequests.toast.draftCreated"),
          description: getDualString("purchaseRequests.toast.requestSaved")
        })
      }
      setIsDialogOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitRequest = async () => {
    if (items.length === 0) {
      toast({
        title: getDualString("purchaseRequests.toast.noItems"),
        description: getDualString("purchaseRequests.toast.addItemsFirstSubmit"),
        variant: "destructive"
      })
      return
    }
    if (!hasPermission('submit')) {
      toast({
        title: getDualString("purchaseRequests.toast.noPermission"),
        description: getDualString("purchaseRequests.toast.noPermissionSubmit"),
        variant: "destructive"
      })
      return
    }

    if (isSubmitting) return

    const confirmed = window.confirm(t("purchaseRequests.confirm.submit"))
    if (!confirmed) return

    setIsSubmitting(true)
    try {
      if (editingId) {
        const updated = setRequestStatus(editingId, "submitted", "system")
        if (updated) {
          setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
          toast({
            title: getDualString("purchaseRequests.toast.submitted"),
            description: getDualString("purchaseRequests.toast.submittedDesc")
          })
        }
      } else {
        const created = addPurchaseRequest({ items, notes, createdBy: "system", status: "submitted" })
        setRequests((prev) => [created, ...prev])
        toast({
          title: getDualString("purchaseRequests.toast.submitted"),
          description: getDualString("purchaseRequests.toast.submittedDesc")
        })
      }
      setIsDialogOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  const markReceived = (id: string) => {
    if (!hasPermission('received')) {
      toast({
        title: getDualString("purchaseRequests.toast.noPermission"),
        description: getDualString("purchaseRequests.toast.noPermissionReceive"),
        variant: "destructive"
      })
      return
    }
    const ok = window.confirm(t("purchaseRequests.confirm.receive"))
    if (!ok) return
    const updated = setRequestStatus(id, 'received', 'system')
    if (updated) {
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      toast({
        title: getDualString("purchaseRequests.toast.received"),
        description: getDualString("purchaseRequests.toast.receivedDesc")
      })
    }
  }

  const deleteRequest = (id: string) => {
    const ok = window.confirm(t("purchaseRequests.confirm.delete"))
    if (!ok) return
    if (deletePurchaseRequest(id)) {
      toast({
        title: getDualString("purchaseRequests.toast.deleted"),
        description: getDualString("purchaseRequests.toast.deletedDesc")
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("purchaseRequests.title")}</h2>
          <p className="text-muted-foreground">{t("purchaseRequests.subtitle")}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewRequest}>
              <Plus className="ml-2 h-4 w-4" />
              {t("purchaseRequests.addNew")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] h-[95vh] flex flex-col overflow-hidden bg-gray-50/50 p-0">
            <DialogHeader className="shrink-0 bg-white p-4 pb-4 border-b">
              <DialogTitle className="text-xl">{editingId ? t("purchaseRequests.dialog.edit") : t("purchaseRequests.dialog.new")}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6">
              {/* القسم الأيمن (المنتجات) */}
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
                      // 1. Text Search Filter
                      const matchesSearch = p.productName.toLowerCase().includes(dialogSearch.toLowerCase()) || p.productCode.toLowerCase().includes(dialogSearch.toLowerCase())

                      // 2. Location Filter
                      const matchesLoc = selectedLocations.length === 0 || (p.location && selectedLocations.includes(p.location))

                      // 3. Stock Status Filter
                      const stock = Number(p.currentStock ?? 0)
                      const isOutOfStock = stock <= 0
                      const threshold = p.lowStockThresholdPercentage || 33.33
                      const limit = ((p.openingStock || 0) + (p.purchases || 0)) * (threshold / 100)
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

              {/* القسم الأيسر (سلة الطلبات) */}
              <div className="lg:col-span-7 flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                  <h3 className="font-bold text-sm">قائمة الطلب / Request List</h3>
                  <Badge variant="secondary" className="px-2">{items.length}</Badge>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <Table className="table-fixed text-xs">
                      <TableHeader className="bg-gray-50">
                        <TableRow>
                          <TableHead className="w-[180px] text-center border-x">Product / المنتج</TableHead>
                          <TableHead className="w-[70px] text-center border-x">Unit / الوحدة</TableHead>
                          <TableHead className="w-[90px] text-center border-x">Avail / المتوفر</TableHead>
                          <TableHead className="w-[110px] text-center border-x">Req / المطلوب</TableHead>
                          <TableHead className="w-[180px] text-center border-x">Usage Duration / مدة الاستخدام</TableHead>
                          <TableHead className="w-[180px] text-center border-x">Notes / ملاحظات</TableHead>
                          <TableHead className="w-[60px] text-center"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-10 text-gray-400">
                              <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              Empty list, add products from the right panel / القائمة فارغة، قم بإضافة منتجات من القائمة يمينًا
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((it, idx) => (
                            <TableRow key={it.id || it.productId}>
                              <TableCell className="border-x">
                                <p className="text-[10px] font-bold text-blue-600 truncate">{it.productCode}</p>
                                <p className="font-medium text-gray-800 line-clamp-2 leading-tight">{it.productName}</p>
                              </TableCell>
                              <TableCell className="text-center text-[11px] font-semibold text-gray-500 border-x truncate">
                                {it.unit || '-'}
                              </TableCell>
                              <TableCell className="text-center font-bold text-gray-600 border-x">
                                {formatEnglishNumber(it.availableQuantity ?? 0)}
                              </TableCell>
                              <TableCell className="border-x p-2">
                                <Input type="number" step="any" value={it.requestedQuantity} min={1}
                                  className="text-center h-8 text-xs font-bold bg-blue-50/50"
                                  onChange={(e) => {
                                    const v = Number(e.target.value)
                                    setItems((prev) => prev.map((p) => p === it ? { ...p, requestedQuantity: v } : p))
                                  }} />
                              </TableCell>
                              <TableCell className="border-x p-2">
                                <Input
                                  value={it.extraNotes || ''}
                                  placeholder="Example 3 months / مثال حقت 3 أشهر"
                                  className="h-8 text-xs shadow-sm bg-gray-50"
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setItems((prev) => prev.map((p) => p === it ? { ...p, extraNotes: v } : p))
                                  }}
                                />
                              </TableCell>
                              <TableCell className="border-x p-2">
                                <Input
                                  value={it.itemNotes || ''}
                                  placeholder="Notes / ملاحظات..."
                                  className="h-8 text-xs shadow-sm bg-gray-50"
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setItems((prev) => prev.map((p) => p === it ? { ...p, itemNotes: v } : p))
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-center p-2">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeItem((it.id || it.productId) as string)}>
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

                {/* Notes & Footer directly inside */}
                <div className="p-4 border-t bg-gray-50 flex flex-col gap-3 shrink-0">
                  <div>
                    <Label className="text-xs mb-1 block">ملاحظات عامة للطلب / General Notes</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية على كامل الطلب.note in all products" className="bg-white border-gray-200" />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 bg-white p-4 border-t gap-2 justify-end">
              <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>إلغاء / Cancel</Button>
              <Button onClick={persistDraft} className="font-bold"><Save className="ml-2 h-4 w-4" /> {t("purchaseRequests.dialog.saveDraft")}Save Draft</Button>
              <Button onClick={submitRequest} variant="default" className="font-bold border-0 text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>
                <Send className="ml-2 h-4 w-4" /> {t("purchaseRequests.dialog.submit")}Submit Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("purchaseRequests.listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("purchaseRequests.search.placeholder")} className="pr-10" />
            </div>
            <div className="flex items-center gap-2">
              <Label>{t("purchaseRequests.filter.status.label")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("common.filter")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("purchaseRequests.filter.status.all")}</SelectItem>
                  <SelectItem value="draft">{t("purchaseRequests.status.draft")}</SelectItem>
                  <SelectItem value="submitted">{t("purchaseRequests.status.submitted")}</SelectItem>
                  <SelectItem value="received">{t("purchaseRequests.status.received")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px] border-x text-center">{t("purchaseRequests.table.number")}</TableHead>
                  <TableHead className="w-[120px] border-x text-center">{t("purchaseRequests.table.status")}</TableHead>
                  <TableHead className="w-[120px] border-x text-center">{t("purchaseRequests.table.itemsCount")}</TableHead>
                  <TableHead className="w-[180px] border-x text-center">{t("purchaseRequests.table.createdAt")}</TableHead>
                  <TableHead className="w-[280px] border-x text-center">{t("purchaseRequests.table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">{t("purchaseRequests.empty")}</TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium border-x text-center">#{r.requestNumber || getNumericInvoiceNumber(r.id, new Date(r.createdAt))}</TableCell>
                      <TableCell className="border-x text-center">{r.status === 'draft' ? t("purchaseRequests.status.draft") : r.status === 'submitted' ? t("purchaseRequests.status.submitted") : r.status === 'received' ? t("purchaseRequests.status.received") : r.status}</TableCell>
                      <TableCell className="border-x text-center">{formatEnglishNumber(r.items.length)}</TableCell>
                      <TableCell className="border-x text-center">{formatArabicGregorianDateTime(new Date(r.createdAt))}</TableCell>
                      <TableCell className="space-x-2 border-x text-center">
                        <Button size="sm" onClick={() => openEditRequest(r)} disabled={!hasPermission('edit')} title={!hasPermission('edit') ? t("common.notAllowed") : undefined}><Edit className="ml-2 h-4 w-4" /> {t("purchaseRequests.actions.edit")}</Button>
                        <Button size="sm" variant="secondary" onClick={async () => {
                          toast({
                            title: getDualString("common.processing"),
                            description: getDualString("common.pleaseWait")
                          })
                          await generatePurchaseRequestPDF(r, lang, products)
                        }}><FileText className="ml-2 h-4 w-4" /> {t("purchaseRequests.actions.pdf")}</Button>
                        <Button size="sm" variant="default" onClick={() => markReceived(r.id)} disabled={!hasPermission('received')} title={!hasPermission('received') ? t("common.notAllowed") : undefined}><CheckCircle className="ml-2 h-4 w-4" /> {t("purchaseRequests.actions.receive")}</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteRequest(r.id)} disabled={!hasPermission('delete')} title={!hasPermission('delete') ? t("common.notAllowed") : undefined}><Trash2 className="ml-2 h-4 w-4" /> {t("purchaseRequests.actions.delete")}</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
