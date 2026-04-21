"use client"

import { useState, useCallback, useMemo } from "react"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProductSearchSelect } from "@/components/product-search-select"
import { UnitCombobox } from "@/components/unit-combobox"
import { SupplierCombobox } from "@/components/supplier-combobox"
import { ProductImage } from "@/components/product-image"
import { useI18n } from "@/components/language-provider"
import { Plus, Trash, Printer, Save, Image as ImageIcon, User, Truck, Building2 } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import {
    saveReceivingNote,
    generateReceivingNoteNumber,
    getProducts
} from "@/lib/storage"
import { generateReceivingNotePDF } from "@/lib/receiving-note-pdf-generator"
import type { ReceivingNote, ReceivingNoteItem, Product } from "@/lib/types"

interface ReceivingNoteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ReceivingNoteDialog({ open, onOpenChange }: ReceivingNoteDialogProps) {
    const { t } = useI18n()
    const [supplierName, setSupplierName] = useState("")
    const [receiverName, setReceiverName] = useState("")
    const [driverName, setDriverName] = useState("")
    const [items, setItems] = useState<ReceivingNoteItem[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Local state for product search results to avoid reload loop
    const [products, setProducts] = useState<Product[]>([])

    const loadProducts = useCallback(async () => {
        const all = await getProducts()
        setProducts(all)
    }, [])

    useMemo(() => {
        if (open) loadProducts()
    }, [open, loadProducts])

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products
        const q = searchQuery.toLowerCase().trim()
        return products.filter(p =>
            p.productName.toLowerCase().includes(q) ||
            p.productCode.toLowerCase().includes(q)
        )
    }, [products, searchQuery])

    const handleAddProduct = (product: Product) => {
        const newItem: ReceivingNoteItem = {
            id: uuidv4(),
            productId: product.id,
            productCode: product.productCode,
            productName: product.productName,
            unit: product.unit,
            quantity: 1,
            price: product.averagePrice || product.price || 0,
            total: product.averagePrice || product.price || 0,
            image: product.image
        }
        setItems(prev => [...prev, newItem])
    }

    const handleAddNewItem = () => {
        const newItem: ReceivingNoteItem = {
            id: uuidv4(),
            productName: "",
            unit: "Piece",
            quantity: 1,
            price: 0,
            total: 0
        }
        setItems(prev => [...prev, newItem])
    }

    const updateItem = (id: string, updates: Partial<ReceivingNoteItem>) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, ...updates }
                if (updates.quantity !== undefined || updates.price !== undefined) {
                    updated.total = (updated.quantity || 0) * (updated.price || 0)
                }
                return updated
            }
            return item
        }))
    }

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id))
    }

    const handleSave = async (isPrinting = false) => {
        if (!supplierName) {
            toast.error("يرجى كتابة اسم المورد / Supplier name is required")
            return
        }
        if (items.length === 0) {
            toast.error("يرجى إضافة منتجات / Please add items")
            return
        }

        setIsSubmitting(true)
        try {
            const note: ReceivingNote = {
                id: uuidv4(),
                noteNumber: generateReceivingNoteNumber(),
                receivingCompany: "ساحة المجد",
                supplierName,
                receiverName,
                driverName,
                items,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }

            await saveReceivingNote(note)
            toast.success("تم حفظ السند بنجاح / Note saved successfully")

            if (isPrinting) {
                const url = await generateReceivingNotePDF(note)
                const win = window.open(url, "_blank")
                if (!win) toast.error("رجاء السماح للنوافذ المنبثقة للطباعة / Please allow popups for printing")
            }

            onOpenChange(false)
            // Reset
            setSupplierName("")
            setDriverName("")
            setItems([])
        } catch (error) {
            console.error(error)
            toast.error("فشل في الحفظ / Failed to save")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-[98vw] !w-[98vw] h-[98vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-gray-50/50">
                <DialogHeader className="shrink-0 bg-white p-4 pb-4 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-blue-700">
                                <Truck className="h-6 w-6" />
                                <span>سند استلام بضاعة (GRN) / Goods Receiving Note</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-500 mt-1">
                                إثبات استلام بضاعة من مورد بدون فاتورة | Receipt proof from supplier without invoice
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6">
                    {/* القسم الأيمن للمنتجات (Sidebar) */}
                    <div className="lg:col-span-4 flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-3 border-b bg-gray-50 flex flex-col gap-2 shrink-0">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Search & Add / بحث وإضافة</Label>
                            <div className="relative">
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="ابحث بالاسم أو الكود... / Search Name or Code..."
                                    className="h-10 bg-white text-xs font-bold rounded-xl border-blue-100 focus:border-blue-400 focus:ring-blue-100 pr-10"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Plus className="h-4 w-4" />
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full h-9 gap-2 border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-600 font-bold text-xs rounded-xl transition-all"
                                onClick={handleAddNewItem}
                            >
                                <Plus className="h-4 w-4" />
                                <span>إضافة منتج يدوي / Add Manual Item</span>
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/30">
                            <div className="text-[10px] font-bold text-slate-400 mb-2 px-1 uppercase">
                                {searchQuery ? `Search Results (${filteredProducts.length})` : "Recent Products / منتجات المخزون"}
                            </div>
                            {filteredProducts.slice(0, 50).map(p => (
                                <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl border border-white hover:border-blue-200 hover:bg-blue-50 transition-all bg-white shadow-sm cursor-pointer group" onClick={() => handleAddProduct(p)}>
                                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center border shrink-0 overflow-hidden">
                                        <ProductImage
                                            product={{ id: p.id, image: p.image }}
                                            className="w-full h-full"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-blue-600 truncate">{p.productCode}</p>
                                        <p className="text-xs font-bold text-slate-700 truncate">{p.productName}</p>
                                    </div>
                                    <Plus className="h-5 w-5 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="py-20 text-center">
                                    <ImageIcon className="h-10 w-10 mx-auto text-slate-200" />
                                    <p className="text-xs font-bold text-slate-400 mt-2">لا يوجد منتجات تطابق بحثك</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* القسم الأيسر للتفاصيل والجدول */}
                    <div className="lg:col-span-8 flex flex-col bg-white border rounded-2xl shadow-sm overflow-hidden">
                        <div className="p-4 border-b bg-slate-50 grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
                                    <Building2 className="h-3 w-3" /> اسم المورد / Supplier
                                </Label>
                                <SupplierCombobox
                                    value={supplierName}
                                    onChange={setSupplierName}
                                    placeholder="اختر المورد... / Select..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
                                    <User className="h-3 w-3" /> المستلم / Receiver
                                </Label>
                                <Input
                                    value={receiverName}
                                    onChange={e => setReceiverName(e.target.value)}
                                    placeholder="Received by/المستلم"
                                    className="h-9 bg-white text-xs font-bold rounded-xl"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">
                                    <Truck className="h-3 w-3" /> السائق / Driver
                                </Label>
                                <Input
                                    value={driverName}
                                    onChange={e => setDriverName(e.target.value)}
                                    placeholder="Delivered by/السائق..."
                                    className="h-9 bg-white text-xs font-bold rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                <Table>
                                    <TableHeader className="bg-slate-800">
                                        <TableRow className="hover:bg-transparent border-none">
                                            <TableHead className="w-12 text-center text-[10px] font-black uppercase text-slate-400">#</TableHead>
                                            <TableHead className="w-16 text-center text-[10px] font-black uppercase text-white">الصورة<br />Image</TableHead>
                                            <TableHead className="min-w-[200px] text-center text-[10px] font-black uppercase text-white">المنتج<br />Product</TableHead> 
                                            <TableHead className="w-20 text-center text-[10px] font-black uppercase text-slate-400">الوحدة<br />Unit</TableHead>
                                            <TableHead className="w-24 text-center text-[10px] font-black uppercase text-blue-400">العدد<br />Quantity</TableHead>
                                            <TableHead className="w-24 text-center text-[10px] font-black uppercase text-slate-400">السعر<br />Price</TableHead>
                                            <TableHead className="w-24 text-center text-[10px] font-black uppercase text-slate-400">الإجمالي<br />Total</TableHead>                     
                                            <TableHead className="min-w-[150px] text-center text-[10px] font-black uppercase text-slate-400">ملاحظات<br />Notes</TableHead>
                                            <TableHead className="w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-40 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <ImageIcon className="h-8 w-8 opacity-20" />
                                                        <p className="text-xs font-bold">لم يتم إضافة منتجات بعد<br />No items added yet</p>
                                                        <p className="text-[10px] opacity-60 uppercase">Add items from the left list</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            items.map((item, index) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50 border-b last:border-0">
                                                    <TableCell className="text-center font-mono text-[10px] font-bold text-slate-400">{index + 1}</TableCell>
                                                    <TableCell className="py-2">
                                                        <ProductImage
                                                            product={{ id: item.productId || item.id, image: item.image }}
                                                            className="h-10 w-10"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <Input
                                                            value={item.productName}
                                                            onChange={e => updateItem(item.id, { productName: e.target.value })}
                                                            className="bg-transparent border-none focus-visible:ring-0 h-8 font-bold text-slate-700 text-xs"
                                                            placeholder="Product name..."
                                                        />
                                                        {item.productCode && <p className="text-[9px] font-black text-blue-500 mr-3">Code: {item.productCode}</p>}
                                                    </TableCell>
                                                    <TableCell>
                                                        <UnitCombobox
                                                            value={item.unit}
                                                            onChange={(val: string) => updateItem(item.id, { unit: val })}
                                                            className="h-8 w-full"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            step="any"
                                                            value={item.quantity}
                                                            onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })}
                                                            className="bg-blue-50 border-none h-8 text-center font-black text-blue-700 rounded-lg"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            step="any"
                                                            value={item.price}
                                                            onChange={e => updateItem(item.id, { price: Number(e.target.value) })}
                                                            className="bg-transparent border-none focus-visible:ring-0 text-center h-8 text-xs font-bold text-slate-500"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold text-slate-900 text-xs">
                                                        {(item.total || 0).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            value={item.notes || ""}
                                                            onChange={e => updateItem(item.id, { notes: e.target.value })}
                                                            className="bg-transparent border-none focus-visible:ring-0 h-8 font-bold text-slate-600 text-[10px] text-right"
                                                            placeholder="Add notes..."
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-slate-300 hover:text-red-500 transition-colors"
                                                            onClick={() => removeItem(item.id)}
                                                        >
                                                            <Trash className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-900 shrink-0 flex items-center justify-between">
                            <div className="flex items-center gap-8">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Grand Total / الإجمالي</span>
                                    <span className="text-2xl font-black text-white">{items.reduce((acc, it) => acc + (it.total || 0), 0).toFixed(2)} <span className="text-[10px] text-blue-400">SAR</span></span>
                                </div>
                                <div className="flex flex-col border-r border-slate-700 pr-8">
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Items / العدد</span>
                                    <span className="text-xl font-black text-slate-300">{items.length}</span>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    onClick={() => onOpenChange(false)}
                                    className="text-slate-400 hover:text-white hover:bg-white/5 font-bold h-10 px-4 rounded-xl"
                                >
                                    إلغاء<br/>Cancel
                                </Button>
                                <Button
                                    variant="outline"
                                    className="h-10 px-4 gap-2 border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500 hover:text-white font-bold rounded-xl transition-all"
                                    onClick={() => handleSave(true)}
                                    disabled={isSubmitting}
                                >
                                    <Printer className="h-4 w-4" />
                                    <span>حفظ وطباعة<br/>Save and print</span>
                                </Button>
                                <Button
                                    className="h-10 px-6 gap-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                                    onClick={() => handleSave(false)}
                                    disabled={isSubmitting}
                                >
                                    <Save className="h-4 w-4" />
                                    <span>تأكيد الحفظ<br/>Confirm save</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
