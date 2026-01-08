"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Search, FileDown, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  getProducts,
  addPurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "@/lib/storage"
import type { Product } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { generatePurchaseOrderPDF } from "@/lib/purchase-order-pdf"
import { useI18n } from "@/components/language-provider"
import { useInvoiceSettings } from "@/lib/invoice-settings-store"

interface PurchaseOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  orderToEdit?: PurchaseOrder
}

export function PurchaseOrderDialog({ open, onOpenChange, onSuccess, orderToEdit }: PurchaseOrderDialogProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([])
  const [notes, setNotes] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null)
  const { toast } = useToast()
  const { lang } = useI18n()
  const settings = useInvoiceSettings()

  useEffect(() => {
    if (open) {
      setProducts(getProducts())
      if (orderToEdit) {
        setOrderItems(orderToEdit.items)
        setNotes(orderToEdit.notes || "")
      } else {
        resetForm()
      }
    }
  }, [open, orderToEdit])

  const addItemRow = () => {
    setOrderItems([
      ...orderItems,
      {
        productId: "",
        productCode: "",
        productName: "",
        unit: "",
        requestedQuantity: 0,
        availableQuantity: 0,
        image: "",
      },
    ])
  }

  const removeItemRow = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index))
  }

  const updateItemRow = (index: number, field: keyof PurchaseOrderItem, value: string | number) => {
    const updated = [...orderItems]
    updated[index] = { ...updated[index], [field]: value }

    if (field === "productId") {
      const product = products.find((p) => p.id === value)
      if (product) {
        updated[index].productCode = product.productCode
        updated[index].productName = product.productName
        updated[index].unit = product.unit
        updated[index].availableQuantity = product.currentStock
        updated[index].image = product.image || ""
      }
    }

    setOrderItems(updated)
  }

  const handleSaveDraft = () => {
    if (orderItems.length === 0 || orderItems.some((item) => !item.productId)) {
      toast({ title: "خطأ", description: "يرجى إضافة منتجات صحيحة", variant: "destructive" })
      return
    }

    if (orderToEdit) {
      updatePurchaseOrder(orderToEdit.id, { items: orderItems, notes, status: "draft" })
      toast({ title: "تم الحفظ", description: "تم حفظ المسودة بنجاح" })
    } else {
      addPurchaseOrder({ items: orderItems, notes, status: "draft" })
      toast({ title: "تم الحفظ", description: "تم حفظ المسودة بنجاح" })
    }

    resetForm()
    onSuccess()
  }

  const handleSubmit = () => {
    if (orderItems.length === 0 || orderItems.some((item) => !item.productId || item.requestedQuantity <= 0)) {
      toast({ title: "خطأ", description: "يرجى إضافة منتجات وكميات صحيحة", variant: "destructive" })
      return
    }

    if (orderToEdit) {
      updatePurchaseOrder(orderToEdit.id, { items: orderItems, notes, status: "submitted" })
      toast({ title: "تم الإرسال", description: "تم إرسال طلب الشراء بنجاح" })
    } else {
      addPurchaseOrder({ items: orderItems, notes, status: "submitted" })
      toast({ title: "تم الإرسال", description: "تم إرسال طلب الشراء بنجاح" })
    }

    resetForm()
    onSuccess()
  }

  const handleExportPDF = async () => {
    if (orderItems.length === 0) {
      toast({ title: "خطأ", description: "لا توجد منتجات للتصدير", variant: "destructive" })
      return
    }

    const tempOrder: PurchaseOrder = {
      id: orderToEdit?.id || `temp-${Date.now()}`,
      items: orderItems,
      status: orderToEdit?.status || "draft",
      notes,
      createdAt: orderToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await generatePurchaseOrderPDF(tempOrder, lang)
  }

  const resetForm = () => {
    setOrderItems([])
    setNotes("")
    setSearchTerm("")
  }

  const filteredProducts = products.filter(
    (p) =>
      p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.productCode.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const totalRequestedQuantity = orderItems.reduce((sum, item) => sum + item.requestedQuantity, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[1000px] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl">{orderToEdit ? "تعديل طلب الشراء" : "إنشاء طلب شراء جديد"}</DialogTitle>
          <DialogDescription>أضف المنتجات المطلوب شراؤها مع تحديد الكميات</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">المنتجات المطلوبة</Label>
            <Button type="button" size="sm" onClick={addItemRow}>
              <Plus className="h-4 w-4 ml-1" />
              إضافة منتج
            </Button>
          </div>

          {orderItems.length > 0 && (
            <div className="border rounded-lg overflow-auto max-h-[40vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="w-[60px] text-center">الصورة</TableHead>
                    <TableHead className="min-w-[250px]">المنتج</TableHead>
                    {settings.showUnit && <TableHead className="w-[80px] text-center">الوحدة</TableHead>}
                    <TableHead className="w-[120px] text-center">الكمية المطلوبة</TableHead>
                    <TableHead className="w-[100px] text-center">المتوفر</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-center font-medium">{index + 1}</TableCell>
                      <TableCell>
                        {item.image ? (
                          <img
                            src={item.image || "/placeholder.svg"}
                            alt={item.productName}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            لا صورة
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Popover
                          open={openComboboxIndex === index}
                          onOpenChange={(open) => setOpenComboboxIndex(open ? index : null)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between bg-white text-black h-auto py-2"
                            >
                              {item.productId ? (
                                <span className="text-right truncate">
                                  <span className="font-medium">{item.productName}</span>
                                  <span className="text-xs text-gray-500 block">{item.productCode}</span>
                                </span>
                              ) : (
                                <span>اختر المنتج</span>
                              )}
                              <Search className="h-4 w-4 opacity-50 flex-shrink-0 mr-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="ابحث بالاسم أو الكود..."
                                value={searchTerm}
                                onValueChange={setSearchTerm}
                              />
                              <CommandList>
                                <CommandEmpty>لا توجد منتجات</CommandEmpty>
                                <CommandGroup>
                                  {filteredProducts.map((product) => (
                                    <CommandItem
                                      key={product.id}
                                      value={`${product.productName} ${product.productCode}`}
                                      onSelect={() => {
                                        updateItemRow(index, "productId", product.id)
                                        setOpenComboboxIndex(null)
                                        setSearchTerm("")
                                      }}
                                      className="flex items-center gap-2 cursor-pointer"
                                    >
                                      {product.image ? (
                                        <img
                                          src={product.image || "/placeholder.svg"}
                                          alt={product.productName}
                                          className="w-8 h-8 object-cover rounded"
                                        />
                                      ) : (
                                        <div className="w-8 h-8 bg-muted rounded" />
                                      )}
                                      <div className="flex-1">
                                        <div className="font-medium">{product.productName}</div>
                                        <div className="text-xs text-gray-500">
                                          {product.productCode} - متوفر: {product.currentStock}
                                        </div>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      {settings.showUnit && <TableCell className="text-center">{item.unit || "-"}</TableCell>}
                      {settings.showQuantity && <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={item.requestedQuantity || ""}
                          onChange={(e) => updateItemRow(index, "requestedQuantity", Number(e.target.value))}
                          className="bg-white text-black h-10 text-center font-semibold"
                          placeholder="0"
                        />
                      </TableCell>}
                      {settings.showQuantity && <TableCell className="text-center text-muted-foreground">{item.availableQuantity}</TableCell>}
                      <TableCell>
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeItemRow(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              rows={3}
            />
          </div>

          {orderItems.length > 0 && (
            <div className="rounded-lg bg-purple-50 p-4 border border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-700">إجمالي الكميات المطلوبة</p>
                  <p className="text-2xl font-bold text-purple-900">{totalRequestedQuantity}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-purple-700">عدد الأصناف</p>
                  <p className="text-xl font-semibold text-purple-900">{orderItems.length}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-gray-50 flex flex-wrap gap-2">
          <div className="flex gap-2 flex-1">
            <Button type="button" variant="outline" onClick={handleExportPDF} disabled={orderItems.length === 0}>
              <FileDown className="h-4 w-4 ml-1" />
              تصدير PDF
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={orderItems.length === 0}>
              <Save className="h-4 w-4 ml-1" />
              حفظ كمسودة
            </Button>
            <Button onClick={handleSubmit} disabled={orderItems.length === 0}>
              إرسال الطلب
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
