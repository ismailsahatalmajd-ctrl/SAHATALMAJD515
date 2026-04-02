"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { BranchInventory, ConsumptionRecord } from "@/lib/types"
import { v4 as uuidv4 } from "uuid"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { TrendingDown, Search, Plus, ArrowLeft, Package, Clock, AlertTriangle } from "lucide-react"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"
import { syncConsumptionRecord, syncBranchInventory } from "@/lib/firebase-sync-engine"

interface BranchConsumptionProps {
    branchId: string
    onBack?: () => void
}

const CONSUMPTION_REASONS = [
    { value: "daily_use", label: "استخدام يومي / Daily Use" },
    { value: "damaged", label: "تالف / Damaged" },
    { value: "expired", label: "منتهي الصلاحية / Expired" },
    { value: "sample", label: "عينة / Sample" },
    { value: "other", label: "أخرى / Other" }
]

export function BranchConsumption({ branchId, onBack }: BranchConsumptionProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedItem, setSelectedItem] = useState<BranchInventory | null>(null)
    const [quantity, setQuantity] = useState("")
    const [reason, setReason] = useState("daily_use")
    const [notes, setNotes] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Get branch inventory
    const inventory = useLiveQuery(
        () => db.branchInventory.where("branchId").equals(branchId).toArray(),
        [branchId]
    ) || []

    // Get all products to fallback for images
    const products = useLiveQuery(
        () => db.products.toArray()
    ) || []

    const productMap = useMemo(() => {
        return products.reduce((acc, p) => {
            acc[p.id] = p
            return acc
        }, {} as Record<string, any>)
    }, [products])

    // Get recent consumption records
    const recentConsumption = useLiveQuery(
        () => db.consumptionRecords
            .where("branchId").equals(branchId)
            .reverse()
            .limit(20)
            .toArray(),
        [branchId]
    ) || []

    // Filter inventory based on search
    const filteredInventory = useMemo(() => {
        let items = inventory.filter(i => i.currentStock > 0)

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            items = items.filter(item =>
                item.productName.toLowerCase().includes(q) ||
                (item.productCode?.toLowerCase().includes(q))
            )
        }

        // Enrich with image from product definition if missing in inventory record
        return items.map(item => {
            if (!item.productImage && item.productId && productMap[item.productId]) {
                const product = productMap[item.productId]
                return { ...item, productImage: product.image }
            }
            return item
        })
    }, [inventory, searchQuery, productMap])

    const handleOpenConsume = (item: BranchInventory) => {
        setSelectedItem(item)
        setQuantity("")
        setReason("daily_use")
        setNotes("")
        setIsDialogOpen(true)
    }

    const handleSubmitConsumption = async () => {
        if (!selectedItem) return

        const qty = Number(quantity)
        if (isNaN(qty) || qty <= 0) {
            toast({ title: "خطأ", description: "الرجاء إدخال كمية صحيحة", variant: "destructive" })
            return
        }

        if (qty > selectedItem.currentStock) {
            toast({ title: "خطأ", description: "الكمية أكبر من المتوفر", variant: "destructive" })
            return
        }

        setIsSubmitting(true)
        try {
            const now = new Date().toISOString()

            // Create consumption record
            const record: ConsumptionRecord = {
                id: uuidv4(),
                branchId,
                branchInventoryId: selectedItem.id,
                productId: selectedItem.productId,
                productName: selectedItem.productName,
                quantity: qty,
                reason,
                notes: notes || undefined,
                date: now,
                createdAt: now
            }

            await db.consumptionRecords.add(record)

            // Update inventory
            await db.branchInventory.update(selectedItem.id, {
                consumedTotal: selectedItem.consumedTotal + qty,
                currentStock: selectedItem.currentStock - qty,
                lastConsumedDate: now,
                updatedAt: now
            })

            toast({
                title: "تم تسجيل الاستهلاك",
                description: `تم خصم ${qty} من ${selectedItem.productName}`
            })

            // Sync to Firebase
            syncConsumptionRecord(record).catch(console.error)
            const updatedInventory = await db.branchInventory.get(selectedItem.id)
            if (updatedInventory) syncBranchInventory(updatedInventory).catch(console.error)

            setIsDialogOpen(false)
        } catch (error) {
            console.error("Consumption error:", error)
            toast({ title: "خطأ", description: "فشل تسجيل الاستهلاك", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
                {onBack && (
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                )}
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <TrendingDown className="w-5 h-5" />
                    Consumption / الاستهلاك
                </h2>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                    placeholder="Search product to consume / ابحث عن منتج للاستهلاك..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Available Items */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Available Items / الأصناف المتوفرة</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredInventory.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p>No items available for consumption</p>
                            <p className="text-xs">لا توجد أصناف متوفرة للاستهلاك</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">Image</TableHead>
                                    <TableHead>Product / المنتج</TableHead>
                                    <TableHead className="text-center">Available / متوفر</TableHead>
                                    <TableHead className="text-center">Action / إجراء</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInventory.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <ProductImageThumbnail
                                                src={item.productImage}
                                                alt={item.productName}
                                                className="w-10 h-10"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{item.productName}</div>
                                            <div className="text-xs text-muted-foreground">{item.productCode}</div>
                                        </TableCell>
                                        <TableCell className="text-center font-bold">{item.currentStock} {item.unit}</TableCell>
                                        <TableCell className="text-center">
                                            <Button size="sm" onClick={() => handleOpenConsume(item)}>
                                                <TrendingDown className="w-4 h-4 ml-1" />
                                                Consume / استهلك
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Recent Consumption */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent Consumption / آخر الاستهلاكات
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {recentConsumption.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                            No consumption records yet / لا توجد سجلات استهلاك
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product / المنتج</TableHead>
                                    <TableHead className="text-center">Qty / الكمية</TableHead>
                                    <TableHead>Reason / السبب</TableHead>
                                    <TableHead>Date / التاريخ</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentConsumption.map(record => (
                                    <TableRow key={record.id}>
                                        <TableCell className="font-medium">{record.productName}</TableCell>
                                        <TableCell className="text-center text-red-600">-{record.quantity}</TableCell>
                                        <TableCell className="text-xs">
                                            {CONSUMPTION_REASONS.find(r => r.value === record.reason)?.label || record.reason}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {new Date(record.date).toLocaleDateString("ar-SA")}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Consumption Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record Consumption / تسجيل استهلاك</DialogTitle>
                    </DialogHeader>

                    {selectedItem && (
                        <div className="space-y-4">
                            <div className="p-3 bg-muted rounded-lg">
                                <div className="font-medium">{selectedItem.productName}</div>
                                <div className="text-sm text-muted-foreground">
                                    Available / متوفر: <span className="font-bold text-foreground">{selectedItem.currentStock}</span> {selectedItem.unit}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Quantity / الكمية</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    max={selectedItem.currentStock}
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="Enter quantity..."
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Reason / السبب</Label>
                                <Select value={reason} onValueChange={setReason}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONSUMPTION_REASONS.map(r => (
                                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Notes (Optional) / ملاحظات</Label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Add notes..."
                                    rows={2}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel / إلغاء
                        </Button>
                        <Button onClick={handleSubmitConsumption} disabled={isSubmitting}>
                            {isSubmitting ? "..." : "Confirm / تأكيد"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
