"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { BranchInventory } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { ClipboardList, Search, ArrowLeft, Save, CheckCircle, AlertTriangle, Package } from "lucide-react"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"

interface BranchInventoryCountProps {
    branchId: string
    onBack?: () => void
}

interface CountEntry {
    inventoryId: string
    productName: string
    productCode?: string
    productImage?: string
    systemStock: number
    actualCount: number | null
    difference: number
}

export function BranchInventoryCount({ branchId, onBack }: BranchInventoryCountProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [counts, setCounts] = useState<Record<string, number | null>>({})
    const [isSaving, setIsSaving] = useState(false)

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

    // Filter inventory based on search
    const filteredInventory = useMemo(() => {
        if (!searchQuery.trim()) return inventory
        const q = searchQuery.toLowerCase()
        return inventory.filter(item =>
            item.productName.toLowerCase().includes(q) ||
            (item.productCode?.toLowerCase().includes(q))
        )
    }, [inventory, searchQuery])

    // Build count entries
    const countEntries: CountEntry[] = useMemo(() => {
        return filteredInventory.map(item => {
            // Enrich with image from product key if missing
            let productImage = item.productImage
            if (!productImage && item.productId && productMap[item.productId]) {
                productImage = productMap[item.productId].image
            }

            const actualCount = counts[item.id] ?? null
            const difference = actualCount !== null ? actualCount - item.currentStock : 0

            return {
                inventoryId: item.id,
                productName: item.productName,
                productCode: item.productCode,
                productImage: productImage,
                systemStock: item.currentStock,
                actualCount,
                difference
            }
        })
    }, [filteredInventory, counts, productMap])

    // Stats
    const stats = useMemo(() => {
        const total = countEntries.length
        const counted = countEntries.filter(e => e.actualCount !== null).length
        const withDifference = countEntries.filter(e => e.actualCount !== null && e.difference !== 0).length
        return { total, counted, withDifference }
    }, [countEntries])

    const handleCountChange = (inventoryId: string, value: string) => {
        const num = value === "" ? null : Number(value)
        setCounts(prev => ({ ...prev, [inventoryId]: num }))
    }

    const handleSaveCount = async () => {
        const now = new Date().toISOString()
        const updates = countEntries.filter(e => e.actualCount !== null)

        if (updates.length === 0) {
            toast({ title: "لا يوجد جرد", description: "الرجاء إدخال كميات الجرد أولاً", variant: "destructive" })
            return
        }

        setIsSaving(true)
        try {
            for (const entry of updates) {
                if (entry.actualCount === null) continue
                await db.branchInventory.update(entry.inventoryId, {
                    lastInventoryCount: entry.actualCount,
                    lastInventoryDate: now,
                    updatedAt: now
                })
            }

            toast({
                title: "تم حفظ الجرد",
                description: `تم تحديث ${updates.length} صنف`
            })

            setCounts({})
        } catch (error) {
            console.error("Save count error:", error)
            toast({ title: "خطأ", description: "فشل حفظ الجرد", variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    const getDifferenceDisplay = (diff: number) => {
        if (diff === 0) return <Badge variant="secondary">0</Badge>
        if (diff > 0) return <Badge variant="default" className="bg-green-600">+{diff}</Badge>
        return <Badge variant="destructive">{diff}</Badge>
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <Button variant="ghost" size="sm" onClick={onBack}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    )}
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <ClipboardList className="w-5 h-5" />
                        Inventory Count / الجرد
                    </h2>
                </div>
                <Button onClick={handleSaveCount} disabled={isSaving || stats.counted === 0}>
                    <Save className="w-4 h-4 ml-2" />
                    {isSaving ? "جاري الحفظ..." : `حفظ الجرد (${stats.counted})`}
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">Total Items / إجمالي الأصناف</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">{stats.counted}</div>
                        <div className="text-xs text-muted-foreground">Counted / تم جردها</div>
                    </CardContent>
                </Card>
                <Card className={stats.withDifference > 0 ? "border-yellow-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">{stats.withDifference}</div>
                        <div className="text-xs text-muted-foreground">With Difference / فروقات</div>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                    placeholder="Search products / ابحث عن منتج..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Count Table */}
            {countEntries.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No items to count</p>
                        <p className="text-xs">لا توجد أصناف للجرد</p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead className="w-[60px]">Image</TableHead>
                                    <TableHead>Product / المنتج</TableHead>
                                    <TableHead className="text-center w-[100px]">System / نظام</TableHead>
                                    <TableHead className="text-center w-[150px]">Actual / فعلي</TableHead>
                                    <TableHead className="text-center w-[100px]">Diff / فرق</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {countEntries.map((entry, idx) => (
                                    <TableRow key={entry.inventoryId}>
                                        <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                                        <TableCell>
                                            <ProductImageThumbnail
                                                src={entry.productImage}
                                                alt={entry.productName}
                                                className="w-10 h-10"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{entry.productName}</div>
                                            <div className="text-xs text-muted-foreground">{entry.productCode}</div>
                                        </TableCell>
                                        <TableCell className="text-center font-bold">{entry.systemStock}</TableCell>
                                        <TableCell className="text-center">
                                            <Input
                                                type="number"
                                                min="0"
                                                value={entry.actualCount ?? ""}
                                                onChange={(e) => handleCountChange(entry.inventoryId, e.target.value)}
                                                placeholder="..."
                                                className="w-24 text-center mx-auto"
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {entry.actualCount !== null && getDifferenceDisplay(entry.difference)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
