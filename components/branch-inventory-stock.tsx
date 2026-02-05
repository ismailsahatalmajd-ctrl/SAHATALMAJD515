"use client"

import { useState, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import type { BranchInventory } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ProductImageThumbnail } from "@/components/ui/product-image-thumbnail"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package, Search, AlertTriangle, TrendingDown, ArrowLeft } from "lucide-react"
import { DualText } from "@/components/ui/dual-text"
import { SmartRestockWidget } from "@/components/analytics/restock-alerts"

interface BranchInventoryStockProps {
    branchId: string
    onBack?: () => void
}

export function BranchInventoryStock({ branchId, onBack }: BranchInventoryStockProps) {
    const [searchQuery, setSearchQuery] = useState("")

    // Get branch inventory from Dexie
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

    // Filter inventory based on search and enrich with images if missing
    const filteredInventory = useMemo(() => {
        let items = inventory

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            items = inventory.filter(item =>
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

    // Calculate stats
    const stats = useMemo(() => {
        const totalItems = inventory.length
        const lowStockItems = inventory.filter(i =>
            i.minStockLimit && i.currentStock <= i.minStockLimit
        ).length
        const outOfStockItems = inventory.filter(i => i.currentStock <= 0).length
        const totalValue = inventory.reduce((sum, i) => sum + i.currentStock, 0)
        return { totalItems, lowStockItems, outOfStockItems, totalValue }
    }, [inventory])

    const getStockStatus = (item: BranchInventory) => {
        if (item.currentStock <= 0) return { label: "نفذ / Out", color: "destructive" as const }
        if (item.minStockLimit && item.currentStock <= item.minStockLimit) {
            return { label: "منخفض / Low", color: "warning" as const }
        }
        return { label: "متوفر / Available", color: "default" as const }
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
                        <Package className="w-5 h-5" />
                        Stock Balance / رصيد المخزون
                    </h2>
                </div>
            </div>

            {/* AI Prediction Widget */}
            <div className="mb-6">
                <SmartRestockWidget branchId={branchId} />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">{stats.totalItems}</div>
                        <div className="text-xs text-muted-foreground">Total Items / إجمالي الأصناف</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">{stats.totalValue}</div>
                        <div className="text-xs text-muted-foreground">Total Units / إجمالي الوحدات</div>
                    </CardContent>
                </Card>
                <Card className={stats.lowStockItems > 0 ? "border-yellow-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">{stats.lowStockItems}</div>
                        <div className="text-xs text-muted-foreground">Low Stock / مخزون منخفض</div>
                    </CardContent>
                </Card>
                <Card className={stats.outOfStockItems > 0 ? "border-red-500" : ""}>
                    <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.outOfStockItems}</div>
                        <div className="text-xs text-muted-foreground">Out of Stock / نفذ</div>
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

            {/* Inventory Table */}
            {filteredInventory.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No inventory items</p>
                        <p className="text-sm">لا توجد أصناف في المخزون</p>
                        <p className="text-xs mt-2">Items will appear here when you receive products from the main warehouse</p>
                        <p className="text-xs">ستظهر الأصناف هنا عند استلام منتجات من المستودع الرئيسي</p>
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
                                    <TableHead>Code / الكود</TableHead>
                                    <TableHead className="text-center">Received / مستلم</TableHead>
                                    <TableHead className="text-center">Consumed / مستهلك</TableHead>
                                    <TableHead className="text-center">Current / الحالي</TableHead>
                                    <TableHead className="text-center">Status / الحالة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInventory.map((item, idx) => {
                                    const status = getStockStatus(item)
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                                            <TableCell>
                                                <ProductImageThumbnail
                                                    src={item.productImage}
                                                    alt={item.productName}
                                                    className="w-10 h-10"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-medium">{item.productName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{item.productCode || "-"}</TableCell>
                                            <TableCell className="text-center">{item.receivedTotal}</TableCell>
                                            <TableCell className="text-center text-red-600">{item.consumedTotal}</TableCell>
                                            <TableCell className="text-center font-bold">{item.currentStock}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={status.color === "warning" ? "secondary" : status.color as any}>{status.label}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
