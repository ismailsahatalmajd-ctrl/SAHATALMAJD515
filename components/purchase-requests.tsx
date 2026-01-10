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
import { Plus, Search, FileText, Send, Save, Trash2, Edit, CheckCircle, Check, ChevronsUpDown } from "lucide-react"
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
import { formatEnglishNumber, getNumericInvoiceNumber } from "@/lib/utils"
import { generatePurchaseRequestPDF } from "@/lib/purchase-request-pdf-generator"
import { useI18n } from "@/components/language-provider"
import { DualText, getDualString } from "@/components/ui/dual-text"

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
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              {t("purchaseRequests.addNew")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-full sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? t("purchaseRequests.dialog.edit") : t("purchaseRequests.dialog.new")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 flex flex-col">
                  <Label>{t("purchaseRequests.form.product.label")}</Label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between font-normal h-auto whitespace-normal text-left"
                      >
                        {selectedProductId
                          ? products.find((p) => p.id === selectedProductId)?.productName
                          : t("purchaseRequests.form.product.placeholder")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("purchaseRequests.search.placeholder")} />
                        <CommandList>
                          <CommandEmpty>{t("common.noData")}</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => {
                              const stock = Number(p.currentStock ?? 0)
                              const isOutOfStock = stock <= 0

                              let isLowStock = p.isLowStock
                              if (isLowStock === undefined) {
                                const threshold = p.lowStockThresholdPercentage || 33.33
                                const limit = ((p.openingStock || 0) + (p.purchases || 0)) * (threshold / 100)
                                isLowStock = stock <= limit
                              }

                              return (
                                <CommandItem
                                  key={p.id}
                                  value={p.productName + " " + p.productCode}
                                  onSelect={() => {
                                    setSelectedProductId(p.id)
                                    setOpen(false)
                                  }}
                                  className={cn(
                                    isOutOfStock
                                      ? "text-red-900 font-medium"
                                      : isLowStock
                                        ? "text-red-500"
                                        : ""
                                  )}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedProductId === p.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{p.productName}</span>
                                    <span className={cn(
                                      "text-xs",
                                      isOutOfStock ? "text-red-800/80" : isLowStock ? "text-red-500/80" : "text-muted-foreground"
                                    )}>{p.productCode}</span>
                                  </div>
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>{t("purchaseRequests.form.qty.label")}</Label>
                  <Input type="number" min={1} value={requestedQty} onChange={(e) => setRequestedQty(Number(e.target.value))} />
                </div>
                <div className="space-y-2 flex items-end">
                  <Button onClick={addItemFromProduct} className="w-full">{t("purchaseRequests.form.addToList")}</Button>
                </div>
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("purchaseRequests.table.item.index")}</TableHead>
                      <TableHead>{t("purchaseRequests.table.item.code")}</TableHead>
                      <TableHead>{t("purchaseRequests.table.item.name")}</TableHead>
                      {settings.showUnit && <TableHead>{t("purchaseRequests.table.item.unit")}</TableHead>}
                      {settings.showQuantity && <TableHead>{t("purchaseRequests.table.item.requested")}</TableHead>}
                      {settings.showQuantity && <TableHead>{t("purchaseRequests.table.item.available")}</TableHead>}
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">{t("purchaseRequests.table.item.empty")}</TableCell>
                      </TableRow>
                    ) : (
                      items.map((it, idx) => (
                        <TableRow key={it.id || it.productId}>
                          <TableCell>{formatEnglishNumber(idx + 1)}</TableCell>
                          <TableCell className="font-medium">{it.productCode}</TableCell>
                          <TableCell>{it.productName}</TableCell>
                          {settings.showUnit && <TableCell>{it.unit || '-'}</TableCell>}
                          {settings.showQuantity && <TableCell>
                            <Input type="number" value={it.requestedQuantity} min={1}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setItems((prev) => prev.map((p) => p === it ? { ...p, requestedQuantity: v } : p))
                              }} />
                          </TableCell>}
                          {settings.showQuantity && <TableCell>{formatEnglishNumber(it.availableQuantity ?? 0)}</TableCell>}
                          <TableCell>
                            <Button variant="destructive" size="sm" onClick={() => removeItem((it.id || it.productId) as string)}>
                              <Trash2 className="ml-2 h-4 w-4" /> {t("purchaseRequests.table.item.remove")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <Label>{t("purchaseRequests.form.notes.label")}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("purchaseRequests.form.notes.placeholder")} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>{t("purchaseRequests.dialog.cancel")}</Button>
              <Button onClick={persistDraft}><Save className="ml-2 h-4 w-4" /> {t("purchaseRequests.dialog.saveDraft")}</Button>
              <Button onClick={submitRequest} variant="default"><Send className="ml-2 h-4 w-4" /> {t("purchaseRequests.dialog.submit")}</Button>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("purchaseRequests.table.number")}</TableHead>
                  <TableHead>{t("purchaseRequests.table.status")}</TableHead>
                  <TableHead>{t("purchaseRequests.table.itemsCount")}</TableHead>
                  <TableHead>{t("purchaseRequests.table.createdAt")}</TableHead>
                  <TableHead>{t("purchaseRequests.table.actions")}</TableHead>
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
                      <TableCell className="font-medium">#{r.requestNumber || getNumericInvoiceNumber(r.id, new Date(r.createdAt))}</TableCell>
                      <TableCell>{r.status === 'draft' ? t("purchaseRequests.status.draft") : r.status === 'submitted' ? t("purchaseRequests.status.submitted") : r.status === 'received' ? t("purchaseRequests.status.received") : r.status}</TableCell>
                      <TableCell>{formatEnglishNumber(r.items.length)}</TableCell>
                      <TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="space-x-2">
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
